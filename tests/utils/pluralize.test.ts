import {
  toPascalCase,
  extractLastSegment,
  urlSegmentToTypeName,
  parseUrlToType,
} from '../../src/utils/pluralize';

describe('pluralize utils', () => {
  describe('toPascalCase', () => {
    it('should convert lowercase string to PascalCase', () => {
      expect(toPascalCase('user')).toBe('User');
    });

    it('should convert hyphenated string to PascalCase', () => {
      expect(toPascalCase('product-item')).toBe('ProductItem');
      expect(toPascalCase('my-long-type-name')).toBe('MyLongTypeName');
    });

    it('should convert underscored string to PascalCase', () => {
      expect(toPascalCase('user_profile')).toBe('UserProfile');
    });

    it('should handle mixed separators', () => {
      expect(toPascalCase('my-type_name')).toBe('MyTypeName');
    });

    it('should handle already PascalCase strings', () => {
      expect(toPascalCase('User')).toBe('User');
      expect(toPascalCase('ProductItem')).toBe('ProductItem');
    });
  });

  describe('extractLastSegment', () => {
    it('should extract last segment from simple path', () => {
      expect(extractLastSegment('/users')).toBe('users');
      expect(extractLastSegment('/products')).toBe('products');
    });

    it('should extract last segment from nested path', () => {
      expect(extractLastSegment('/api/users')).toBe('users');
      expect(extractLastSegment('/api/v1/products')).toBe('products');
      expect(extractLastSegment('/api/v2/user-profiles')).toBe('user-profiles');
    });

    it('should handle trailing slash', () => {
      expect(extractLastSegment('/api/users/')).toBe('users');
    });

    it('should handle empty or root path', () => {
      expect(extractLastSegment('/')).toBe('');
      expect(extractLastSegment('')).toBe('');
    });
  });

  describe('urlSegmentToTypeName', () => {
    it('should convert plural segment to singular PascalCase', () => {
      const result = urlSegmentToTypeName('users');
      expect(result.typeName).toBe('User');
      expect(result.isArray).toBe(true);
    });

    it('should convert singular segment to PascalCase', () => {
      const result = urlSegmentToTypeName('user');
      expect(result.typeName).toBe('User');
      expect(result.isArray).toBe(false);
    });

    it('should handle plural hyphenated segments', () => {
      const result = urlSegmentToTypeName('product-items');
      expect(result.typeName).toBe('ProductItem');
      expect(result.isArray).toBe(true);
    });

    it('should handle irregular plurals', () => {
      const people = urlSegmentToTypeName('people');
      expect(people.typeName).toBe('Person');
      expect(people.isArray).toBe(true);

      const children = urlSegmentToTypeName('children');
      expect(children.typeName).toBe('Child');
      expect(children.isArray).toBe(true);
    });

    it('should handle non-plural words', () => {
      const result = urlSegmentToTypeName('profile');
      expect(result.typeName).toBe('Profile');
      expect(result.isArray).toBe(false);
    });
  });

  describe('parseUrlToType', () => {
    it('should parse URL with plural endpoint', () => {
      const result = parseUrlToType('/api/users');
      expect(result.typeName).toBe('User');
      expect(result.isArray).toBe(true);
    });

    it('should parse URL with singular endpoint', () => {
      const result = parseUrlToType('/api/user');
      expect(result.typeName).toBe('User');
      expect(result.isArray).toBe(false);
    });

    it('should parse nested API routes', () => {
      const result = parseUrlToType('/api/v1/product-items');
      expect(result.typeName).toBe('ProductItem');
      expect(result.isArray).toBe(true);
    });

    it('should handle complex URLs', () => {
      const result = parseUrlToType('/api/v2/user-profiles');
      expect(result.typeName).toBe('UserProfile');
      expect(result.isArray).toBe(true);
    });
  });
});
