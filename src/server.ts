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
import { schemaCache, mockDataStore } from './core/cache';
import { generateOpenAPISpec } from './core/swagger';
import { buildTypeMap } from './utils/typeMapping';
import { generateMockArray } from './core/parser';
import { POOL_SIZE } from './core/queryProcessor';
import type { FSWatcher } from 'chokidar';

/**
 * Seeds all collection pools for every @endpoint interface found in typesDir.
 * Already-seeded pools are left untouched.
 */
function seedAllPools(config: ServerConfig): void {
  const typeMap = buildTypeMap(config.typesDir);
  typeMap.forEach((filePath, typeName) => {
    if (!mockDataStore.getPool(typeName, filePath)) {
      const pool = generateMockArray(filePath, typeName, { arrayLength: POOL_SIZE });
      mockDataStore.setPool(typeName, filePath, pool);
      logger.debug(`Pool seeded: ${typeName} (${pool.length} items)`);
    }
  });
}

/**
 * Creates and configures the Express server
 */
export function createServer(config: ServerConfig): Express {
  const app = express();

  // Store swagger spec in the app locals so it can be updated on file changes
  let swaggerSpec = generateOpenAPISpec(config);
  app.locals.swaggerSpec = swaggerSpec;

  // Eagerly seed all collection pools so GET /{col}/{id} works immediately
  seedAllPools(config);

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
      writeStore: mockDataStore.getWriteStats(),
      config: {
        typesDir: config.typesDir,
        port: config.port,
        hotReload: config.hotReload,
        cache: config.cache,
        writeMethods: config.writeMethods,
      },
    });
  });

  // Custom JS injected into Swagger UI — adds a "Rebuild Data" button
  app.get('/swagger-rebuild.js', (_req, res) => {
    res.type('js').send(`
window.addEventListener('load', function () {
  var interval = setInterval(function () {
    var container = document.getElementById('swagger-ui');
    if (!container) return;
    clearInterval(interval);

    var toolbar = document.createElement('div');
    toolbar.style.cssText = 'background:#1b1b1b;padding:8px 20px;display:flex;align-items:center;gap:12px;';

    var label = document.createElement('span');
    label.textContent = 'TS Mock API';
    label.style.cssText = 'color:#fff;font-family:sans-serif;font-size:15px;font-weight:700;flex:1;';

    var btn = document.createElement('button');
    btn.textContent = 'Rebuild Data';
    btn.title = 'Clear all cached mock data and regenerate on next requests';
    btn.style.cssText = 'background:#49cc90;color:#fff;border:none;padding:6px 18px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:700;font-family:sans-serif;';

    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Resetting\u2026';
      fetch('/mock-reset', { method: 'POST' })
        .then(function (r) { return r.json(); })
        .then(function () {
          btn.textContent = 'Done! Reloading\u2026';
          setTimeout(function () { location.reload(); }, 600);
        })
        .catch(function () {
          btn.style.background = '#f93e3e';
          btn.textContent = 'Error \u2014 try again';
          btn.disabled = false;
          setTimeout(function () {
            btn.style.background = '#49cc90';
            btn.textContent = 'Rebuild Data';
          }, 2500);
        });
    });

    toolbar.appendChild(label);
    toolbar.appendChild(btn);
    container.parentNode.insertBefore(toolbar, container);
  }, 100);
});
`);
  });

  // Mock data reset endpoint
  app.post('/mock-reset', (_req, res) => {
    const mockCleared = mockDataStore.clear();
    schemaCache.clear();
    seedAllPools(config);
    res.json({ message: 'Mock data store cleared', cleared: mockCleared });
  });

  // Swagger documentation - use app.locals.swaggerSpec for dynamic updates
  app.use('/api-docs', swaggerUi.serve, (req: Request, res: Response, next: NextFunction) => {
    const spec = app.locals.swaggerSpec || swaggerSpec;
    swaggerUi.setup(spec, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'TS Mock Proxy API Docs',
      customJs: '/swagger-rebuild.js',
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
    logger.setVerbose(true);
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

      // Clear cached data for the affected file (pools, singles, write store)
      mockDataStore.invalidateFile(filePath);
      schemaCache.invalidateFile(filePath);

      // Regenerate Swagger spec and re-seed pools for affected types
      const newSwaggerSpec = generateOpenAPISpec(config);
      app.locals.swaggerSpec = newSwaggerSpec;
      seedAllPools(config);
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
