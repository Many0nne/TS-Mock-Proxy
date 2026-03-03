import { faker } from '@faker-js/faker';
import { FieldConstraint, FieldConstraints } from '../utils/constraintExtractor';
import {
  getStringLengthBounds,
  getNumberBounds,
  getEnumValues,
  getPattern,
} from '../utils/constraintValidator';

/**
 * Generates a constrained string value
 */
export function generateConstrainedString(constraints: FieldConstraint[]): string {
  const enumValues = getEnumValues(constraints);
  if (enumValues && enumValues.length > 0) {
    return faker.helpers.arrayElement(enumValues);
  }

  const pattern = getPattern(constraints);
  if (pattern) {
    // For patterns, try to generate matching string
    return generateStringMatchingPattern(pattern);
  }

  const { min, max } = getStringLengthBounds(constraints);

  // Generate a random string of appropriate length
  const length = faker.number.int({ min, max });
  return faker.string.alphanumeric(length);
}

/**
 * Generates a constrained number value
 */
export function generateConstrainedNumber(constraints: FieldConstraint[]): number {
  const enumValues = getEnumValues(constraints);
  if (enumValues && enumValues.length > 0) {
    const numericValues = enumValues.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
    if (numericValues.length > 0) {
      return faker.helpers.arrayElement(numericValues);
    }
  }

  const { min, max } = getNumberBounds(constraints);
  // Use float generation when either bound is a decimal
  if (min % 1 !== 0 || max % 1 !== 0) {
    return faker.number.float({ min, max });
  }
  return faker.number.int({ min, max });
}

/**
 * Generates a string that matches a regex pattern.
 * Uses heuristics for common patterns; falls back to alphanumeric for others.
 */
function generateStringMatchingPattern(pattern: RegExp): string {
  const source = pattern.source;

  if (source.includes('[a-z]') || source === '[a-z]*') {
    return faker.string.alpha({ length: 10 });
  }
  if (source.includes('[0-9]') || source === '[0-9]*') {
    return faker.string.numeric({ length: 10 });
  }
  if (source.includes('[a-zA-Z0-9]')) {
    return faker.string.alphanumeric({ length: 10 });
  }
  if (source.includes('@') || source === '^[^@]+@[^@]+\\.[^@]+$') {
    return faker.internet.email();
  }
  if (source.includes('http') || source.includes('://')) {
    return faker.internet.url();
  }

  return faker.string.alphanumeric(10);
}

/**
 * Applies constraints to generated mock data
 * This function takes intermock-generated data and applies custom constraints
 */
export function applyConstraintsToMock(
  mockData: Record<string, unknown>,
  fieldConstraints: FieldConstraints,
  knownTypes: Record<string, string> = {}
): Record<string, unknown> {
  const constrained = { ...mockData };

  for (const [fieldName, constraints] of Object.entries(fieldConstraints)) {
    if (fieldName in constrained) {
      const currentValue = constrained[fieldName];
      const fieldConstraintsList = constraints as FieldConstraint[];

      // Determine the field type from knownTypes or the actual runtime value
      const actualType = knownTypes[fieldName] ?? typeof currentValue;
      const isNumeric = actualType === 'number';

      if (fieldConstraintsList.some((c) => c.type === 'enum')) {
        const enumValues = getEnumValues(fieldConstraintsList);
        if (enumValues && enumValues.length > 0) {
          if (isNumeric) {
            const numericValues = enumValues.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
            constrained[fieldName] =
              numericValues.length > 0
                ? faker.helpers.arrayElement(numericValues)
                : faker.helpers.arrayElement(enumValues);
          } else {
            constrained[fieldName] = faker.helpers.arrayElement(enumValues);
          }
        }
      } else if (isNumeric) {
        const value = currentValue as number;
        const minConstraint = fieldConstraintsList.find((c) => c.type === 'min');
        const maxConstraint = fieldConstraintsList.find((c) => c.type === 'max');
        const min = minConstraint ? (minConstraint.value as number) : value;
        const max = maxConstraint ? (maxConstraint.value as number) : value;

        if (value < min || value > max) {
          constrained[fieldName] = generateConstrainedNumber(fieldConstraintsList);
        }
      } else {
        constrained[fieldName] = generateConstrainedString(fieldConstraintsList);
      }
    }
  }

  return constrained;
}

/**
 * Generates a value for a field based on its type and constraints
 */
export function generateFieldValue(
  _fieldName: string,
  fieldType: string,
  constraints: FieldConstraint[] = []
): unknown {
  // If we have constraints that hint at the type
  const hasStringConstraints = constraints.some((c) =>
    ['minLength', 'maxLength', 'pattern'].includes(c.type)
  );
  const hasNumberConstraints = constraints.some((c) =>
    ['min', 'max'].includes(c.type)
  );
  const hasEnumConstraints = constraints.some((c) => c.type === 'enum');

  if (hasEnumConstraints) {
    const enumValues = getEnumValues(constraints);
    if (enumValues && enumValues.length > 0) {
      if (fieldType === 'number') {
        const numericValues = enumValues.map((v) => parseFloat(v)).filter((v) => !isNaN(v));
        if (numericValues.length > 0) {
          return faker.helpers.arrayElement(numericValues);
        }
      }
      return faker.helpers.arrayElement(enumValues);
    }
  }

  // Generate based on constraints or field type
  if (hasStringConstraints || fieldType === 'string') {
    return generateConstrainedString(constraints);
  }

  if (hasNumberConstraints || ['number', 'int', 'integer'].includes(fieldType)) {
    return generateConstrainedNumber(constraints);
  }

  if (fieldType === 'boolean') {
    return faker.datatype.boolean();
  }

  if (fieldType === 'date' || fieldType === 'Date') {
    return faker.date.recent();
  }

  // Default fallback
  return generateConstrainedString(constraints);
}
