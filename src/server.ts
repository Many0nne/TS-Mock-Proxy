import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ServerConfig } from './types/config';
import { logger } from './utils/logger';
import { requestLoggerMiddleware } from './middlewares/logger';
import { latencyMiddleware } from './middlewares/latency';
import { statusOverrideMiddleware } from './middlewares/statusOverride';
import { dynamicRouteHandler } from './core/router';
import { startFileWatcher } from './utils/fileWatcher';
import { schemaCache } from './core/cache';
import { generateOpenAPISpec } from './core/swagger';
import type { FSWatcher } from 'chokidar';

/**
 * Creates and configures the Express server
 */
export function createServer(config: ServerConfig): Express {
  const app = express();

  // Store swagger spec in the app locals so it can be updated on file changes
  let swaggerSpec = generateOpenAPISpec(config);
  app.locals.swaggerSpec = swaggerSpec;

  // Global middlewares
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Logging middleware
  app.use(requestLoggerMiddleware);

  // Status override middleware
  app.use(statusOverrideMiddleware);

  // Latency middleware (if configured)
  if (config.latency) {
    app.use(latencyMiddleware(config.latency.min, config.latency.max));
  }

  // Health route
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      cache: schemaCache.getStats(),
      config: {
        typesDir: config.typesDir,
        port: config.port,
        hotReload: config.hotReload,
        cache: config.cache,
      },
    });
  });

  // Swagger documentation - use app.locals.swaggerSpec for dynamic updates
  app.use('/api-docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
    const spec = app.locals.swaggerSpec || swaggerSpec;
    swaggerUi.setup(spec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'TS Mock Proxy API Docs',
    })(req, res, next);
  });

  // Proxy mode removed: requests are handled only by mock dynamic routes

  // Catch-all route for dynamic routing
  app.all('*', dynamicRouteHandler(config));

  return app;
}

/**
 * Starts the server on the configured port
 */
export function startServer(
  config: ServerConfig
): { app: Express; watcher?: FSWatcher } {
  const app = createServer(config);

  // Configure the logger in verbose mode if necessary
  if (config.verbose) {
    logger.info('Verbose mode enabled');
  }

  // Start the server
  const server = app.listen(config.port, () => {
    logger.server(config.port);
    logger.info(`Types directory: ${config.typesDir}`);

    if (config.latency) {
      logger.info(
        `Latency simulation: ${config.latency.min}-${config.latency.max}ms`
      );
    }

    if (config.cache) {
      logger.success('Schema cache enabled');
    }

    logger.success(`Swagger UI available at http://localhost:${config.port}/api-docs`);
  });

  // Start the file watcher if hot-reload is enabled
  let watcher: FSWatcher | undefined;

  if (config.hotReload) {
    watcher = startFileWatcher(config.typesDir, (filePath) => {
      logger.info(`Type file updated: ${filePath}`);
      
      // Regenerate Swagger spec to include new endpoints
      const newSwaggerSpec = generateOpenAPISpec(config);
      app.locals.swaggerSpec = newSwaggerSpec;
      logger.success('Swagger spec regenerated with updated endpoints');
    });
  }

  // Graceful shutdown handling
  process.on('SIGINT', () => {
    logger.info('\nShutting down gracefully...');

    if (watcher) {
      watcher.close();
    }

    server.close(() => {
      logger.success('Server closed');
      process.exit(0);
    });
  });

  return { app, watcher };
}
