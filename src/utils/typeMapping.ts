import * as fs from 'fs';
import * as path from 'path';
import { RouteTypeMapping } from '../types/config';
import { parseUrlToType } from './pluralize';

/**
 * Recursively scans a directory to find all .ts files
 */
export function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function scan(currentDir: string): void {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        // Ignore node_modules and other system directories
        if (!['node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
          scan(fullPath);
        }
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }

  scan(dir);
  return files;
}

/**
 * Extracts all exported interface names from a TypeScript file
 * Uses a simple regex approach (can be improved with an AST parser)
 */
export function extractInterfaceNames(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const interfaceRegex = /export\s+interface\s+(\w+)/g;
  const matches: string[] = [];
  let match;

  while ((match = interfaceRegex.exec(content)) !== null) {
    if (match[1]) {
      matches.push(match[1]);
    }
  }

  return matches;
}

/**
 * Creates a mapping of all available types
 * Map<TypeName, FilePath>
 */
export function buildTypeMap(directories: string[]): Map<string, string> {
  const typeMap = new Map<string, string>();

  // Scan all directories (contracts + external dirs)
  for (const dir of directories) {
    const files = findTypeScriptFiles(dir);

    for (const file of files) {
      const interfaces = extractInterfaceNames(file);
      for (const interfaceName of interfaces) {
        // If the type already exists, keep the first one found
        // (local contracts have priority)
        if (!typeMap.has(interfaceName)) {
          typeMap.set(interfaceName, file);
        }
      }
    }
  }

  return typeMap;
}

/**
 * Finds the type corresponding to a URL
 *
 * @param url - Request URL
 * @param directories - Directories containing contracts (local + external)
 * @returns Route -> type mapping or null if not found
 */
export function findTypeForUrl(
  url: string,
  directories: string[]
): RouteTypeMapping | null {
  const { typeName, isArray } = parseUrlToType(url);
  const typeMap = buildTypeMap(directories);

  const filePath = typeMap.get(typeName);

  if (!filePath) {
    return null;
  }

  return {
    typeName,
    isArray,
    filePath,
  };
}
