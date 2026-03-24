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

/**
 * Always-on data store for stable mock data across requests.
 * Manages array pools, per-ID write entries, and deleted-ID tracking.
 */
interface MockEntry<T> {
  data: T;
  createdAt: number;
}

export class MockDataStore {
  private pools: Map<string, MockEntry<Record<string, unknown>[]>> = new Map();
  private writeStore: Map<string, Map<string, Record<string, unknown>>> = new Map();
  private deletedIds: Map<string, Set<string>> = new Map();

  private key(typeName: string, filePath: string): string {
    return `${filePath}::${typeName}`;
  }

  getPool(typeName: string, filePath: string): Record<string, unknown>[] | undefined {
    return this.pools.get(this.key(typeName, filePath))?.data;
  }

  setPool(typeName: string, filePath: string, data: Record<string, unknown>[]): void {
    this.pools.set(this.key(typeName, filePath), { data, createdAt: Date.now() });
  }

  // --- Write store methods ---

  getById(typeName: string, filePath: string, id: string): Record<string, unknown> | undefined {
    return this.writeStore.get(this.key(typeName, filePath))?.get(id);
  }

  setById(typeName: string, filePath: string, id: string, obj: Record<string, unknown>): void {
    const k = this.key(typeName, filePath);
    if (!this.writeStore.has(k)) {
      this.writeStore.set(k, new Map());
    }
    this.writeStore.get(k)!.set(id, obj);
  }

  markDeleted(typeName: string, filePath: string, id: string): void {
    const k = this.key(typeName, filePath);
    if (!this.deletedIds.has(k)) {
      this.deletedIds.set(k, new Set());
    }
    this.deletedIds.get(k)!.add(id);
    // Remove from write store if present
    this.writeStore.get(k)?.delete(id);
  }

  getDeletedIds(typeName: string, filePath: string): Set<string> {
    return this.deletedIds.get(this.key(typeName, filePath)) ?? new Set();
  }

  getAllWriteEntries(typeName: string, filePath: string): Map<string, Record<string, unknown>> {
    return this.writeStore.get(this.key(typeName, filePath)) ?? new Map();
  }

  getWriteStats(): Record<string, { count: number; deletedCount: number }> {
    const stats: Record<string, { count: number; deletedCount: number }> = {};
    for (const [k, map] of this.writeStore.entries()) {
      // key format is "filePath::typeName"
      const typeName = k.split('::').at(-1) ?? k;
      stats[typeName] = {
        count: map.size,
        deletedCount: this.deletedIds.get(k)?.size ?? 0,
      };
    }
    for (const [k, ids] of this.deletedIds.entries()) {
      const typeName = k.split('::').at(-1) ?? k;
      if (!stats[typeName]) {
        stats[typeName] = { count: 0, deletedCount: ids.size };
      }
    }
    return stats;
  }

  // --- File invalidation & lifecycle ---

  invalidateFile(filePath: string): void {
    let count = 0;
    for (const key of this.pools.keys()) {
      if (key.startsWith(`${filePath}::`)) {
        this.pools.delete(key);
        count++;
      }
    }
    for (const key of this.writeStore.keys()) {
      if (key.startsWith(`${filePath}::`)) {
        this.writeStore.delete(key);
        count++;
      }
    }
    for (const key of this.deletedIds.keys()) {
      if (key.startsWith(`${filePath}::`)) {
        this.deletedIds.delete(key);
      }
    }
    if (count > 0) {
      logger.info(`MockDataStore invalidated: ${count} entry/entries from ${filePath}`);
    }
  }

  clear(): { pools: number } {
    const pools = this.pools.size;
    this.pools.clear();
    this.writeStore.clear();
    this.deletedIds.clear();
    logger.info(`MockDataStore cleared: ${pools} pool(s)`);
    return { pools };
  }

  getStats(): { pools: number } {
    return { pools: this.pools.size };
  }
}

export const mockDataStore = new MockDataStore();
