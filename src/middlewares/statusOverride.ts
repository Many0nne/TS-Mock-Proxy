import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to force an HTTP status via a header
 * Header: x-mock-status: 404 or x-mock-status: 500
 */
export function statusOverrideMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const mockStatus = req.headers['x-mock-status'];

  if (mockStatus) {
    const statusCode = parseInt(mockStatus as string, 10);

    if (!isNaN(statusCode) && statusCode >= 100 && statusCode < 600) {
      logger.debug(`Status override: ${statusCode} for ${req.method} ${req.url}`);

      // Store the forced status in res.locals for later use
      res.locals.forcedStatus = statusCode;
    } else {
      logger.warn(`Invalid x-mock-status header: ${mockStatus}`);
    }
  }

  next();
}
