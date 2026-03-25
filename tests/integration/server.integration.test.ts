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
});
