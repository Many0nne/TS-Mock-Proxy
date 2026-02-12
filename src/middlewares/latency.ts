import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Middleware to simulate network latency
 *
 * @param min - Minimum latency in ms
 * @param max - Maximum latency in ms
 */
export function latencyMiddleware(min: number, max: number) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;

    logger.debug(`Simulating latency: ${delay}ms for ${req.method} ${req.url}`);

    await new Promise((resolve) => setTimeout(resolve, delay));

    next();
  };
}
