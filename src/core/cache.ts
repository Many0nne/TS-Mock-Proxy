import { ParsedSchema } from '../types/config';
import { logger } from '../utils/logger';

/**
 * In-memory cache for parsed TypeScript schemas
 */
export class SchemaCache {
  private cache: Map<string, ParsedSchema> = new Map();
  private enabled: boolean;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
  }

  /**
   * Generates a cache key from the interface name and file
   */
  private generateKey(interfaceName: string, filePath: string): string {
    return `${filePath}::${interfaceName}`;
  }

  /**
   * Retrieves a schema from the cache
   */
  get(interfaceName: string, filePath: string): ParsedSchema | undefined {
    if (!this.enabled) {
      return undefined;
    }

    const key = this.generateKey(interfaceName, filePath);
    const cached = this.cache.get(key);

    if (cached) {
      logger.debug(`Cache HIT: ${interfaceName} from ${filePath}`);
    }

    return cached;
  }

  /**
   * Stores a schema in the cache
   */
  set(
    interfaceName: string,
    filePath: string,
    schema: Record<string, unknown>
  ): void {
    if (!this.enabled) {
      return;
    }

    const key = this.generateKey(interfaceName, filePath);
    const parsedSchema: ParsedSchema = {
      interfaceName,
      filePath,
      schema,
      lastUpdated: Date.now(),
    };

    this.cache.set(key, parsedSchema);
    logger.debug(`Cache SET: ${interfaceName} from ${filePath}`);
  }

  /**
   * Invalidates the cache for a specific file
   */
  invalidateFile(filePath: string): void {
    let count = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.filePath === filePath) {
        this.cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.info(`Cache invalidated: ${count} schema(s) from ${filePath}`);
    }
  }

  /**
   * Clears the cache completely
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.info(`Cache cleared: ${size} schema(s) removed`);
  }

  /**
   * Returns the number of items in cache
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics
   */
  getStats(): {
    size: number;
    enabled: boolean;
    schemas: Array<{ interfaceName: string; filePath: string; age: number }>;
  } {
    const schemas = Array.from(this.cache.values()).map((schema) => ({
      interfaceName: schema.interfaceName,
      filePath: schema.filePath,
      age: Date.now() - schema.lastUpdated,
    }));

    return {
      size: this.cache.size,
      enabled: this.enabled,
      schemas,
    };
  }
}

// Global cache instance
export const schemaCache = new SchemaCache();
