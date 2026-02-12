import { Request, Response } from 'express';
import { ServerConfig } from '../types/config';
import { findTypeForUrl } from '../utils/typeMapping';
import { generateMockFromInterface, generateMockArray } from './parser';
import { schemaCache } from './cache';
import { logger } from '../utils/logger';

/**
 * Dynamic route handler - Matches the URL with a type and generates the mock
 */
export function dynamicRouteHandler(config: ServerConfig) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const url = req.url;

      // Prepare the list of all directories to scan
      const allDirs = [config.contractsDir, ...(config.externalDirs || [])];

      // Search for the type corresponding to the URL
      const mapping = findTypeForUrl(url, allDirs);

      if (!mapping) {
        // Type not found - return 404
        const statusCode = res.locals.forcedStatus || 404;
        res.status(statusCode).json({
          error: 'Type not found',
          message: `No TypeScript interface matches the URL: ${url}`,
          hint: 'Make sure you have exported an interface in your contracts directory',
        });
        return;
      }

      logger.debug(
        `Matched URL "${url}" -> Type "${mapping.typeName}" (array: ${mapping.isArray})`
      );

      // Check if the status is forced by the x-mock-status header
      const forcedStatus = res.locals.forcedStatus as number | undefined;

      if (forcedStatus && forcedStatus >= 400) {
        // Return a forced error
        res.status(forcedStatus).json({
          error: 'Forced error',
          message: `Status ${forcedStatus} forced via x-mock-status header`,
        });
        return;
      }

      // Check the cache first (only for single objects, not arrays)
      let mockData: Record<string, unknown> | Record<string, unknown>[];

      if (config.cache && mapping.filePath && !mapping.isArray) {
        const cached = schemaCache.get(mapping.typeName, mapping.filePath);

        if (cached) {
          mockData = cached.schema;
          res.status(forcedStatus || 200).json(mockData);
          return;
        }
      }

      // Generate the mock data
      if (mapping.isArray) {
        mockData = generateMockArray(
          mapping.filePath!,
          mapping.typeName
        );
      } else {
        mockData = generateMockFromInterface(
          mapping.filePath!,
          mapping.typeName
        );
      }

      // Store in cache if enabled
      if (config.cache && mapping.filePath && !mapping.isArray) {
        schemaCache.set(
          mapping.typeName,
          mapping.filePath,
          mockData as Record<string, unknown>
        );
      }

      // Return the mocked data
      res.status(forcedStatus || 200).json(mockData);
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
