import * as fs from 'fs';
import { MockDataStore } from '../core/cache';
import { buildTypeMap } from './typeMapping';
import { logger } from './logger';

/**
 * Serializes the live pool of every @endpoint type to a JSON file via atomic write
 * (write to .tmp then rename — prevents corruption on interrupted writes).
 */
export function saveMockData(store: MockDataStore, typesDir: string, filePath: string): void {
  try {
    const typeMap = buildTypeMap(typesDir);
    const data: Record<string, Record<string, unknown>[]> = {};

    typeMap.forEach((typeFilePath, typeName) => {
      data[typeName] = store.getLivePool(typeName, typeFilePath);
    });

    const json = JSON.stringify(data, null, 2);
    const tmpPath = `${filePath}.tmp`;

    fs.writeFileSync(tmpPath, json, 'utf-8');
    fs.renameSync(tmpPath, filePath);

    const count = Object.keys(data).length;
    logger.info(`Mock data persisted to ${filePath} (${count} type(s))`);
  } catch (error) {
    logger.warn(`Failed to save mock data: ${error}`);
  }
}

/**
 * Loads mock data from a JSON persist file and replaces the in-memory pools for known types.
 * Unknown types are silently skipped (with a debug log).
 * Returns true if the file was loaded, false if absent or invalid (invalid files are NOT overwritten).
 */
export function loadMockData(store: MockDataStore, typesDir: string, filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    let parsed: unknown;

    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      logger.warn(`Failed to load mock data: ${parseError}`);
      return false;
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      logger.warn(`Failed to load mock data: root value must be an object`);
      return false;
    }

    const typeMap = buildTypeMap(typesDir);
    const data = parsed as Record<string, unknown>;
    let loadedCount = 0;

    for (const [typeName, items] of Object.entries(data)) {
      const typeFilePath = typeMap.get(typeName);
      if (!typeFilePath) {
        logger.debug(`Skipping unknown type "${typeName}" from persist file`);
        continue;
      }

      if (!Array.isArray(items)) {
        logger.debug(`Skipping type "${typeName}": expected array, got ${typeof items}`);
        continue;
      }

      store.setPool(typeName, typeFilePath, items as Record<string, unknown>[]);
      loadedCount++;
    }

    logger.info(`Mock data loaded from ${filePath} (${loadedCount} type(s))`);
    return true;
  } catch (error) {
    logger.warn(`Failed to load mock data: ${error}`);
    return false;
  }
}
