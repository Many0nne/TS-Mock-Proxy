import * as fs from 'fs';
import * as path from 'path';
import {
  findTypeScriptFiles,
  extractInterfaceNames,
  buildTypeMap,
  findTypeForUrl,
} from '../../src/utils/typeMapping';

describe('typeMapping', () => {
  const testDir = path.join(__dirname, 'test-files');

  beforeAll(() => {
    // Create test directory structure
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test TypeScript files
    fs.writeFileSync(
      path.join(testDir, 'user.ts'),
      `export interface User {
  id: number;
  name: string;
}

export interface UserProfile {
  userId: number;
  bio: string;
}`
    );

    fs.writeFileSync(
      path.join(testDir, 'product.ts'),
      `export interface Product {
  id: number;
  title: string;
}`
    );

    // Create a subdirectory
    const subDir = path.join(testDir, 'models');
    if (!fs.existsSync(subDir)) {
      fs.mkdirSync(subDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(subDir, 'order.ts'),
      `export interface Order {
  id: number;
  total: number;
}`
    );

    // Create a file without exported interfaces
    fs.writeFileSync(
      path.join(testDir, 'helper.ts'),
      `function helper() {
  return true;
}`
    );
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('findTypeScriptFiles', () => {
    it('should find all TypeScript files in directory', () => {
      const files = findTypeScriptFiles(testDir);

      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f) => f.endsWith('user.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('product.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('order.ts'))).toBe(true);
    });

    it('should find files in subdirectories', () => {
      const files = findTypeScriptFiles(testDir);
      const orderFile = files.find((f) => f.endsWith('order.ts'));

      expect(orderFile).toBeDefined();
      expect(orderFile).toContain('models');
    });

    it('should return empty array for non-existent directory', () => {
      const files = findTypeScriptFiles('/non/existent/path');
      expect(files).toEqual([]);
    });

    it('should not include node_modules', () => {
      const nodeModulesDir = path.join(testDir, 'node_modules');
      fs.mkdirSync(nodeModulesDir, { recursive: true });
      fs.writeFileSync(path.join(nodeModulesDir, 'test.ts'), 'export interface Test {}');

      const files = findTypeScriptFiles(testDir);

      expect(files.some((f) => f.includes('node_modules'))).toBe(false);

      fs.rmSync(nodeModulesDir, { recursive: true, force: true });
    });
  });

  describe('extractInterfaceNames', () => {
    it('should extract interface names from file', () => {
      const userFile = path.join(testDir, 'user.ts');
      const interfaces = extractInterfaceNames(userFile);

      expect(interfaces).toContain('User');
      expect(interfaces).toContain('UserProfile');
      expect(interfaces.length).toBe(2);
    });

    it('should extract interface from simple file', () => {
      const productFile = path.join(testDir, 'product.ts');
      const interfaces = extractInterfaceNames(productFile);

      expect(interfaces).toContain('Product');
      expect(interfaces.length).toBe(1);
    });

    it('should return empty array for file without interfaces', () => {
      const helperFile = path.join(testDir, 'helper.ts');
      const interfaces = extractInterfaceNames(helperFile);

      expect(interfaces).toEqual([]);
    });
  });

  describe('buildTypeMap', () => {
    it('should build type map from directory', () => {
      const typeMap = buildTypeMap([testDir]);

      expect(typeMap.has('User')).toBe(true);
      expect(typeMap.has('UserProfile')).toBe(true);
      expect(typeMap.has('Product')).toBe(true);
      expect(typeMap.has('Order')).toBe(true);
    });

    it('should map types to their file paths', () => {
      const typeMap = buildTypeMap([testDir]);
      const userPath = typeMap.get('User');

      expect(userPath).toBeDefined();
      expect(userPath).toContain('user.ts');
    });

    it('should handle multiple directories', () => {
      const typeMap = buildTypeMap([testDir, path.join(testDir, 'models')]);

      expect(typeMap.has('User')).toBe(true);
      expect(typeMap.has('Order')).toBe(true);
    });

    it('should prioritize first occurrence for duplicate types', () => {
      // Create two separate directories at same level
      const dir1 = path.join(__dirname, 'test-priority-1');
      const dir2 = path.join(__dirname, 'test-priority-2');

      fs.mkdirSync(dir1, { recursive: true });
      fs.mkdirSync(dir2, { recursive: true });

      fs.writeFileSync(
        path.join(dir1, 'duplicate.ts'),
        'export interface DuplicateType { first: true; }'
      );

      fs.writeFileSync(
        path.join(dir2, 'duplicate.ts'),
        'export interface DuplicateType { second: true; }'
      );

      // When buildTypeMap is called with dir1 first, it should prioritize dir1
      const typeMap = buildTypeMap([dir1, dir2]);
      const duplicatePath = typeMap.get('DuplicateType');

      // Should use the first occurrence (from dir1)
      expect(duplicatePath).toBe(path.join(dir1, 'duplicate.ts'));

      fs.rmSync(dir1, { recursive: true, force: true });
      fs.rmSync(dir2, { recursive: true, force: true });
    });
  });

  describe('findTypeForUrl', () => {
    it('should find type for plural URL', () => {
      const result = findTypeForUrl('/api/users', [testDir]);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('User');
      expect(result?.isArray).toBe(true);
      expect(result?.filePath).toContain('user.ts');
    });

    it('should find type for singular URL', () => {
      const result = findTypeForUrl('/api/product', [testDir]);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('Product');
      expect(result?.isArray).toBe(false);
      expect(result?.filePath).toContain('product.ts');
    });

    it('should return null for non-existent type', () => {
      const result = findTypeForUrl('/api/non-existent', [testDir]);

      expect(result).toBeNull();
    });

    it('should handle nested URLs', () => {
      const result = findTypeForUrl('/api/v1/orders', [testDir]);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('Order');
      expect(result?.isArray).toBe(true);
    });

    it('should handle hyphenated URLs', () => {
      const result = findTypeForUrl('/api/user-profiles', [testDir]);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('UserProfile');
      expect(result?.isArray).toBe(true);
    });
  });
});
