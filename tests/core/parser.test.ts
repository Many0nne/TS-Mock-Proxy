import * as fs from 'fs';
import * as path from 'path';
import {
  generateMockFromInterface,
  generateMockArray,
} from '../../src/core/parser';

describe('parser', () => {
  const testDir = path.join(__dirname, 'test-files');
  const testFile = path.join(testDir, 'test-interface.ts');

  beforeAll(() => {
    // Create test directory and file
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    fs.writeFileSync(
      testFile,
      `export interface User {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

export interface Product {
  id: number;
  title: string;
  price: number;
  inStock: boolean;
}`
    );
  });

  afterAll(() => {
    // Clean up
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('generateMockFromInterface', () => {
    it('should generate mock data for interface', () => {
      const mock = generateMockFromInterface(testFile, 'User');

      expect(mock).toBeDefined();
      expect(typeof mock).toBe('object');
      expect(mock).toHaveProperty('id');
      expect(mock).toHaveProperty('name');
      expect(mock).toHaveProperty('email');
      expect(mock).toHaveProperty('active');
    });

    it('should generate data with all required fields', () => {
      const mock = generateMockFromInterface(testFile, 'User');

      // Check that all fields exist (intermock generates mock data)
      expect(mock).toHaveProperty('id');
      expect(mock).toHaveProperty('name');
      expect(mock).toHaveProperty('email');
      expect(mock).toHaveProperty('active');

      // Intermock generates various types of mock data
      expect(mock.id).toBeDefined();
      expect(mock.name).toBeDefined();
      expect(mock.email).toBeDefined();
      expect(mock.active).toBeDefined();
    });

    it('should generate different data on each call', () => {
      const mock1 = generateMockFromInterface(testFile, 'User');
      const mock2 = generateMockFromInterface(testFile, 'User');

      // At least one field should be different
      const isDifferent =
        mock1.id !== mock2.id ||
        mock1.name !== mock2.name ||
        mock1.email !== mock2.email ||
        mock1.active !== mock2.active;

      expect(isDifferent).toBe(true);
    });

    it('should handle different interfaces from same file', () => {
      const userMock = generateMockFromInterface(testFile, 'User');
      const productMock = generateMockFromInterface(testFile, 'Product');

      expect(userMock).toHaveProperty('name');
      expect(userMock).toHaveProperty('email');

      expect(productMock).toHaveProperty('title');
      expect(productMock).toHaveProperty('price');
      expect(productMock).toHaveProperty('inStock');
    });

    it('should throw error for non-existent interface', () => {
      expect(() => {
        generateMockFromInterface(testFile, 'NonExistent');
      }).toThrow();
    });

    it('should throw error for non-existent file', () => {
      expect(() => {
        generateMockFromInterface('/non/existent/file.ts', 'User');
      }).toThrow();
    });
  });

  describe('generateMockArray', () => {
    it('should generate array of mocks', () => {
      const mocks = generateMockArray(testFile, 'User');

      expect(Array.isArray(mocks)).toBe(true);
      expect(mocks.length).toBeGreaterThan(0);
    });

    it('should generate array with specified length', () => {
      const length = 5;
      const mocks = generateMockArray(testFile, 'User', { arrayLength: length });

      expect(mocks.length).toBe(length);
    });

    it('should generate random length between 3 and 10 by default', () => {
      const mocks = generateMockArray(testFile, 'User');

      expect(mocks.length).toBeGreaterThanOrEqual(3);
      expect(mocks.length).toBeLessThanOrEqual(10);
    });

    it('should generate different items in array', () => {
      const mocks = generateMockArray(testFile, 'User', { arrayLength: 3 });

      expect(mocks.length).toBe(3);

      // Check that items are different (at least one field should vary)
      const firstItem = mocks[0];
      if (firstItem) {
        const allSame = mocks.every(
          (mock) =>
            mock.id === firstItem.id &&
            mock.name === firstItem.name &&
            mock.email === firstItem.email
        );

        expect(allSame).toBe(false);
      }
    });

    it('should handle custom array length', () => {
      const mocks = generateMockArray(testFile, 'Product', { arrayLength: 15 });

      expect(mocks.length).toBe(15);
      mocks.forEach((mock) => {
        expect(mock).toHaveProperty('id');
        expect(mock).toHaveProperty('title');
        expect(mock).toHaveProperty('price');
      });
    });

    it('should generate valid objects in array', () => {
      const mocks = generateMockArray(testFile, 'User', { arrayLength: 3 });

      mocks.forEach((mock) => {
        expect(typeof mock).toBe('object');
        expect(mock).toHaveProperty('id');
        expect(mock).toHaveProperty('name');
        expect(mock).toHaveProperty('email');
        expect(mock).toHaveProperty('active');
      });
    });
  });
});
