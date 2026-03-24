import * as fs from 'fs';
import * as ts from 'typescript';
import { ServerConfig } from '../types/config';
import { buildTypeMap } from '../utils/typeMapping';
import pluralize from 'pluralize';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './queryProcessor';

interface OpenAPISchema {
  type: string;
  properties?: Record<string, unknown>;
  items?: unknown;
  format?: string;
  enum?: string[];
}

type OpenAPIParameter =
  | { $ref: string }
  | {
      name: string;
      in: string;
      description: string;
      required: boolean;
      schema: Record<string, unknown>;
    };

interface OpenAPIPath {
  summary: string;
  description: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    required: boolean;
    content: {
      'application/json': {
        schema: unknown;
      };
    };
  };
  responses: {
    [statusCode: string]: {
      description: string;
      content?: {
        'application/json': {
          schema: unknown;
        };
      };
      headers?: Record<string, { schema: { type: string } }>;
    };
  };
}

/**
 * Extracts interface properties from a TypeScript file using the compiler API.
 * Handles readonly properties, optional fields, nested objects, and generic types
 * correctly — unlike the previous regex-based approach.
 */
function extractInterfaceProperties(filePath: string, interfaceName: string): Record<string, OpenAPISchema> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);
  const properties: Record<string, OpenAPISchema> = {};

  function visit(node: ts.Node): void {
    if (
      ts.isInterfaceDeclaration(node) &&
      node.name.text === interfaceName
    ) {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
          const propName = member.name.text;
          const isOptional = member.questionToken !== undefined;
          const typeStr = member.type ? member.type.getText(sourceFile) : 'unknown';
          properties[propName] = typeToOpenAPISchema(typeStr.trim(), isOptional);
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
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
      // For complex types (nested objects or generics like Record<K,V>)
      if (baseType.includes('{') || baseType.includes('<')) {
        return { type: 'object' };
      }
      // For enums or other references
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
 * Builds the list of query parameters for an array endpoint:
 * standard pagination/sort refs + field-specific filter parameters.
 */
function buildListParameters(
  properties: Record<string, OpenAPISchema>
): OpenAPIParameter[] {
  const params: OpenAPIParameter[] = [
    { $ref: '#/components/parameters/page' },
    { $ref: '#/components/parameters/pageSize' },
    { $ref: '#/components/parameters/sort' },
  ];

  for (const [field, schema] of Object.entries(properties)) {
    const isDate = schema.format === 'date-time';
    const isString = schema.type === 'string' && !isDate;
    const isNumber = schema.type === 'number';
    const isBoolean = schema.type === 'boolean';

    // Exact match — works for string, number, boolean
    if (isString || isNumber || isBoolean || isDate) {
      params.push({
        name: field,
        in: 'query',
        description: `Exact match filter on \`${field}\``,
        required: false,
        schema: isDate ? { type: 'string', format: 'date-time' } : { type: schema.type },
      });
    }

    // _contains — substring match (non-date strings only)
    if (isString) {
      params.push({
        name: `${field}_contains`,
        in: 'query',
        description: `Case-insensitive substring filter on \`${field}\``,
        required: false,
        schema: { type: 'string' },
      });
    }

    // _gte / _lte — range filters for dates and numbers
    if (isDate) {
      params.push({
        name: `${field}_gte`,
        in: 'query',
        description: `Return items where \`${field}\` is on or after this date (ISO 8601)`,
        required: false,
        schema: { type: 'string', format: 'date-time' },
      });
      params.push({
        name: `${field}_lte`,
        in: 'query',
        description: `Return items where \`${field}\` is on or before this date (ISO 8601)`,
        required: false,
        schema: { type: 'string', format: 'date-time' },
      });
    }

    if (isNumber) {
      params.push({
        name: `${field}_gte`,
        in: 'query',
        description: `Return items where \`${field}\` is greater than or equal to this value`,
        required: false,
        schema: { type: 'number' },
      });
      params.push({
        name: `${field}_lte`,
        in: 'query',
        description: `Return items where \`${field}\` is less than or equal to this value`,
        required: false,
        schema: { type: 'number' },
      });
    }
  }

  return params;
}

/**
 * Generates OpenAPI specification from TypeScript interfaces
 */
export function generateOpenAPISpec(config: ServerConfig): Record<string, unknown> {
  const typeMap = buildTypeMap(config.typesDir);

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

    const arrayPath = interfaceNameToPath(interfaceName);
    const singlePath = `${arrayPath}/{id}`;

    const wm = config.writeMethods;
    const postEnabled   = !wm || wm.post   !== false;
    const putEnabled    = !wm || wm.put    !== false;
    const patchEnabled  = !wm || wm.patch  !== false;
    const deleteEnabled = !wm || wm.delete !== false;

    const idParameter = {
      name: 'id',
      in: 'path',
      description: `ID of the ${interfaceName} (numeric, UUID, or MongoDB ObjectId)`,
      required: true,
      schema: { type: 'string' },
    };

    const errorContent = (description: string) => ({
      description,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
    });

    // --- Collection path: GET + optional POST ---
    const collectionPath: Record<string, OpenAPIPath> = {
      get: {
        summary: `List ${pluralize(interfaceName)}`,
        description: `Returns a paginated list of \`${interfaceName}\` objects. Supports filtering, sorting, and pagination via query parameters.`,
        parameters: buildListParameters(properties),
        responses: {
          '200': {
            description: 'Successful response',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: {
                      type: 'array',
                      items: { $ref: `#/components/schemas/${interfaceName}` },
                    },
                    meta: { $ref: '#/components/schemas/PaginationMeta' },
                  },
                },
              },
            },
          },
          '400': errorContent('Invalid query parameters'),
          '404': errorContent('Type not found'),
        },
      },
    };

    if (postEnabled) {
      collectionPath['post'] = {
        summary: `Create a ${interfaceName}`,
        description:
          `Creates a new \`${interfaceName}\`. The server generates a full mock and overrides it with matching fields from the request body. Extra fields not defined in the interface are silently ignored.`,
        requestBody: {
          required: false,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } },
          },
        },
        responses: {
          '201': {
            description: 'Created',
            headers: { Location: { schema: { type: 'string' } } },
            content: {
              'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } },
            },
          },
          '400': errorContent('Invalid request body'),
          '405': errorContent('Method not allowed'),
        },
      };
    }

    paths[arrayPath] = collectionPath as unknown as Record<string, OpenAPIPath>;

    // --- Partial schema for PATCH (all fields optional) ---
    const partialProperties: Record<string, unknown> = {};
    for (const [field, schema] of Object.entries(properties)) {
      partialProperties[field] = schema;
    }
    const partialSchemaName = `${interfaceName}Partial`;
    schemas[partialSchemaName] = { type: 'object', properties: partialProperties };

    // --- Single-item path: GET + optional PUT/PATCH/DELETE ---
    const singleItemPath: Record<string, OpenAPIPath> = {
      get: {
        summary: `Get a single ${interfaceName}`,
        description: `Returns a single \`${interfaceName}\` object by ID. Only available for resources created via POST or PUT.`,
        parameters: [idParameter],
        responses: {
          '200': {
            description: 'Successful response',
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } } },
          },
          '404': errorContent('Resource not found'),
        },
      },
    };

    if (putEnabled) {
      singleItemPath['put'] = {
        summary: `Replace a ${interfaceName}`,
        description: `Full replacement (upsert). Creates the resource if it does not exist. Body fields override the generated mock.`,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } } },
          },
          '400': errorContent('Missing or invalid request body'),
          '405': errorContent('Method not allowed'),
        },
      };
    }

    if (patchEnabled) {
      singleItemPath['patch'] = {
        summary: `Partially update a ${interfaceName}`,
        description: `Partial update. Merges provided fields onto the stored object. If the resource does not exist, upserts it.`,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: `#/components/schemas/${partialSchemaName}` } },
          },
        },
        responses: {
          '200': {
            description: 'Updated',
            content: { 'application/json': { schema: { $ref: `#/components/schemas/${interfaceName}` } } },
          },
          '400': errorContent('Missing or invalid request body'),
          '405': errorContent('Method not allowed'),
        },
      };
    }

    if (deleteEnabled) {
      singleItemPath['delete'] = {
        summary: `Delete a ${interfaceName}`,
        description: `Marks the resource as deleted. Subsequent GET requests for this ID return 404.`,
        parameters: [idParameter],
        responses: {
          '204': { description: 'No Content' },
          '405': errorContent('Method not allowed'),
        },
      };
    }

    paths[singlePath] = singleItemPath as unknown as Record<string, OpenAPIPath>;
  });

  // Add mock-reset endpoint
  paths['/mock-reset'] = {
    post: {
      summary: 'Rebuild mock data',
      description:
        'Clears all cached mock data (single objects and array pools). ' +
        'Fresh data is regenerated on the next requests.',
      responses: {
        '200': {
          description: 'Data store cleared',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  message: { type: 'string' },
                  cleared: {
                    type: 'object',
                    properties: {
                      pools: { type: 'integer', description: 'Number of array pool entries cleared' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

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
      schemas: {
        ...schemas,
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', description: 'Total number of items matching the filters' },
            page: { type: 'integer', description: 'Current page number' },
            pageSize: { type: 'integer', description: 'Number of items per page' },
            totalPages: { type: 'integer', description: 'Total number of pages' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
      parameters: {
        'x-mock-status': {
          name: 'x-mock-status',
          in: 'header',
          description: 'Force a specific HTTP status code for this request',
          required: false,
          schema: { type: 'integer', example: 500 },
        },
        page: {
          name: 'page',
          in: 'query',
          description: 'Page number (1-based)',
          required: false,
          schema: { type: 'integer', minimum: 1, default: 1 },
        },
        pageSize: {
          name: 'pageSize',
          in: 'query',
          description: `Number of items per page (max ${MAX_PAGE_SIZE})`,
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
        },
        sort: {
          name: 'sort',
          in: 'query',
          description:
            'Comma-separated sort fields. Each entry is `field:asc` or `field:desc`. ' +
            'Example: `sort=name:asc,createdAt:desc`',
          required: false,
          schema: { type: 'string', example: 'name:asc' },
        },
      },
    },
  };
}
