import * as fs from 'fs';
import { ServerConfig } from '../types/config';
import { buildTypeMap } from '../utils/typeMapping';
import pluralize from 'pluralize';

interface OpenAPISchema {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  format?: string;
  enum?: string[];
}

interface OpenAPIPath {
  summary: string;
  description: string;
  responses: {
    [statusCode: string]: {
      description: string;
      content: {
        'application/json': {
          schema: unknown;
        };
      };
    };
  };
  parameters?: Array<{
    name: string;
    in: string;
    description: string;
    required: boolean;
    schema: { type: string };
  }>;
}

/**
 * Extracts interface properties from TypeScript source code
 */
function extractInterfaceProperties(filePath: string, interfaceName: string): Record<string, OpenAPISchema> {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Find the interface definition
  const interfaceRegex = new RegExp(
    `export\\s+interface\\s+${interfaceName}\\s*{([^}]*)}`,
    's'
  );
  const match = content.match(interfaceRegex);

  if (!match || !match[1]) {
    return {};
  }

  const interfaceBody = match[1];
  const properties: Record<string, OpenAPISchema> = {};

  // Parse property lines
  const propertyRegex = /(\w+)(\?)?:\s*([^;]+);/g;
  let propMatch;

  while ((propMatch = propertyRegex.exec(interfaceBody)) !== null) {
    const [, propName, optional, propType] = propMatch;
    if (!propName || !propType) continue;

    const cleanType = propType.trim();
    properties[propName] = typeToOpenAPISchema(cleanType, optional === '?');
  }

  return properties;
}

/**
 * Converts TypeScript type to OpenAPI schema
 */
function typeToOpenAPISchema(tsType: string, _isOptional = false): OpenAPISchema {
  const baseType = tsType.replace(/\s+/g, '');

  // Array types
  if (baseType.endsWith('[]')) {
    const itemType = baseType.slice(0, -2);
    return {
      type: 'array',
      items: typeToOpenAPISchema(itemType),
    };
  }

  // Union types with null/undefined
  if (baseType.includes('|null') || baseType.includes('|undefined')) {
    const actualType = baseType.replace(/\|null|\|undefined/g, '');
    const schema = typeToOpenAPISchema(actualType, true);
    return { ...schema };
  }

  // Primitive types
  switch (baseType) {
    case 'string':
      return { type: 'string' };
    case 'number':
      return { type: 'number' };
    case 'boolean':
      return { type: 'boolean' };
    case 'Date':
      return { type: 'string', format: 'date-time' };
    case 'any':
    case 'unknown':
      return { type: 'object' };
    default:
      // For complex types or references, use object
      if (baseType.includes('{')) {
        return { type: 'object' };
      }
      // For enums or other types
      return { type: 'string' };
  }
}

/**
 * Converts an interface name to URL path
 * Example: "User" -> "/users"
 */
function interfaceNameToPath(interfaceName: string): string {
  // Convert PascalCase to kebab-case
  const kebab = interfaceName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  // Pluralize
  return `/${pluralize(kebab)}`;
}

/**
 * Generates OpenAPI specification from TypeScript interfaces
 */
export function generateOpenAPISpec(config: ServerConfig): Record<string, unknown> {
  const allDirs = [config.contractsDir, ...(config.externalDirs || [])];
  const typeMap = buildTypeMap(allDirs);

  const paths: Record<string, Record<string, OpenAPIPath>> = {};
  const schemas: Record<string, unknown> = {};

  // Generate paths and schemas for each interface
  typeMap.forEach((filePath, interfaceName) => {
    const properties = extractInterfaceProperties(filePath, interfaceName);

    // Create schema definition
    schemas[interfaceName] = {
      type: 'object',
      properties,
    };

    // Generate path for array endpoint
    const arrayPath = interfaceNameToPath(interfaceName);
    paths[arrayPath] = {
      get: {
        summary: `Get all ${pluralize(interfaceName)}`,
        description: `Returns an array of ${interfaceName} objects`,
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: `#/components/schemas/${interfaceName}`,
                  },
                },
              },
            },
          },
          '404': {
            description: 'Type not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    };

    // Generate path for single item endpoint
    const singularPath = `/${interfaceName.toLowerCase()}`;
    paths[singularPath] = {
      get: {
        summary: `Get a single ${interfaceName}`,
        description: `Returns a single ${interfaceName} object`,
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  $ref: `#/components/schemas/${interfaceName}`,
                },
              },
            },
          },
          '404': {
            description: 'Type not found',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    };
  });

  // Add health endpoint
  paths['/health'] = {
    get: {
      summary: 'Health check',
      description: 'Returns server health status and configuration',
      responses: {
        '200': {
          description: 'Server is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  uptime: { type: 'number' },
                  cache: { type: 'object' },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
  };

  return {
    openapi: '3.0.0',
    info: {
      title: 'TS Mock Proxy API',
      description: 'Auto-generated REST API from TypeScript interfaces',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://localhost:${config.port}`,
        description: 'Development server',
      },
    ],
    paths,
    components: {
      schemas,
      parameters: {
        'x-mock-status': {
          name: 'x-mock-status',
          in: 'header',
          description: 'Force a specific HTTP status code',
          required: false,
          schema: {
            type: 'integer',
            example: 500,
          },
        },
      },
    },
  };
}
