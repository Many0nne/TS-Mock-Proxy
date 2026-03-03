import * as fs from 'fs';
import * as ts from 'typescript';

/**
 * Represents a single constraint on a field
 */
export interface FieldConstraint {
  type: 'minLength' | 'maxLength' | 'pattern' | 'min' | 'max' | 'enum' | 'custom';
  value: string | number | string[];
}

/**
 * Represents all constraints for a single field
 */
export interface FieldConstraints {
  [fieldName: string]: FieldConstraint[];
}

/**
 * Extracts JSDoc annotations from a TypeScript file and returns constraints
 * 
 * Supported annotations:
 * - @minLength number
 * - @maxLength number
 * - @pattern regex_string
 * - @min number
 * - @max number
 * - @enum value1,value2,value3
 */
export function extractConstraints(
  filePath: string,
  interfaceName: string
): FieldConstraints {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    filePath,
    fileContent,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );

  const constraints: FieldConstraints = {};

  // Visit all nodes in the AST
  visit(sourceFile, interfaceName, constraints, sourceFile);

  return constraints;
}

/**
 * Recursively visits the AST to find the interface and extract constraints
 */
function visit(
  node: ts.Node,
  interfaceName: string,
  constraints: FieldConstraints,
  sourceFile?: ts.SourceFile
): void {
  // Look for interface declarations
  if (ts.isInterfaceDeclaration(node) && node.name?.text === interfaceName) {
    // Process each property of the interface
    node.members.forEach((member) => {
      if (ts.isPropertySignature(member) && member.name) {
        // Use .text for identifiers/string literals to avoid wrapping quotes
        const propName =
          ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
            ? member.name.text
            : member.name.getText();
        const fieldConstraints = extractJSDocConstraints(member, sourceFile);

        if (fieldConstraints.length > 0) {
          constraints[propName] = fieldConstraints;
        }
      }
    });
    return;
  }

  // Recursively visit children
  ts.forEachChild(node, (child) => visit(child, interfaceName, constraints, sourceFile));
}

/**
 * Extracts JSDoc constraints from a property
 */
function extractJSDocConstraints(node: ts.PropertySignature, sourceFile?: ts.SourceFile): FieldConstraint[] {
  const constraints: FieldConstraint[] = [];

  const jsDocs = ts.getJSDocCommentsAndTags(node);

  jsDocs.forEach((doc) => {
    // doc can be a JSDocComment or a JSDocTag
    if (typeof doc !== 'object') return;

    if ('tags' in doc && Array.isArray(doc.tags)) {
      // It's a JSDocComment
      doc.tags.forEach((tag) => {
        const constraint = parseJSDocTag(tag, sourceFile);
        if (constraint) {
          constraints.push(constraint);
        }
      });
    } else if ('tagName' in doc) {
      // It's a JSDocTag directly
      const constraint = parseJSDocTag(doc as ts.JSDocTag, sourceFile);
      if (constraint) {
        constraints.push(constraint);
      }
    }
  });

  return constraints;
}

/**
 * Parses a single JSDoc tag and returns the constraint
 */
function parseJSDocTag(tag: ts.JSDocTag, sourceFile?: ts.SourceFile): FieldConstraint | null {
  const tagName = tag.tagName.text;
  if (!tagName) return null;

  // Resolve the comment to a plain string.
  // For @enum, always read from source text because the TS parser treats the
  // first enum value as a type annotation and truncates the rest.
  let commentStr: string | undefined;
  if (tagName === 'enum' && sourceFile) {
    const tagText = tag.getFullText(sourceFile);
    const match = tagText.match(/@enum\s+([^*@]+?)(?=\s*(?:\*\/|@|$))/);
    commentStr = match?.[1]?.trim();
  } else {
    const raw = tag.comment;
    // Normalize NodeArray<JSDocComment> to a plain string
    if (Array.isArray(raw)) {
      commentStr = (raw as ts.NodeArray<ts.JSDocComment>).map((node) => node.text).join('');
    } else if (typeof raw === 'string') {
      commentStr = raw;
    }

    // Fall back to extracting from source text when comment is empty
    if (!commentStr && sourceFile) {
      const tagText = tag.getFullText(sourceFile);
      const match = tagText.match(new RegExp(`@${tagName}\\s+([^\\*@]+?)(?=\\s*(?:\\*\\/|@|$))`));
      commentStr = match?.[1]?.trim() ?? '';
    }
  }

  switch (tagName) {
    case 'minLength': {
      const value = extractNumericValue(commentStr);
      if (value !== null) return { type: 'minLength', value };
      break;
    }
    case 'maxLength': {
      const value = extractNumericValue(commentStr);
      if (value !== null) return { type: 'maxLength', value };
      break;
    }
    case 'min': {
      const value = extractNumericValue(commentStr);
      if (value !== null) return { type: 'min', value };
      break;
    }
    case 'max': {
      const value = extractNumericValue(commentStr);
      if (value !== null) return { type: 'max', value };
      break;
    }
    case 'pattern': {
      const value = extractStringValue(commentStr);
      if (value) return { type: 'pattern', value };
      break;
    }
    case 'enum': {
      const values = extractEnumValues(commentStr);
      if (values.length > 0) return { type: 'enum', value: values };
      break;
    }
  }

  return null;
}

/**
 * Extracts a numeric value from a JSDoc comment
 */
function extractNumericValue(comment: string | undefined): number | null {
  if (!comment) return null;

  const match = comment.match(/-?\d+(\.\d+)?/);
  if (match) {
    return parseFloat(match[0]);
  }

  return null;
}

/**
 * Extracts a string value from a JSDoc comment
 */
function extractStringValue(comment: string | undefined): string | null {
  if (!comment) return null;

  // Try to extract quoted string
  const match = comment.match(/['"`]([^'"`]+)['"`]/);
  if (match && match[1]) {
    return match[1];
  }

  // Or just trim the comment
  const trimmed = comment.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Extracts enum values from a JSDoc comment
 */
function extractEnumValues(comment: string | undefined): string[] {
  if (!comment) return [];

  // Split by comma and trim each value
  return comment
    .trim()
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}
