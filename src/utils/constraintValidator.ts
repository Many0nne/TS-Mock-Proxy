import { FieldConstraint } from './constraintExtractor';

/**
 * Validates a value against a single constraint
 */
export function validateConstraint(
  value: string | number,
  constraint: FieldConstraint
): boolean {
  switch (constraint.type) {
    case 'minLength':
      return typeof value === 'string' && value.length >= (constraint.value as number);

    case 'maxLength':
      return typeof value === 'string' && value.length <= (constraint.value as number);

    case 'min':
      return typeof value === 'number' && value >= (constraint.value as number);

    case 'max':
      return typeof value === 'number' && value <= (constraint.value as number);

    case 'pattern': {
      const pattern = new RegExp(constraint.value as string);
      return typeof value === 'string' && pattern.test(value);
    }

    case 'enum':
      return (constraint.value as string[]).includes(String(value));

    default:
      return true;
  }
}

/**
 * Validates a value against all constraints
 */
export function validateAllConstraints(
  value: string | number,
  constraints: FieldConstraint[]
): boolean {
  return constraints.every((constraint) => validateConstraint(value, constraint));
}

/**
 * Gets constraints of a specific type
 */
export function getConstraintByType(
  constraints: FieldConstraint[],
  type: FieldConstraint['type']
): FieldConstraint | null {
  return constraints.find((c) => c.type === type) || null;
}

/**
 * Helper to get min/max length constraints for strings
 */
export function getStringLengthBounds(
  constraints: FieldConstraint[]
): { min: number; max: number } {
  const minConstraint = getConstraintByType(constraints, 'minLength');
  const maxConstraint = getConstraintByType(constraints, 'maxLength');

  return {
    min: minConstraint ? (minConstraint.value as number) : 0,
    max: maxConstraint ? (maxConstraint.value as number) : 100,
  };
}

/**
 * Helper to get min/max constraints for numbers
 */
export function getNumberBounds(
  constraints: FieldConstraint[]
): { min: number; max: number } {
  const minConstraint = getConstraintByType(constraints, 'min');
  const maxConstraint = getConstraintByType(constraints, 'max');

  return {
    min: minConstraint ? (minConstraint.value as number) : 0,
    max: maxConstraint ? (maxConstraint.value as number) : 1000,
  };
}

/**
 * Get enum values if constraint exists
 */
export function getEnumValues(constraints: FieldConstraint[]): string[] | null {
  const enumConstraint = getConstraintByType(constraints, 'enum');
  return enumConstraint ? (enumConstraint.value as string[]) : null;
}

/**
 * Get pattern if constraint exists
 */
export function getPattern(constraints: FieldConstraint[]): RegExp | null {
  const patternConstraint = getConstraintByType(constraints, 'pattern');
  return patternConstraint ? new RegExp(patternConstraint.value as string) : null;
}
