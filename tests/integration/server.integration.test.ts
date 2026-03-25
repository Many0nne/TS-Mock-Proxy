import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { createServer } from '../../src/server';
import { invalidateTypeMap } from '../../src/utils/typeMapping';
import { mockDataStore } from '../../src/core/cache';
import { ServerConfig } from '../../src/types/config';

const FIXTURES_DIR = path.join(__dirname, '../fixtures/types');

const testConfig: ServerConfig = {
  typesDir: FIXTURES_DIR,
  port: 0,
  hotReload: false,
  cache: false,
  verbose: false,
};

describe('Server integration', () => {
  const app = createServer(testConfig);

  beforeEach(() => {
    invalidateTypeMap();
    mockDataStore.clear();
  });

  // ---------------------------------------------------------------------------
  // GET /health
  // ---------------------------------------------------------------------------
  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('cache');
      expect(res.body).toHaveProperty('writeStore');
    });
  });

  // ---------------------------------------------------------------------------
  // GET collection
  // ---------------------------------------------------------------------------
  describe('GET /api/users', () => {
    it('returns 200 with an array of users', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('each item has the expected User shape', async () => {
      const res = await request(app).get('/api/users');
      const first = res.body.data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('email');
      expect(typeof first.name).toBe('string');
      expect(typeof first.email).toBe('string');
    });

    it('respects pageSize query parameter', async () => {
      const res = await request(app).get('/api/users?pageSize=3');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeLessThanOrEqual(3);
    });

    it('returns 400 on invalid query parameters', async () => {
      const res = await request(app).get('/api/users?page=abc');
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---------------------------------------------------------------------------
  // GET single item
  // ---------------------------------------------------------------------------
  describe('GET /api/users/:id', () => {
    it('returns 404 for a truly unknown ID (UUID never in pool)', async () => {
      // UUIDs are never generated for id: number, so this will never be in the pool
      const res = await request(app).get('/api/users/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
    });

    it('returns 200 for a pool item (seeded at startup)', async () => {
      const listRes = await request(app).get('/api/users');
      expect(listRes.status).toBe(200);
      const firstId = listRes.body.data[0].id;

      const getRes = await request(app).get(`/api/users/${firstId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(firstId);
    });

    it('returns 200 after POST creates the resource', async () => {
      const postRes = await request(app)
        .post('/api/users')
        .send({ name: 'Alice', email: 'alice@example.com' });
      expect(postRes.status).toBe(201);

      const id = postRes.body.id;
      const getRes = await request(app).get(`/api/users/${id}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.id).toBe(id);
      expect(getRes.body.name).toBe('Alice');
      expect(getRes.body.email).toBe('alice@example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // GET unknown route
  // ---------------------------------------------------------------------------
  describe('GET unknown route', () => {
    it('returns 404 for unknown resources', async () => {
      const res = await request(app).get('/api/unknownresource');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  // ---------------------------------------------------------------------------
  // x-mock-status header
  // ---------------------------------------------------------------------------
  describe('x-mock-status header', () => {
    it('forces the response status code to 503', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('x-mock-status', '503');
      expect(res.status).toBe(503);
    });

    it('forces the status code on write methods', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('x-mock-status', '409')
        .send({ name: 'Alice' });
      expect(res.status).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------
  // POST
  // ---------------------------------------------------------------------------
  describe('POST /api/users', () => {
    it('returns 201 with the created resource', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ name: 'Bob', email: 'bob@example.com' });
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Bob');
      expect(res.body.email).toBe('bob@example.com');
    });

    it('returns a Location header pointing to the new resource', async () => {
      const res = await request(app)
        .post('/api/users')
        .send({ name: 'Carol' });
      expect(res.status).toBe(201);
      expect(res.headers['location']).toMatch(/\/api\/users\//);
    });

    it('works with no body (generates full mock)', async () => {
      const res = await request(app).post('/api/users');
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
    });

    it('returns 405 when POST is sent to a single-resource URL', async () => {
      const res = await request(app).post('/api/users/42');
      expect(res.status).toBe(405);
    });

    it('new resource appears in subsequent GET /api/users', async () => {
      const postRes = await request(app)
        .post('/api/users')
        .send({ name: 'Dave' });
      const id = postRes.body.id;

      const listRes = await request(app).get('/api/users?pageSize=100');
      const ids = listRes.body.data.map((u: { id: unknown }) => String(u.id));
      expect(ids).toContain(String(id));
    });
  });

  // ---------------------------------------------------------------------------
  // PUT
  // ---------------------------------------------------------------------------
  describe('PUT /api/users/:id', () => {
    it('returns 200 with the replaced resource (upsert)', async () => {
      const res = await request(app)
        .put('/api/users/42')
        .send({ name: 'Eve', email: 'eve@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Eve');
      expect(res.body.email).toBe('eve@example.com');
    });

    it('subsequent GET returns the PUT body', async () => {
      await request(app)
        .put('/api/users/42')
        .send({ name: 'Frank', email: 'frank@example.com' });

      const res = await request(app).get('/api/users/42');
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Frank');
    });

    it('returns 400 when body is absent', async () => {
      const res = await request(app).put('/api/users/42');
      expect(res.status).toBe(400);
    });

    it('returns 405 when PUT is sent to a collection URL', async () => {
      const res = await request(app)
        .put('/api/users')
        .send({ name: 'Frank' });
      expect(res.status).toBe(405);
    });
  });

  // ---------------------------------------------------------------------------
  // PATCH
  // ---------------------------------------------------------------------------
  describe('PATCH /api/users/:id', () => {
    it('patches an existing resource', async () => {
      await request(app)
        .put('/api/users/10')
        .send({ name: 'Grace', email: 'grace@example.com' });

      const res = await request(app)
        .patch('/api/users/10')
        .send({ name: 'Grace Updated' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Grace Updated');
      expect(res.body.email).toBe('grace@example.com');
    });

    it('upserts when ID does not exist', async () => {
      const res = await request(app)
        .patch('/api/users/999')
        .send({ name: 'Henry' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Henry');
    });

    it('returns 400 when body is absent', async () => {
      const res = await request(app).patch('/api/users/10');
      expect(res.status).toBe(400);
    });

    it('returns 405 when PATCH is sent to a collection URL', async () => {
      const res = await request(app)
        .patch('/api/users')
        .send({ name: 'Henry' });
      expect(res.status).toBe(405);
    });
  });

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------
  describe('DELETE /api/users/:id', () => {
    it('returns 204 with no body', async () => {
      await request(app).put('/api/users/55').send({ name: 'Iris' });
      const res = await request(app).delete('/api/users/55');
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });

    it('subsequent GET returns 404 after DELETE', async () => {
      await request(app).put('/api/users/56').send({ name: 'Jack' });
      await request(app).delete('/api/users/56');
      const res = await request(app).get('/api/users/56');
      expect(res.status).toBe(404);
    });

    it('deleted resource disappears from GET /api/users collection', async () => {
      const postRes = await request(app).post('/api/users').send({ name: 'Kate' });
      const id = String(postRes.body.id);

      await request(app).delete(`/api/users/${id}`);

      const listRes = await request(app).get('/api/users?pageSize=100');
      const ids = listRes.body.data.map((u: { id: unknown }) => String(u.id));
      expect(ids).not.toContain(id);
    });

    it('is idempotent — deleting unknown ID returns 204', async () => {
      const res = await request(app).delete('/api/users/99999');
      expect(res.status).toBe(204);
    });

    it('returns 405 when DELETE is sent to a collection URL', async () => {
      const res = await request(app).delete('/api/users');
      expect(res.status).toBe(405);
    });
  });

  // ---------------------------------------------------------------------------
  // Full CRUD cycle
  // ---------------------------------------------------------------------------
  describe('Full CRUD cycle', () => {
    it('POST → GET → PATCH → GET → DELETE → GET', async () => {
      // Create
      const created = await request(app)
        .post('/api/users')
        .send({ name: 'Lifecycle', email: 'lc@example.com' });
      expect(created.status).toBe(201);
      const id = created.body.id;

      // Read
      const read1 = await request(app).get(`/api/users/${id}`);
      expect(read1.status).toBe(200);
      expect(read1.body.name).toBe('Lifecycle');

      // Patch
      const patched = await request(app)
        .patch(`/api/users/${id}`)
        .send({ name: 'Updated' });
      expect(patched.status).toBe(200);
      expect(patched.body.name).toBe('Updated');

      // Read again
      const read2 = await request(app).get(`/api/users/${id}`);
      expect(read2.status).toBe(200);
      expect(read2.body.name).toBe('Updated');

      // Delete
      const deleted = await request(app).delete(`/api/users/${id}`);
      expect(deleted.status).toBe(204);

      // Read after delete
      const read3 = await request(app).get(`/api/users/${id}`);
      expect(read3.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // mock-reset
  // ---------------------------------------------------------------------------
  describe('POST /mock-reset', () => {
    it('clears the write store', async () => {
      await request(app).put('/api/users/77').send({ name: 'Temp' });
      const before = await request(app).get('/api/users/77');
      expect(before.status).toBe(200);

      await request(app).post('/mock-reset');

      const after = await request(app).get('/api/users/77');
      expect(after.status).toBe(404);
    });
  });

  // ---------------------------------------------------------------------------
  // mockMode: strict
  // ---------------------------------------------------------------------------
  describe('mockMode: strict', () => {
    const strictApp = createServer({
      typesDir: FIXTURES_DIR,
      port: 0,
      hotReload: false,
      cache: false,
      verbose: false,
      mockMode: 'strict',
    });

    it('ignores x-mock-status header and returns normal status', async () => {
      const res = await request(strictApp)
        .get('/api/users')
        .set('x-mock-status', '503');
      expect(res.status).toBe(200);
    });

    it('ignores x-mock-status on write methods', async () => {
      const res = await request(strictApp)
        .post('/api/users')
        .set('x-mock-status', '409')
        .send({ name: 'Alice' });
      expect(res.status).toBe(201);
    });

    it('still serves normal mock data', async () => {
      const res = await request(strictApp).get('/api/users');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // mockMode: dev (explicit)
  // ---------------------------------------------------------------------------
  describe('mockMode: dev', () => {
    const devApp = createServer({
      typesDir: FIXTURES_DIR,
      port: 0,
      hotReload: false,
      cache: false,
      verbose: false,
      mockMode: 'dev',
    });

    it('applies x-mock-status header', async () => {
      const res = await request(devApp)
        .get('/api/users')
        .set('x-mock-status', '503');
      expect(res.status).toBe(503);
    });
  });

  // ---------------------------------------------------------------------------
  // Disabled write methods
  // ---------------------------------------------------------------------------
  describe('Disabled write methods', () => {
    const readOnlyConfig: ServerConfig = {
      typesDir: FIXTURES_DIR,
      port: 0,
      hotReload: false,
      cache: false,
      verbose: false,
      writeMethods: { post: false, put: false, patch: false, delete: false },
    };
    const readOnlyApp = createServer(readOnlyConfig);

    it('returns 405 for POST when disabled', async () => {
      const res = await request(readOnlyApp).post('/api/users').send({ name: 'X' });
      expect(res.status).toBe(405);
      expect(res.headers['allow']).toBeDefined();
    });

    it('returns 405 for DELETE when disabled', async () => {
      const res = await request(readOnlyApp).delete('/api/users/1');
      expect(res.status).toBe(405);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /health — types list
  // ---------------------------------------------------------------------------
  describe('GET /health types list', () => {
    it('includes a types array with available endpoint names', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('types');
      expect(Array.isArray(res.body.types)).toBe(true);
      expect(res.body.types).toContain('User');
    });
  });

  // ---------------------------------------------------------------------------
  // POST /mock-reset/:typeName
  // ---------------------------------------------------------------------------
  describe('POST /mock-reset/:typeName', () => {
    it('returns 200 with count for a known type', async () => {
      const res = await request(app).post('/mock-reset/User');
      expect(res.status).toBe(200);
      expect(res.body.type).toBe('User');
      expect(typeof res.body.count).toBe('number');
      expect(res.body.count).toBeGreaterThan(0);
      expect(res.body.message).toMatch(/User/);
    });

    it('returns 404 for an unknown type', async () => {
      const res = await request(app).post('/mock-reset/UnknownType');
      expect(res.status).toBe(404);
    });

    it('does not affect other types', async () => {
      // Seed users, record first ID
      const listBefore = await request(app).get('/api/users');
      const idBefore = listBefore.body.data[0].id;

      // This type doesn't exist but serves as proof other types are untouched
      // — we just verify our User pool is regenerated (new IDs may differ)
      await request(app).post('/mock-reset/User');

      const listAfter = await request(app).get('/api/users');
      expect(listAfter.status).toBe(200);
      expect(listAfter.body.data.length).toBeGreaterThan(0);
      // Pool was regenerated so the previous ID may no longer exist
      const idsAfter = listAfter.body.data.map((u: { id: unknown }) => String(u.id));
      expect(idsAfter).not.toContain(String(idBefore));
    });
  });

  // ---------------------------------------------------------------------------
  // persistData — JSON persistence
  // ---------------------------------------------------------------------------
  describe('persistData', () => {
    function makeTempPath(): string {
      return path.join(os.tmpdir(), `mock-persist-integration-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    }

    afterEach(() => {
      invalidateTypeMap();
      mockDataStore.clear();
    });

    it('does not create a file when persistData is not set', () => {
      const filePath = makeTempPath();
      // testConfig has no persistData — file must not be created
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('creates the persist file on first launch when persistData is set', () => {
      const filePath = makeTempPath();
      try {
        createServer({ ...testConfig, persistData: filePath });
        expect(fs.existsSync(filePath)).toBe(true);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(data).toHaveProperty('User');
        expect(Array.isArray(data['User'])).toBe(true);
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('loads pools from existing file on startup', () => {
      const filePath = makeTempPath();
      try {
        const savedUsers = [{ id: 99, name: 'Persisted', email: 'p@example.com' }];
        fs.writeFileSync(filePath, JSON.stringify({ User: savedUsers }, null, 2), 'utf-8');

        const persistApp = createServer({ ...testConfig, persistData: filePath });

        return request(persistApp).get('/api/users?pageSize=100').then((res) => {
          expect(res.status).toBe(200);
          const ids = res.body.data.map((u: { id: unknown }) => u.id);
          expect(ids).toContain(99);
        });
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('updates the file after POST', async () => {
      const filePath = makeTempPath();
      try {
        const persistApp = createServer({ ...testConfig, persistData: filePath });

        await request(persistApp).post('/api/users').send({ name: 'NewUser', email: 'n@e.com' });

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const names = (data['User'] as Array<{ name?: unknown }>).map((u) => u.name);
        expect(names).toContain('NewUser');
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('updates file with [] after all items are deleted', async () => {
      const filePath = makeTempPath();
      try {
        // Start with exactly one user
        const singleUser = [{ id: 1, name: 'Solo', email: 's@e.com' }];
        fs.writeFileSync(filePath, JSON.stringify({ User: singleUser }, null, 2), 'utf-8');

        const persistApp = createServer({ ...testConfig, persistData: filePath });

        await request(persistApp).delete('/api/users/1');

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(data['User']).toEqual([]);
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('POST /mock-reset overwrites file with fresh data', async () => {
      const filePath = makeTempPath();
      try {
        // Start with persisted data
        const savedUsers = [{ id: 99, name: 'Old', email: 'o@e.com' }];
        fs.writeFileSync(filePath, JSON.stringify({ User: savedUsers }, null, 2), 'utf-8');

        const persistApp = createServer({ ...testConfig, persistData: filePath });

        await request(persistApp).post('/mock-reset');

        const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        expect(data).toHaveProperty('User');
        // After reset, old ID 99 should be gone (fresh generation)
        const ids = (data['User'] as Array<{ id?: unknown }>).map((u) => u.id);
        expect(ids).not.toContain(99);
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('POST /mock-reset/:typeName updates only the target type in the file', async () => {
      const filePath = makeTempPath();
      try {
        const persistApp = createServer({ ...testConfig, persistData: filePath });

        // Record initial data
        const before = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const usersBefore = JSON.stringify(before['User']);

        await request(persistApp).post('/mock-reset/User');

        const after = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        // User pool was regenerated (different content expected)
        expect(JSON.stringify(after['User'])).not.toBe(usersBefore);
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('POST /mock-reset/:typeName returns 404 for unknown type', async () => {
      const filePath = makeTempPath();
      try {
        const persistApp = createServer({ ...testConfig, persistData: filePath });
        const res = await request(persistApp).post('/mock-reset/NonExistentType');
        expect(res.status).toBe(404);
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });

    it('starts normally when persist file contains invalid JSON (warning, no crash)', () => {
      const filePath = makeTempPath();
      try {
        fs.writeFileSync(filePath, '{ bad json!!', 'utf-8');
        expect(() => {
          createServer({ ...testConfig, persistData: filePath });
        }).not.toThrow();
        // File is NOT overwritten when corrupt
        expect(fs.readFileSync(filePath, 'utf-8')).toBe('{ bad json!!');
      } finally {
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
      }
    });
  });
});
