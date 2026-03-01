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
      `// @endpoint
export interface User {
  id: number;
  name: string;
}

// @endpoint
export interface UserProfile {
  userId: number;
  bio: string;
}`
    );

    fs.writeFileSync(
      path.join(testDir, 'product.ts'),
      `// @endpoint
export interface Product {
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
      `// @endpoint
export interface Order {
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

      expect(interfaces.length).toBe(2);
      expect(interfaces.some((i) => i.name === 'User')).toBe(true);
      expect(interfaces.some((i) => i.name === 'UserProfile')).toBe(true);
      expect(interfaces.every((i) => i.hasEndpointFlag === true)).toBe(true);
    });

    it('should extract interface from simple file', () => {
      const productFile = path.join(testDir, 'product.ts');
      const interfaces = extractInterfaceNames(productFile);

      expect(interfaces.length).toBe(1);
      expect(interfaces[0]!.name).toBe('Product');
      expect(interfaces[0]!.hasEndpointFlag).toBe(true);
    });

    it('should return empty array for file without interfaces', () => {
      const helperFile = path.join(testDir, 'helper.ts');
      const interfaces = extractInterfaceNames(helperFile);

      expect(interfaces).toEqual([]);
    });

    it('should detect endpoint flags correctly', () => {
      const testFile = path.join(testDir, 'flagged-test.ts');
      fs.writeFileSync(
        testFile,
        `// @endpoint
export interface WithFlag {
  id: number;
}

export interface WithoutFlag {
  id: number;
}`
      );

      const interfaces = extractInterfaceNames(testFile);

      expect(interfaces.length).toBe(2);
      expect(interfaces.find((i) => i.name === 'WithFlag')?.hasEndpointFlag).toBe(true);
      expect(interfaces.find((i) => i.name === 'WithoutFlag')?.hasEndpointFlag).toBe(false);

      fs.rmSync(testFile);
    });
  });

  describe('buildTypeMap', () => {
    it('should build type map from directory', () => {
      const typeMap = buildTypeMap(testDir);

      expect(typeMap.has('User')).toBe(true);
      expect(typeMap.has('UserProfile')).toBe(true);
      expect(typeMap.has('Product')).toBe(true);
      expect(typeMap.has('Order')).toBe(true);
    });

    it('should map types to their file paths', () => {
      const typeMap = buildTypeMap(testDir);
      const userPath = typeMap.get('User');

      expect(userPath).toBeDefined();
      expect(userPath).toContain('user.ts');
    });

    it('should only include interfaces marked with // @endpoint', () => {
      const testFile = path.join(testDir, 'endpoint-filter-test.ts');
      fs.writeFileSync(
        testFile,
        `// @endpoint
export interface Exposed {
  id: number;
}

export interface Hidden {
  id: number;
}`
      );

      const typeMap = buildTypeMap(testDir);

      expect(typeMap.has('Exposed')).toBe(true);
      expect(typeMap.has('Hidden')).toBe(false);

      fs.rmSync(testFile);
    });
  });

  describe('findTypeForUrl', () => {
    it('should find type for plural URL', () => {
      const result = findTypeForUrl('/api/users', testDir);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('User');
      expect(result?.isArray).toBe(true);
      expect(result?.filePath).toContain('user.ts');
    });

    it('should find type for singular URL', () => {
      const result = findTypeForUrl('/api/product', testDir);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('Product');
      expect(result?.isArray).toBe(false);
      expect(result?.filePath).toContain('product.ts');
    });

    it('should return null for non-existent type', () => {
      const result = findTypeForUrl('/api/non-existent', testDir);

      expect(result).toBeNull();
    });

    it('should handle nested URLs', () => {
      const result = findTypeForUrl('/api/v1/orders', testDir);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('Order');
      expect(result?.isArray).toBe(true);
    });

    it('should handle hyphenated URLs', () => {
      const result = findTypeForUrl('/api/user-profiles', testDir);

      expect(result).not.toBeNull();
      expect(result?.typeName).toBe('UserProfile');
      expect(result?.isArray).toBe(true);
    });
  });
});
