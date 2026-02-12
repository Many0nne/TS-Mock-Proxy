import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to log all HTTP requests
 */
export function requestLoggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();

  // Intercept the end of the response to log the status
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.request(req.method, req.url, res.statusCode);
    logger.debug(`Response time: ${duration}ms`);
  });

  next();
}
