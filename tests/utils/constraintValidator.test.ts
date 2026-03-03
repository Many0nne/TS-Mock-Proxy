import {
  validateConstraint,
  validateAllConstraints,
  getStringLengthBounds,
  getNumberBounds,
  getEnumValues,
  getPattern,
} from '../../src/utils/constraintValidator';
import { FieldConstraint } from '../../src/utils/constraintExtractor';

describe('constraintValidator', () => {
  describe('validateConstraint', () => {
    it('should validate maxLength constraint', () => {
      const constraint: FieldConstraint = { type: 'maxLength', value: 10 };

      expect(validateConstraint('hello', constraint)).toBe(true);
      expect(validateConstraint('hello world', constraint)).toBe(false);
      expect(validateConstraint('1234567890', constraint)).toBe(true);
    });

    it('should validate minLength constraint', () => {
      const constraint: FieldConstraint = { type: 'minLength', value: 3 };

      expect(validateConstraint('ab', constraint)).toBe(false);
      expect(validateConstraint('abc', constraint)).toBe(true);
      expect(validateConstraint('abcdef', constraint)).toBe(true);
    });

    it('should validate min constraint for numbers', () => {
      const constraint: FieldConstraint = { type: 'min', value: 5 };

      expect(validateConstraint(3, constraint)).toBe(false);
      expect(validateConstraint(5, constraint)).toBe(true);
      expect(validateConstraint(10, constraint)).toBe(true);
    });

    it('should validate max constraint for numbers', () => {
      const constraint: FieldConstraint = { type: 'max', value: 100 };

      expect(validateConstraint(50, constraint)).toBe(true);
      expect(validateConstraint(100, constraint)).toBe(true);
      expect(validateConstraint(101, constraint)).toBe(false);
    });

    it('should validate pattern constraint', () => {
      const constraint: FieldConstraint = { type: 'pattern', value: '^[a-z]+$' };

      expect(validateConstraint('abc', constraint)).toBe(true);
      expect(validateConstraint('ABC', constraint)).toBe(false);
      expect(validateConstraint('abc123', constraint)).toBe(false);
    });

    it('should validate enum constraint', () => {
      const constraint: FieldConstraint = { type: 'enum', value: ['RED', 'GREEN', 'BLUE'] };

      expect(validateConstraint('RED', constraint)).toBe(true);
      expect(validateConstraint('GREEN', constraint)).toBe(true);
      expect(validateConstraint('YELLOW', constraint)).toBe(false);
      expect(validateConstraint(123, constraint)).toBe(false);
    });
  });

  describe('validateAllConstraints', () => {
    it('should validate all constraints pass', () => {
      const constraints: FieldConstraint[] = [
        { type: 'minLength', value: 3 },
        { type: 'maxLength', value: 10 },
      ];

      expect(validateAllConstraints('hello', constraints)).toBe(true);
      expect(validateAllConstraints('ab', constraints)).toBe(false);
      expect(validateAllConstraints('hello world', constraints)).toBe(false);
    });

    it('should return true for empty constraints array', () => {
      expect(validateAllConstraints('anything', [])).toBe(true);
    });

    it('should validate mixed constraints', () => {
      const constraints: FieldConstraint[] = [
        { type: 'pattern', value: '^[a-z0-9]+$' },
        { type: 'maxLength', value: 20 },
      ];

      expect(validateAllConstraints('abc123', constraints)).toBe(true);
      expect(validateAllConstraints('ABC123', constraints)).toBe(false);
      expect(validateAllConstraints('a' + 'x'.repeat(20), constraints)).toBe(false);
    });
  });

  describe('getStringLengthBounds', () => {
    it('should extract min and max length bounds', () => {
      const constraints: FieldConstraint[] = [
        { type: 'minLength', value: 5 },
        { type: 'maxLength', value: 15 },
      ];

      const bounds = getStringLengthBounds(constraints);
      expect(bounds.min).toBe(5);
      expect(bounds.max).toBe(15);
    });

    it('should return defaults when no constraints', () => {
      const bounds = getStringLengthBounds([]);
      expect(bounds.min).toBe(0);
      expect(bounds.max).toBe(100);
    });

    it('should handle only minLength constraint', () => {
      const constraints: FieldConstraint[] = [{ type: 'minLength', value: 10 }];
      const bounds = getStringLengthBounds(constraints);
      expect(bounds.min).toBe(10);
      expect(bounds.max).toBe(100);
    });

    it('should handle only maxLength constraint', () => {
      const constraints: FieldConstraint[] = [{ type: 'maxLength', value: 50 }];
      const bounds = getStringLengthBounds(constraints);
      expect(bounds.min).toBe(0);
      expect(bounds.max).toBe(50);
    });
  });

  describe('getNumberBounds', () => {
    it('should extract min and max bounds', () => {
      const constraints: FieldConstraint[] = [
        { type: 'min', value: 1 },
        { type: 'max', value: 10 },
      ];

      const bounds = getNumberBounds(constraints);
      expect(bounds.min).toBe(1);
      expect(bounds.max).toBe(10);
    });

    it('should return defaults when no constraints', () => {
      const bounds = getNumberBounds([]);
      expect(bounds.min).toBe(0);
      expect(bounds.max).toBe(1000);
    });
  });

  describe('getEnumValues', () => {
    it('should extract enum values', () => {
      const constraints: FieldConstraint[] = [
        { type: 'enum', value: ['A', 'B', 'C'] },
      ];

      const values = getEnumValues(constraints);
      expect(values).toEqual(['A', 'B', 'C']);
    });

    it('should return null when no enum constraint', () => {
      const values = getEnumValues([{ type: 'maxLength', value: 10 }]);
      expect(values).toBeNull();
    });
  });

  describe('getPattern', () => {
    it('should extract pattern as regex', () => {
      const constraints: FieldConstraint[] = [
        { type: 'pattern', value: '^[a-z]+$' },
      ];

      const pattern = getPattern(constraints);
      expect(pattern).not.toBeNull();
      expect(pattern?.test('abc')).toBe(true);
      expect(pattern?.test('ABC')).toBe(false);
    });

    it('should return null when no pattern constraint', () => {
      const pattern = getPattern([{ type: 'maxLength', value: 10 }]);
      expect(pattern).toBeNull();
    });
  });
});
