import chokidar from 'chokidar';
import * as path from 'path';
import { logger } from './logger';
import { schemaCache } from '../core/cache';

/**
 * Configures and starts the file watcher for hot-reload
 *
 * @param directories - Directories to watch (contracts + external)
 * @param onReload - Optional callback called on change
 */
export function startFileWatcher(
  directories: string[],
  onReload?: (filePath: string) => void
): chokidar.FSWatcher {
  // Prepare patterns for all directories
  const patterns = directories.map(dir => path.join(dir, '**/*.ts'));

  logger.info(`Starting file watcher on ${directories.length} director${directories.length > 1 ? 'ies' : 'y'}`);
  directories.forEach(dir => logger.info(`  - ${dir}`));

  const watcher = chokidar.watch(patterns, {
    ignored: /(^|[\/\\])\../, // Ignore hidden files
    persistent: true,
    ignoreInitial: true, // Don't trigger events for existing files
  });

  watcher
    .on('change', (filePath) => {
      logger.info(`File changed: ${path.basename(filePath)}`);

      // Invalidate the cache for this file
      schemaCache.invalidateFile(filePath);

      // Call the callback if provided
      if (onReload) {
        onReload(filePath);
      }
    })
    .on('add', (filePath) => {
      logger.success(`New file detected: ${path.basename(filePath)}`);

      if (onReload) {
        onReload(filePath);
      }
    })
    .on('unlink', (filePath) => {
      logger.warn(`File deleted: ${path.basename(filePath)}`);

      // Invalidate the cache for this deleted file
      schemaCache.invalidateFile(filePath);
    })
    .on('error', (error) => {
      logger.error(`File watcher error: ${error.message}`);
    })
    .on('ready', () => {
      logger.success('File watcher ready');
    });

  return watcher;
}

/**
 * Stops the file watcher
 */
export async function stopFileWatcher(
  watcher: chokidar.FSWatcher
): Promise<void> {
  await watcher.close();
  logger.info('File watcher stopped');
}
