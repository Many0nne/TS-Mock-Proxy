import pluralize from 'pluralize';

/**
 * Converts a string to PascalCase
 * Examples: "user" -> "User", "product-item" -> "ProductItem"
 */
export function toPascalCase(str: string): string {
  return str
    .replace(/[-_]+(.)?/g, (_, char) => (char ? char.toUpperCase() : ''))
    .replace(/^(.)/, (char) => char.toUpperCase());
}

/**
 * Extracts the last segment of a URL
 * Examples: "/api/users" -> "users", "/v1/products" -> "products"
 */
export function extractLastSegment(url: string): string {
  const segments = url.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

/**
 * Converts a URL segment to a TypeScript type name
 * Handles singularization and conversion to PascalCase
 *
 * @param urlSegment - URL segment (e.g., "users", "product-items")
 * @returns Object with the type name and whether it's an array
 */
export function urlSegmentToTypeName(urlSegment: string): {
  typeName: string;
  isArray: boolean;
} {
  // Detect if it's plural
  const isPlural = pluralize.isPlural(urlSegment);

  // Singularize if necessary
  const singular = isPlural ? pluralize.singular(urlSegment) : urlSegment;

  // Convert to PascalCase
  const typeName = toPascalCase(singular);

  return {
    typeName,
    isArray: isPlural,
  };
}

/**
 * Parses a complete URL and returns the corresponding type
 *
 * @param url - Complete URL (e.g., "/api/v1/users")
 * @returns Object with the type name and whether it's an array
 */
export function parseUrlToType(url: string): {
  typeName: string;
  isArray: boolean;
} {
  const lastSegment = extractLastSegment(url);
  return urlSegmentToTypeName(lastSegment);
}
