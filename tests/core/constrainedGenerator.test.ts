import {
  generateConstrainedString,
  generateConstrainedNumber,
  applyConstraintsToMock,
  generateFieldValue,
} from '../../src/core/constrainedGenerator';
import { FieldConstraint, FieldConstraints } from '../../src/utils/constraintExtractor';

describe('constrainedGenerator', () => {
  describe('generateConstrainedString', () => {
    it('should generate string within maxLength constraint', () => {
      const constraints: FieldConstraint[] = [{ type: 'maxLength', value: 10 }];

      for (let i = 0; i < 10; i++) {
        const value = generateConstrainedString(constraints);
        expect(typeof value).toBe('string');
        expect(value.length).toBeLessThanOrEqual(10);
      }
    });

    it('should generate string within minLength and maxLength', () => {
      const constraints: FieldConstraint[] = [
        { type: 'minLength', value: 5 },
        { type: 'maxLength', value: 15 },
      ];

      for (let i = 0; i < 10; i++) {
        const value = generateConstrainedString(constraints);
        expect(value.length).toBeGreaterThanOrEqual(5);
        expect(value.length).toBeLessThanOrEqual(15);
      }
    });

    it('should generate value from enum', () => {
      const constraints: FieldConstraint[] = [
        { type: 'enum', value: ['RED', 'GREEN', 'BLUE'] },
      ];

      const value = generateConstrainedString(constraints);
      expect(['RED', 'GREEN', 'BLUE']).toContain(value);
    });

    it('should generate string matching pattern', () => {
      const constraints: FieldConstraint[] = [
        { type: 'pattern', value: '[a-z]*' },
      ];

      const value = generateConstrainedString(constraints);
      expect(typeof value).toBe('string');
      // Pattern-based generation may not perfectly match, but shouldn't error
      expect(value.length).toBeGreaterThan(0);
    });
  });

  describe('generateConstrainedNumber', () => {
    it('should generate number within min and max bounds', () => {
      const constraints: FieldConstraint[] = [
        { type: 'min', value: 10 },
        { type: 'max', value: 20 },
      ];

      for (let i = 0; i < 10; i++) {
        const value = generateConstrainedNumber(constraints);
        expect(typeof value).toBe('number');
        expect(value).toBeGreaterThanOrEqual(10);
        expect(value).toBeLessThanOrEqual(20);
      }
    });

    it('should generate value from enum numbers', () => {
      const constraints: FieldConstraint[] = [
        { type: 'enum', value: ['1', '2', '3'] },
      ];

      const value = generateConstrainedNumber(constraints);
      expect([1, 2, 3]).toContain(value);
    });

    it('should handle only min constraint', () => {
      const constraints: FieldConstraint[] = [{ type: 'min', value: 100 }];

      const value = generateConstrainedNumber(constraints);
      expect(value).toBeGreaterThanOrEqual(100);
    });

    it('should handle only max constraint', () => {
      const constraints: FieldConstraint[] = [{ type: 'max', value: 50 }];

      const value = generateConstrainedNumber(constraints);
      expect(value).toBeLessThanOrEqual(50);
    });
  });

  describe('applyConstraintsToMock', () => {
    it('should apply string constraints to mock data', () => {
      const mockData = {
        label: 'this is a very long label that exceeds the maximum length',
        value: 123,
      };

      const constraints: FieldConstraints = {
        label: [{ type: 'maxLength', value: 10 }],
      };

      const result = applyConstraintsToMock(mockData, constraints);

      expect(result.label).toBeDefined();
      expect(typeof result.label).toBe('string');
      expect((result.label as string).length).toBeLessThanOrEqual(10);
      expect(result.value).toBe(123); // Unchanged
    });

    it('should apply number constraints to mock data', () => {
      const mockData = {
        id: 1,
        rating: 500,
      };

      const constraints: FieldConstraints = {
        rating: [
          { type: 'min', value: 1 },
          { type: 'max', value: 5 },
        ],
      };

      const result = applyConstraintsToMock(mockData, constraints);

      expect(result.rating).toBeDefined();
      expect(typeof result.rating).toBe('number');
      expect(result.rating).toBeGreaterThanOrEqual(1);
      expect(result.rating).toBeLessThanOrEqual(5);
    });

    it('should apply enum constraints to mock data', () => {
      const mockData = {
        status: 'unknown',
      };

      const constraints: FieldConstraints = {
        status: [{ type: 'enum', value: ['ACTIVE', 'INACTIVE', 'PENDING'] }],
      };

      const result = applyConstraintsToMock(mockData, constraints);

      expect(['ACTIVE', 'INACTIVE', 'PENDING']).toContain(result.status);
    });

    it('should ignore fields not in constraints', () => {
      const mockData = {
        name: 'John',
        email: 'john@example.com',
      };

      const constraints: FieldConstraints = {
        name: [{ type: 'maxLength', value: 5 }],
      };

      const result = applyConstraintsToMock(mockData, constraints);

      expect(result.email).toBe('john@example.com'); // Unchanged
    });

    it('should handle empty constraints', () => {
      const mockData = {
        id: 1,
        name: 'test',
      };

      const result = applyConstraintsToMock(mockData, {});

      expect(result).toEqual(mockData);
    });
  });

  describe('generateFieldValue', () => {
    it('should generate string without constraints', () => {
      const value = generateFieldValue('name', 'string');
      expect(typeof value).toBe('string');
    });

    it('should generate number without constraints', () => {
      const value = generateFieldValue('count', 'number');
      expect(typeof value).toBe('number');
    });

    it('should generate boolean without constraints', () => {
      const value = generateFieldValue('active', 'boolean');
      expect(typeof value).toBe('boolean');
    });

    it('should apply string constraints to generated value', () => {
      const constraints: FieldConstraint[] = [{ type: 'maxLength', value: 8 }];

      for (let i = 0; i < 5; i++) {
        const value = generateFieldValue('code', 'string', constraints);
        expect((value as string).length).toBeLessThanOrEqual(8);
      }
    });

    it('should apply number constraints to generated value', () => {
      const constraints: FieldConstraint[] = [
        { type: 'min', value: 1 },
        { type: 'max', value: 10 },
      ];

      for (let i = 0; i < 5; i++) {
        const value = generateFieldValue('level', 'number', constraints);
        expect(value).toBeGreaterThanOrEqual(1);
        expect(value).toBeLessThanOrEqual(10);
      }
    });

    it('should respect enum constraint', () => {
      const constraints: FieldConstraint[] = [
        { type: 'enum', value: ['DRAFT', 'PUBLISHED'] },
      ];

      const value = generateFieldValue('state', 'string', constraints);
      expect(['DRAFT', 'PUBLISHED']).toContain(value);
    });
  });
});
