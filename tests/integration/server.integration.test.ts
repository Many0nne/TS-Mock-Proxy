import * as path from 'path';
import request from 'supertest';
import { createServer } from '../../src/server';
import { invalidateTypeMap } from '../../src/utils/typeMapping';
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
    // Ensure type map is rebuilt for each test
    invalidateTypeMap();
  });

  describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('cache');
    });
  });

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
      expect(first.id).toBeDefined();
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

  describe('GET /api/users/:id', () => {
    it('returns 200 with a single user object', async () => {
      const res = await request(app).get('/api/users/1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
      expect(res.body).toHaveProperty('name');
      expect(res.body).toHaveProperty('email');
    });
  });

  describe('GET unknown route', () => {
    it('returns 404 for unknown resources', async () => {
      const res = await request(app).get('/api/unknownresource');
      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
    });
  });

  describe('x-mock-status header', () => {
    it('forces the response status code to 503', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('x-mock-status', '503');
      expect(res.status).toBe(503);
    });
  });
});
