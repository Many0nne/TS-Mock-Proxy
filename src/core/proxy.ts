import { createProxyMiddleware } from 'http-proxy-middleware';
import { Request, Response, NextFunction } from 'express';
import { ServerConfig } from '../types/config';
import { findTypeForUrl } from '../utils/typeMapping';
import { logger } from '../utils/logger';

/**
 * Proxy middleware with intelligent fallback
 * If the type exists -> pass to the next route (mock)
 * Otherwise -> redirect to the real backend
 */
export function createProxyFallback(config: ServerConfig) {
  if (!config.targetUrl) {
    // No proxy configured, return a no-op middleware
    return (_req: Request, _res: Response, next: NextFunction) => next();
  }

  // Create the proxy middleware
  const proxy = createProxyMiddleware({
    target: config.targetUrl,
    changeOrigin: true,
    onProxyReq: (_proxyReq, req) => {
      logger.info(`[PROXY] Forwarding ${req.method} ${req.url} -> ${config.targetUrl}`);
    },
    onProxyRes: (proxyRes, req) => {
      logger.debug(`[PROXY] Response ${proxyRes.statusCode} from ${req.url}`);
    },
    onError: (err, _req, res) => {
      logger.error(`[PROXY] Error: ${err.message}`);
      if (res instanceof Response) {
        res.status(502).json({
          error: 'Proxy Error',
          message: 'Failed to reach the target backend',
          details: err.message,
        });
      }
    },
  });

  // Return a middleware that decides between mock and proxy
  return (req: Request, res: Response, next: NextFunction) => {
    // Prepare the list of all directories to scan
    const allDirs = [config.contractsDir, ...(config.externalDirs || [])];
    const mapping = findTypeForUrl(req.url, allDirs);

    if (mapping) {
      // Type found -> use the mock (pass to next route)
      logger.debug(`[PROXY] Type found for ${req.url}, using mock`);
      next();
    } else {
      // Type not found -> redirect to backend
      logger.debug(`[PROXY] No type found for ${req.url}, forwarding to backend`);
      proxy(req, res, next);
    }
  };
}
