import { Request, Response } from 'express';
import { ServerConfig, ApiErrorResponse } from '../types/config';
import { findTypeForUrl } from '../utils/typeMapping';
import { parseUrlSegments, isIdSegment } from '../utils/pluralize';
import { generateMockFromInterface, generateMockArray } from './parser';
import { mockDataStore } from './cache';
import { logger } from '../utils/logger';
import {
  parseQueryParams,
  validateSortFields,
  applyPagination,
  POOL_SIZE,
} from './queryProcessor';
import type { WriteMethod } from '../types/config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts the ID value from a URL (last segment that looks like an ID). */
function extractIdFromUrl(url: string): string | undefined {
  const segments = parseUrlSegments(url);
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isIdSegment(segments[i]!)) {
      return segments[i];
    }
  }
  return undefined;
}

/** Returns the value of the first recognised ID field (id, uuid, _id) in a mock object. */
function extractMockId(obj: Record<string, unknown>): string | undefined {
  for (const field of ['id', 'uuid', '_id']) {
    if (obj[field] !== undefined) {
      return String(obj[field]);
    }
  }
  return undefined;
}

/** Returns the name of the first recognised ID field present in the object, if any. */
function findIdField(obj: Record<string, unknown>): string | undefined {
  for (const field of ['id', 'uuid', '_id']) {
    if (field in obj) return field;
  }
  return undefined;
}

/** Returns true when the given write method is enabled in the config. */
function isWriteMethodEnabled(config: ServerConfig, method: WriteMethod): boolean {
  const wm = config.writeMethods;
  if (!wm) return true;
  return wm[method] !== false;
}

/** Builds the Allow header value for collection endpoints. */
function allowForCollection(config: ServerConfig): string {
  const methods = ['GET'];
  if (isWriteMethodEnabled(config, 'post')) methods.push('POST');
  return methods.join(', ');
}

/** Builds the Allow header value for single-item endpoints. */
function allowForSingle(config: ServerConfig): string {
  const methods = ['GET'];
  if (isWriteMethodEnabled(config, 'put'))    methods.push('PUT');
  if (isWriteMethodEnabled(config, 'patch'))  methods.push('PATCH');
  if (isWriteMethodEnabled(config, 'delete')) methods.push('DELETE');
  return methods.join(', ');
}

/**
 * Updates the pool entry for a given ID, or appends it if not already present.
 * No-op when the pool has not been seeded yet.
 */
function updatePoolEntry(
  typeName: string,
  filePath: string,
  id: string,
  obj: Record<string, unknown>
): void {
  const pool = mockDataStore.getPool(typeName, filePath);
  if (!pool) return;
  const idx = pool.findIndex((item) => extractMockId(item) === id);
  if (idx >= 0) {
    pool[idx] = obj;
  } else {
    pool.push(obj);
  }
  mockDataStore.setPool(typeName, filePath, pool);
}

/**
 * Builds the "live pool" for a collection endpoint by merging the seeded pool
 * with write-store entries, excluding deleted items and replacing overridden ones.
 */
function buildLivePool(
  typeName: string,
  filePath: string,
  pool: Record<string, unknown>[]
): Record<string, unknown>[] {
  const deletedIds = mockDataStore.getDeletedIds(typeName, filePath);
  const writeEntries = mockDataStore.getAllWriteEntries(typeName, filePath);

  const fromPool = pool.filter((item) => {
    const id = extractMockId(item);
    if (id === undefined) return true;
    if (deletedIds.has(id)) return false;
    if (writeEntries.has(id)) return false; // write-store version takes precedence
    return true;
  });

  const fromWriteStore = Array.from(writeEntries.values()).filter((item) => {
    const id = extractMockId(item);
    return id === undefined || !deletedIds.has(id);
  });

  return [...fromWriteStore, ...fromPool];
}

// ---------------------------------------------------------------------------
// Method handlers
// ---------------------------------------------------------------------------

