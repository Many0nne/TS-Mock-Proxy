#!/usr/bin/env node

import { Command } from 'commander';
import { ServerConfig } from './types/config';
import { startServer } from './server';
import { logger } from './utils/logger';
import { schemaCache } from './core/cache';
import { runWizard, hasExplicitCliArgs } from './cli/wizard';
import { parseLatency, validateTypesDir } from './cli/helpers';
import { saveConfig } from './utils/configPersistence';

const program = new Command();

async function main() {
  // Check if user provided explicit CLI arguments
  const hasCliArgs = hasExplicitCliArgs();

  // If no explicit CLI args, run interactive wizard
  if (!hasCliArgs) {
    const config = await runWizard();
    try {
      startServer(config);
    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
    return;
  }

  // Setup Commander for CLI mode
  program
    .name('ts-mock-proxy')
    .description('Zero-Config mock server that generates REST API from TypeScript interfaces')
    .version('1.0.0')
    .requiredOption('-t, --types-dir <path>', 'Directory containing TypeScript type definitions')
    .option('-p, --port <number>', 'Server port', '8080')
    .option('-l, --latency <range>', 'Simulate latency (e.g., "500-2000")')
    .option('--no-hot-reload', 'Disable hot-reload of type definitions')
    .option('--no-cache', 'Disable schema caching')
    .option('-v, --verbose', 'Enable verbose logging', false)
    .option('--interactive', 'Force interactive mode')
    .action(async (options) => {
      // If --interactive flag is set, run wizard instead
      if (options.interactive) {
        runWizard()
          .then((config) => startServer(config))
          .catch((error) => {
            logger.error('Wizard failed:', error);
            process.exit(1);
          });
        return;
      }

      // Validate and resolve the types directory
      const typesDir = await validateTypesDir(options.typesDir);

      // Parse the latency if provided
      let latency: { min: number; max: number } | undefined;

      if (options.latency) {
        latency = parseLatency(options.latency);
      }

      // Build the configuration
      const config: ServerConfig = {
        typesDir,
        port: parseInt(options.port, 10),
        latency,
        hotReload: options.hotReload !== false,
        cache: options.cache !== false,
        verbose: options.verbose,
      };

      // Configure the global cache
      if (!config.cache) {
        logger.info('Schema cache disabled');
      }

      // Save the configuration for future use
      saveConfig(config);

      // Start the server
      try {
        startServer(config);
      } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
      }
    });

  // Command to display cache statistics
  program
    .command('stats')
    .description('Display cache statistics')
    .action(() => {
      const stats = schemaCache.getStats();

      console.log('\n📊 Cache Statistics:');
      console.log(`   Enabled: ${stats.enabled}`);
      console.log(`   Size: ${stats.size} schema(s)\n`);

      if (stats.schemas.length > 0) {
        console.log('   Cached schemas:');
        stats.schemas.forEach((schema) => {
          console.log(`   - ${schema.interfaceName} (${schema.filePath})`);
          console.log(`     Age: ${Math.round(schema.age / 1000)}s`);
        });
      }

      console.log('');
    });

  // Command to clear the cache
  program
    .command('clear-cache')
    .description('Clear the schema cache')
    .action(() => {
      schemaCache.clear();
      logger.success('Cache cleared successfully');
    });

  program.parse();
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
