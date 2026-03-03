import { extractConstraints, FieldConstraint } from '../../src/utils/constraintExtractor';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

describe('constraintExtractor', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'constraint-test-'));
    testFile = path.join(tempDir, 'test.ts');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true });
  });

  it('should extract maxLength constraint from JSDoc', () => {
    const content = `
      // @endpoint
      export interface Badge {
        /** @maxLength 10 */
        label: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Badge');

    expect(constraints.label).toBeDefined();
    expect(constraints.label).toHaveLength(1);
    expect(constraints.label![0]!.type).toBe('maxLength');
    expect(constraints.label![0]!.value).toBe(10);
  });

  it('should extract minLength constraint from JSDoc', () => {
    const content = `
      // @endpoint
      export interface Product {
        /** @minLength 5 */
        sku: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Product');

    expect(constraints.sku).toBeDefined();
    expect(constraints.sku![0]!.type).toBe('minLength');
    expect(constraints.sku![0]!.value).toBe(5);
  });

  it('should extract min and max constraints for numbers', () => {
    const content = `
      // @endpoint
      export interface Rating {
        /** @min 1 @max 5 */
        stars: number;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Rating');

    expect(constraints.stars).toHaveLength(2);
    const types = constraints.stars!.map((c: FieldConstraint) => c.type);
    expect(types).toContain('min');
    expect(types).toContain('max');
  });

  it('should extract enum constraint', () => {
    const content = `
      // @endpoint
      export interface Status {
        /** @enum ACTIVE,INACTIVE,PENDING */
        state: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Status');

    expect(constraints.state).toBeDefined();
    expect(constraints.state![0]!.type).toBe('enum');
    expect(constraints.state![0]!.value).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);
  });

  it('should extract pattern constraint', () => {
    const content = `
      // @endpoint
      export interface Email {
        /** @pattern ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$ */
        address: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Email');

    expect(constraints.address).toBeDefined();
    expect(constraints.address![0]!.type).toBe('pattern');
    expect(typeof constraints.address![0]!.value).toBe('string');
  });

  it('should extract multiple constraints on one field', () => {
    const content = `
      // @endpoint
      export interface User {
        /** @minLength 3 @maxLength 50 */
        username: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'User');

    expect(constraints.username).toHaveLength(2);
    const types = constraints.username!.map((c: FieldConstraint) => c.type);
    expect(types).toContain('minLength');
    expect(types).toContain('maxLength');
  });

  it('should return empty constraints for interface without JSDoc annotations', () => {
    const content = `
      // @endpoint
      export interface Simple {
        id: number;
        name: string;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'Simple');

    expect(Object.keys(constraints)).toHaveLength(0);
  });

  it('should return empty object for non-existent interface', () => {
    const content = `
      // @endpoint
      export interface Existing {
        id: number;
      }
    `;
    fs.writeFileSync(testFile, content);

    const constraints = extractConstraints(testFile, 'NonExistent');

    expect(Object.keys(constraints)).toHaveLength(0);
  });
});