async function handleGet(
  req: Request,
  res: Response,
  mapping: { typeName: string; isArray: boolean; filePath?: string },
  _config: ServerConfig,
  filePath: string,
  forcedStatus: number | undefined
): Promise<void> {
  if (mapping.isArray) {
    // Sanitize query params
    const sanitizedQuery: Record<string, string | string[] | undefined> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' || value === undefined) {
        sanitizedQuery[key] = value;
      } else if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
        sanitizedQuery[key] = value as string[];
      }
    }

    const parsed = parseQueryParams(sanitizedQuery);
    if ('error' in parsed) {
      res.status(400).json({ error: 'Invalid query parameters', message: parsed.error });
      return;
    }

    // Seed pool on first request
    let pool = mockDataStore.getPool(mapping.typeName, filePath);
    if (!pool) {
      pool = generateMockArray(filePath, mapping.typeName, { arrayLength: POOL_SIZE });
      mockDataStore.setPool(mapping.typeName, filePath, pool);
    }

    const livePool = buildLivePool(mapping.typeName, filePath, pool);

    if (parsed.sort.length > 0 && livePool.length > 0) {
      const firstItem = livePool[0];
      const allowedFields = new Set(firstItem ? Object.keys(firstItem) : []);
      const sortError = validateSortFields(parsed.sort, allowedFields);
      if (sortError) {
        res.status(400).json({ error: 'Invalid sort parameter', message: sortError });
        return;
      }
    }

    res.status(forcedStatus || 200).json(applyPagination(livePool, parsed));
  } else {
    // Single-item GET — checks deletedIds, then write store, then seeded pool
    const urlId = extractIdFromUrl(req.path);

    if (urlId !== undefined) {
      const deletedIds = mockDataStore.getDeletedIds(mapping.typeName, filePath);
      if (deletedIds.has(urlId)) {
        res.status(404).json({
          error: 'Not Found',
          message: `Resource with ID ${urlId} has been deleted`,
        });
        return;
      }

      // Check write store (highest priority — reflects PUT/PATCH)
      const stored = mockDataStore.getById(mapping.typeName, filePath, urlId);
      if (stored) {
        res.status(forcedStatus || 200).json(stored);
        return;
      }

      // Fall back to the seeded pool
      const pool = mockDataStore.getPool(mapping.typeName, filePath);
      if (pool) {
        const poolItem = pool.find((item) => extractMockId(item) === urlId);
        if (poolItem) {
          res.status(forcedStatus || 200).json(poolItem);
          return;
        }
      }
    }

    res.status(404).json({
      error: 'Not Found',
      message: `Resource not found`,
    });
  }
}

