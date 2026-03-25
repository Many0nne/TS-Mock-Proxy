import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MockDataStore } from '../../src/core/cache';
import { saveMockData, loadMockData } from '../../src/utils/dataPersistence';

const FIXTURES_DIR = path.join(__dirname, '../fixtures/types');

function makeTempPath(): string {
  return path.join(os.tmpdir(), `mock-persist-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function cleanup(...paths: string[]): void {
  for (const p of paths) {
    try { fs.unlinkSync(p); } catch { /* ignore */ }
    try { fs.unlinkSync(`${p}.tmp`); } catch { /* ignore */ }
  }
}

describe('saveMockData', () => {
  let store: MockDataStore;

  beforeEach(() => {
    store = new MockDataStore();
  });

  it('creates the file with the expected format', () => {
    const filePath = makeTempPath();
    try {
      const users = [{ id: 1, name: 'Alice', email: 'a@b.com' }];
      // Pre-seed the store with a pool matching the fixture User type
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      store.setPool('User', typeFile, users);

      saveMockData(store, FIXTURES_DIR, filePath);

      expect(fs.existsSync(filePath)).toBe(true);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content).toHaveProperty('User');
      expect(content['User']).toEqual(users);
    } finally {
      cleanup(filePath);
    }
  });

  it('updates an existing file', () => {
    const filePath = makeTempPath();
    try {
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      store.setPool('User', typeFile, [{ id: 1, name: 'Alice', email: 'a@b.com' }]);
      saveMockData(store, FIXTURES_DIR, filePath);

      // Update the pool and save again
      store.setPool('User', typeFile, [{ id: 2, name: 'Bob', email: 'b@c.com' }]);
      saveMockData(store, FIXTURES_DIR, filePath);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content['User']).toEqual([{ id: 2, name: 'Bob', email: 'b@c.com' }]);
    } finally {
      cleanup(filePath);
    }
  });

  it('writes via tmp + rename (tmp file absent after save)', () => {
    const filePath = makeTempPath();
    try {
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      store.setPool('User', typeFile, [{ id: 1, name: 'A', email: 'a@b.com' }]);
      saveMockData(store, FIXTURES_DIR, filePath);

      expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
      expect(fs.existsSync(filePath)).toBe(true);
    } finally {
      cleanup(filePath);
    }
  });

  it('preserves empty arrays in the file', () => {
    const filePath = makeTempPath();
    try {
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      store.setPool('User', typeFile, []);
      saveMockData(store, FIXTURES_DIR, filePath);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content['User']).toEqual([]);
    } finally {
      cleanup(filePath);
    }
  });

  it('does not throw when the path is inaccessible (emits warning)', () => {
    const badPath = '/nonexistent/deeply/nested/file.json';
    expect(() => {
      saveMockData(store, FIXTURES_DIR, badPath);
    }).not.toThrow();
  });
});

describe('loadMockData', () => {
  let store: MockDataStore;

  beforeEach(() => {
    store = new MockDataStore();
  });

  it('loads pools correctly from a valid file', () => {
    const filePath = makeTempPath();
    try {
      const users = [{ id: 1, name: 'Alice', email: 'a@b.com' }];
      fs.writeFileSync(filePath, JSON.stringify({ User: users }, null, 2), 'utf-8');

      const result = loadMockData(store, FIXTURES_DIR, filePath);

      expect(result).toBe(true);
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      expect(store.getPool('User', typeFile)).toEqual(users);
    } finally {
      cleanup(filePath);
    }
  });

  it('loads empty arrays as empty pools (does not regenerate)', () => {
    const filePath = makeTempPath();
    try {
      fs.writeFileSync(filePath, JSON.stringify({ User: [] }, null, 2), 'utf-8');

      const result = loadMockData(store, FIXTURES_DIR, filePath);

      expect(result).toBe(true);
      const typeFile = path.join(FIXTURES_DIR, 'user.ts');
      expect(store.getPool('User', typeFile)).toEqual([]);
    } finally {
      cleanup(filePath);
    }
  });

  it('returns false when the file is absent', () => {
    const result = loadMockData(store, FIXTURES_DIR, '/nonexistent/file.json');
    expect(result).toBe(false);
  });

  it('returns false and emits warning when JSON is invalid (does not crash)', () => {
    const filePath = makeTempPath();
    try {
      fs.writeFileSync(filePath, '{ invalid json !!!', 'utf-8');
      const result = loadMockData(store, FIXTURES_DIR, filePath);
      expect(result).toBe(false);
    } finally {
      cleanup(filePath);
    }
  });

  it('ignores unknown types silently', () => {
    const filePath = makeTempPath();
    try {
      fs.writeFileSync(filePath, JSON.stringify({ UnknownType: [{ id: 1 }] }, null, 2), 'utf-8');
      const result = loadMockData(store, FIXTURES_DIR, filePath);
      // Returns true even if all types were skipped (file was valid JSON)
      expect(result).toBe(true);
    } finally {
      cleanup(filePath);
    }
  });
});
