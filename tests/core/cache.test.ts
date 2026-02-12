import { SchemaCache } from '../../src/core/cache';

describe('SchemaCache', () => {
  let cache: SchemaCache;

  beforeEach(() => {
    cache = new SchemaCache(true);
  });

  describe('constructor', () => {
    it('should create an enabled cache by default', () => {
      const defaultCache = new SchemaCache();
      const stats = defaultCache.getStats();
      expect(stats.enabled).toBe(true);
    });

    it('should create a disabled cache when specified', () => {
      const disabledCache = new SchemaCache(false);
      const stats = disabledCache.getStats();
      expect(stats.enabled).toBe(false);
    });
  });

  describe('get and set', () => {
    it('should store and retrieve schema', () => {
      const mockSchema = { id: 1, name: 'Test' };
      cache.set('User', '/path/to/user.ts', mockSchema);

      const retrieved = cache.get('User', '/path/to/user.ts');
      expect(retrieved).toBeDefined();
      expect(retrieved?.schema).toEqual(mockSchema);
      expect(retrieved?.interfaceName).toBe('User');
      expect(retrieved?.filePath).toBe('/path/to/user.ts');
    });

    it('should return undefined for non-existent schema', () => {
      const retrieved = cache.get('NonExistent', '/path/to/file.ts');
      expect(retrieved).toBeUndefined();
    });

    it('should handle multiple schemas from different files', () => {
      const userSchema = { id: 1, name: 'User' };
      const productSchema = { id: 2, name: 'Product' };

      cache.set('User', '/path/to/user.ts', userSchema);
      cache.set('Product', '/path/to/product.ts', productSchema);

      expect(cache.get('User', '/path/to/user.ts')?.schema).toEqual(userSchema);
      expect(cache.get('Product', '/path/to/product.ts')?.schema).toEqual(productSchema);
    });

    it('should handle same interface name from different files', () => {
      const schema1 = { version: 1 };
      const schema2 = { version: 2 };

      cache.set('User', '/path/to/file1.ts', schema1);
      cache.set('User', '/path/to/file2.ts', schema2);

      expect(cache.get('User', '/path/to/file1.ts')?.schema).toEqual(schema1);
      expect(cache.get('User', '/path/to/file2.ts')?.schema).toEqual(schema2);
    });

    it('should not store when cache is disabled', () => {
      const disabledCache = new SchemaCache(false);
      const mockSchema = { id: 1 };

      disabledCache.set('User', '/path/to/user.ts', mockSchema);
      const retrieved = disabledCache.get('User', '/path/to/user.ts');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('invalidateFile', () => {
    it('should invalidate all schemas from a specific file', () => {
      cache.set('User', '/path/to/types.ts', { id: 1 });
      cache.set('Product', '/path/to/types.ts', { id: 2 });
      cache.set('Order', '/path/to/other.ts', { id: 3 });

      cache.invalidateFile('/path/to/types.ts');

      expect(cache.get('User', '/path/to/types.ts')).toBeUndefined();
      expect(cache.get('Product', '/path/to/types.ts')).toBeUndefined();
      expect(cache.get('Order', '/path/to/other.ts')).toBeDefined();
    });

    it('should handle invalidating non-existent file', () => {
      cache.set('User', '/path/to/user.ts', { id: 1 });
      expect(() => {
        cache.invalidateFile('/non/existent.ts');
      }).not.toThrow();
    });
  });

  describe('clear', () => {
    it('should clear all cached schemas', () => {
      cache.set('User', '/path/to/user.ts', { id: 1 });
      cache.set('Product', '/path/to/product.ts', { id: 2 });

      expect(cache.size()).toBe(2);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get('User', '/path/to/user.ts')).toBeUndefined();
      expect(cache.get('Product', '/path/to/product.ts')).toBeUndefined();
    });
  });

  describe('size', () => {
    it('should return correct cache size', () => {
      expect(cache.size()).toBe(0);

      cache.set('User', '/path/to/user.ts', {});
      expect(cache.size()).toBe(1);

      cache.set('Product', '/path/to/product.ts', {});
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      cache.set('User', '/path/to/user.ts', { id: 1 });
      cache.set('Product', '/path/to/product.ts', { id: 2 });

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.enabled).toBe(true);
      expect(stats.schemas).toHaveLength(2);
      expect(stats.schemas[0]).toHaveProperty('interfaceName');
      expect(stats.schemas[0]).toHaveProperty('filePath');
      expect(stats.schemas[0]).toHaveProperty('age');
      if (stats.schemas[0]) {
        expect(typeof stats.schemas[0].age).toBe('number');
      }
    });

    it('should calculate age correctly', () => {
      cache.set('User', '/path/to/user.ts', {});

      // Wait a bit to ensure age is greater than 0
      const stats = cache.getStats();

      if (stats.schemas[0]) {
        expect(stats.schemas[0].age).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return empty schemas array when cache is empty', () => {
      const stats = cache.getStats();

      expect(stats.size).toBe(0);
      expect(stats.schemas).toEqual([]);
    });
  });
});