async function handlePost(
  req: Request,
  res: Response,
  mapping: { typeName: string; isArray: boolean; filePath?: string },
  config: ServerConfig,
  filePath: string,
  forcedStatus: number | undefined
): Promise<void> {
  // POST on a single-item URL (col-id) is not semantically valid
  if (!mapping.isArray) {
    res
      .status(405)
      .set('Allow', allowForSingle(config))
      .json({
        error: 'Method Not Allowed',
        message: 'POST is not allowed on a single resource URL. Use the collection endpoint.',
      });
    return;
  }

  if (!isWriteMethodEnabled(config, 'post')) {
    res
      .status(405)
      .set('Allow', allowForCollection(config))
      .json({ error: 'Method Not Allowed', message: 'POST method is disabled' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;

  const mock = generateMockFromInterface(filePath, mapping.typeName);
  const merged: Record<string, unknown> =
    body && typeof body === 'object' && !Array.isArray(body)
      ? { ...mock, ...body }
      : { ...mock };

  const id = extractMockId(merged);

  if (id !== undefined) {
    mockDataStore.setById(mapping.typeName, filePath, id, merged);
    updatePoolEntry(mapping.typeName, filePath, id, merged);
  }

  const basePath = req.path.replace(/\/$/, '');
  const location = id !== undefined ? `${basePath}/${id}` : basePath;

  res.status(forcedStatus || 201).set('Location', location).json(merged);
}

async function handlePut(
  req: Request,
  res: Response,
  mapping: { typeName: string; isArray: boolean; filePath?: string },
  config: ServerConfig,
  filePath: string,
  forcedStatus: number | undefined
): Promise<void> {
  if (mapping.isArray) {
    res
      .status(405)
      .set('Allow', allowForCollection(config))
      .json({
        error: 'Method Not Allowed',
        message: 'PUT is not allowed on a collection URL. Target a single resource.',
      });
    return;
  }

  if (!isWriteMethodEnabled(config, 'put')) {
    res
      .status(405)
      .set('Allow', allowForSingle(config))
      .json({ error: 'Method Not Allowed', message: 'PUT method is disabled' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    res.status(400).json({ error: 'Bad Request', message: 'Request body is required for PUT' });
    return;
  }

  const urlId = extractIdFromUrl(req.path);
  const mock = generateMockFromInterface(filePath, mapping.typeName);
  const merged: Record<string, unknown> = { ...mock, ...body };

  // Ensure the stored ID matches the URL ID
  if (urlId !== undefined) {
    const idField = findIdField(merged) ?? 'id';
    const existing = merged[idField];
    merged[idField] = typeof existing === 'number' ? Number(urlId) : urlId;
  }

  const id = urlId ?? extractMockId(merged);
  if (id !== undefined) {
    mockDataStore.setById(mapping.typeName, filePath, id, merged);
    updatePoolEntry(mapping.typeName, filePath, id, merged);
  }

  res.status(forcedStatus || 200).json(merged);
}

async function handlePatch(
  req: Request,
  res: Response,
  mapping: { typeName: string; isArray: boolean; filePath?: string },
  config: ServerConfig,
  filePath: string,
  forcedStatus: number | undefined
): Promise<void> {
  if (mapping.isArray) {
    res
      .status(405)
      .set('Allow', allowForCollection(config))
      .json({
        error: 'Method Not Allowed',
        message: 'PATCH is not allowed on a collection URL. Target a single resource.',
      });
    return;
  }

  if (!isWriteMethodEnabled(config, 'patch')) {
    res
      .status(405)
      .set('Allow', allowForSingle(config))
      .json({ error: 'Method Not Allowed', message: 'PATCH method is disabled' });
    return;
  }

  const body = req.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    res.status(400).json({ error: 'Bad Request', message: 'Request body is required for PATCH' });
    return;
  }

  const urlId = extractIdFromUrl(req.path);

  // If the resource was previously created, patch on top of stored object; otherwise upsert
  let base: Record<string, unknown>;
  if (urlId !== undefined) {
    const stored = mockDataStore.getById(mapping.typeName, filePath, urlId);
    if (stored) {
      base = stored;
    } else {
      const pool = mockDataStore.getPool(mapping.typeName, filePath);
      const poolItem = pool?.find((item) => extractMockId(item) === urlId);
      base = poolItem ?? generateMockFromInterface(filePath, mapping.typeName);
    }
  } else {
    base = generateMockFromInterface(filePath, mapping.typeName);
  }

  const merged: Record<string, unknown> = { ...base, ...body };

  // Ensure the stored ID matches the URL ID
  if (urlId !== undefined) {
    const idField = findIdField(merged) ?? 'id';
    const existing = base[idField];
    merged[idField] = typeof existing === 'number' ? Number(urlId) : urlId;
  }

  const id = urlId ?? extractMockId(merged);
  if (id !== undefined) {
    mockDataStore.setById(mapping.typeName, filePath, id, merged);
    updatePoolEntry(mapping.typeName, filePath, id, merged);
  }

  res.status(forcedStatus || 200).json(merged);
}

async function handleDelete(
  req: Request,
  res: Response,
  mapping: { typeName: string; isArray: boolean; filePath?: string },
  config: ServerConfig,
  filePath: string,
  forcedStatus: number | undefined
): Promise<void> {
  if (mapping.isArray) {
    res
      .status(405)
      .set('Allow', allowForCollection(config))
      .json({
        error: 'Method Not Allowed',
        message: 'DELETE is not allowed on a collection URL. Target a single resource.',
      });
    return;
  }

  if (!isWriteMethodEnabled(config, 'delete')) {
    res
      .status(405)
      .set('Allow', allowForSingle(config))
      .json({ error: 'Method Not Allowed', message: 'DELETE method is disabled' });
    return;
  }

  const urlId = extractIdFromUrl(req.path);

  if (urlId !== undefined) {
    mockDataStore.markDeleted(mapping.typeName, filePath, urlId);
    // Remove from pool
    const pool = mockDataStore.getPool(mapping.typeName, filePath);
    if (pool) {
      const newPool = pool.filter((item) => extractMockId(item) !== urlId);
      mockDataStore.setPool(mapping.typeName, filePath, newPool);
    }
  }

  res.status(forcedStatus || 204).send();
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

/**
 * Dynamic route handler - Matches the URL with a type and generates the mock
 */
export function dynamicRouteHandler(config: ServerConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const url = req.path;
      const method = req.method.toUpperCase();

      const mapping = findTypeForUrl(url, config.typesDir);

      if (!mapping) {
        const statusCode = res.locals.forcedStatus || 404;
        const notFoundError: ApiErrorResponse = {
          error: 'Type not found',
          message: `No TypeScript interface matches the URL: ${url}`,
          hint: 'Make sure you have exported an interface in your contracts directory',
        };
        res.status(statusCode).json(notFoundError);
        return;
      }

      logger.debug(
        `Matched URL "${url}" -> Type "${mapping.typeName}" (array: ${mapping.isArray})`
      );

      const forcedStatus = res.locals.forcedStatus as number | undefined;

      if (forcedStatus && forcedStatus >= 400) {
        res.status(forcedStatus).json({
          error: 'Forced error',
          message: `Status ${forcedStatus} forced via x-mock-status header`,
        });
        return;
      }

      const { filePath } = mapping;
      if (!filePath) {
        res.status(500).json({
          error: 'Mock generation failed',
          message: `No file path found for type "${mapping.typeName}"`,
        });
        return;
      }

      switch (method) {
        case 'POST':
          await handlePost(req, res, mapping, config, filePath, forcedStatus);
          break;
        case 'PUT':
          await handlePut(req, res, mapping, config, filePath, forcedStatus);
          break;
        case 'PATCH':
          await handlePatch(req, res, mapping, config, filePath, forcedStatus);
          break;
        case 'DELETE':
          await handleDelete(req, res, mapping, config, filePath, forcedStatus);
          break;
        default:
          await handleGet(req, res, mapping, config, filePath, forcedStatus);
      }
    } catch (error) {
      logger.error('Error generating mock:', error);
      const statusCode = res.locals.forcedStatus || 500;
      res.status(statusCode).json({
        error: 'Mock generation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };
}

