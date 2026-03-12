import * as fs from 'fs';
import * as path from 'path';
import { RouteTypeMapping, InterfaceMetadata } from '../types/config';
import { parseUrlSegments, isIdSegment, urlSegmentToTypeName } from './pluralize';

/**
 * Recursively scans a directory to find all .ts files
 */
export function findTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];

  function scan(currentDir: string): void {
    if (!fs.existsSync(currentDir)) {
      return;
    }

    const stat = fs.statSync(currentDir);

    // If a file path was provided, add it directly (supports passing file paths)
    if (stat.isFile()) {
      if (currentDir.endsWith('.ts')) {
        files.push(currentDir);
      }
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
 * Extracts all exported interface names from a TypeScript file with endpoint flags
 * Detects // @endpoint comments before interface declarations
 */
export function extractInterfaceNames(filePath: string): InterfaceMetadata[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const metadata: InterfaceMetadata[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] || '';
    const interfaceMatch = /export\s+interface\s+(\w+)/.exec(line);

    if (interfaceMatch && interfaceMatch[1]) {
      const interfaceName = interfaceMatch[1];
      
      // Check preceding lines for @endpoint flag, skipping blank lines and comments
      let hasEndpointFlag = false;
      if (i > 0) {
        const maxLookback = 10;
        for (let j = i - 1; j >= 0 && i - j <= maxLookback; j--) {
          const prevLineRaw = lines[j] || '';
          const prevLine = prevLineRaw.trim();
          // Skip empty lines
          if (prevLine === '') {
            continue;
          }
          const isLineComment = prevLine.startsWith('//');
          const isBlockCommentPart =
            prevLine.startsWith('/**') ||
            prevLine.startsWith('/*') ||
            prevLine.startsWith('*') ||
            prevLine.startsWith('*/');
          if (isLineComment || isBlockCommentPart) {
            // Treat any comment line containing @endpoint as the flag
            if (prevLine.includes('@endpoint')) {
              hasEndpointFlag = true;
              break;
            }
            // Continue scanning upwards through comment/JSDoc lines
            continue;
          }
          // Reached a non-comment, non-blank line; stop scanning
          break;
        }
      }

      metadata.push({
        name: interfaceName,
        hasEndpointFlag,
      });
    }
  }

  return metadata;
}

/**
 * Creates a mapping of all available types
 * Only includes interfaces marked with // @endpoint
 * Map<TypeName, FilePath>
 */
export function buildTypeMap(directory: string): Map<string, string> {
  const typeMap = new Map<string, string>();

  const files = findTypeScriptFiles(directory);

  for (const file of files) {
    const interfaceMetadata = extractInterfaceNames(file);

    for (const metadata of interfaceMetadata) {
      // Only include interfaces marked with // @endpoint
      if (metadata.hasEndpointFlag && !typeMap.has(metadata.name)) {
        typeMap.set(metadata.name, file);
      }
    }
  }

  return typeMap;
}

/**
 * Finds the type corresponding to a URL
 * Only finds types marked with // @endpoint
 *
 * @param url - Request URL
 * @param directory - Directory containing type definitions
 * @returns Route -> type mapping or null if not found
 */
export function findTypeForUrl(
  url: string,
  directory: string
): RouteTypeMapping | null {
  const typeMap = buildTypeMap(directory);
  const segments = parseUrlSegments(url);
  const kinds = segments.map(s => isIdSegment(s) ? 'id' : 'col');

  // Reject URLs starting with an ID
  if (kinds.length > 0 && kinds[0] === 'id') return null;

  const shape = kinds.join('-');

  // Pattern: /collection → array (plural collection names only)
  if (shape === 'col') {
    const { typeName, isArray } = urlSegmentToTypeName(segments[0]!);
    if (!isArray) return null; // reject singular collection names (e.g. /user)
    const filePath = typeMap.get(typeName);
    return filePath ? { typeName, isArray: true, filePath } : null;
  }

  // Pattern: /collection/{id} → single
  if (shape === 'col-id') {
    const { typeName } = urlSegmentToTypeName(segments[0]!);
    const filePath = typeMap.get(typeName);
    return filePath ? { typeName, isArray: false, filePath } : null;
  }

  // Pattern: /collection/{id}/sub-collection → array (parent-scoped)
  if (shape === 'col-id-col') {
    const { typeName, isArray } = urlSegmentToTypeName(segments[2]!);
    if (!isArray) return null; // reject singular sub-collection names
    const filePath = typeMap.get(typeName);
    return filePath ? { typeName, isArray: true, filePath } : null;
  }

  // Everything else (col-id-col-id, col-col, etc.) → 404
  return null;
}
