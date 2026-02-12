import express, { Express } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { ServerConfig } from './types/config';
import { logger } from './utils/logger';
import { requestLoggerMiddleware } from './middlewares/logger';
import { latencyMiddleware } from './middlewares/latency';
import { statusOverrideMiddleware } from './middlewares/statusOverride';
import { dynamicRouteHandler } from './core/router';
import { createProxyFallback } from './core/proxy';
import { startFileWatcher } from './utils/fileWatcher';
import { schemaCache } from './core/cache';
import { generateOpenAPISpec } from './core/swagger';
import type { FSWatcher } from 'chokidar';

/**
 * Creates and configures the Express server
 */
export function createServer(config: ServerConfig): Express {
  const app = express();

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
        contractsDir: config.contractsDir,
        externalDirs: config.externalDirs,
        port: config.port,
        targetUrl: config.targetUrl,
        hotReload: config.hotReload,
        cache: config.cache,
      },
    });
  });

  // Swagger documentation
  const swaggerSpec = generateOpenAPISpec(config);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'TS Mock Proxy API Docs',
  }));

  // Proxy mode with fallback (if targetUrl is configured)
  if (config.targetUrl) {
    app.use(createProxyFallback(config));
  }

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
    logger.info(`Contracts directory: ${config.contractsDir}`);

    if (config.externalDirs && config.externalDirs.length > 0) {
      logger.info(`External directories (${config.externalDirs.length}):`);
      config.externalDirs.forEach(dir => logger.info(`  - ${dir}`));
    }

    if (config.targetUrl) {
      logger.info(`Proxy target: ${config.targetUrl}`);
    }

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
    const allDirs = [config.contractsDir, ...(config.externalDirs || [])];
    watcher = startFileWatcher(allDirs, (filePath) => {
      logger.info(`Contract updated: ${filePath}`);
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
