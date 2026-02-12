#!/usr/bin/env node

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { ServerConfig } from './types/config';
import { startServer } from './server';
import { logger } from './utils/logger';
import { schemaCache } from './core/cache';

const program = new Command();

program
  .name('ts-mock-proxy')
  .description('Zero-Config mock server that generates REST API from TypeScript interfaces')
  .version('1.0.0')
  .option('-d, --dir <path>', 'Path to contracts directory', './contracts')
  .option('-e, --external-dir <paths...>', 'External directories to scan for types (can be used multiple times)')
  .option('-p, --port <number>', 'Server port', '8080')
  .option('-t, --target <url>', 'Target URL for proxy mode (optional)')
  .option('-l, --latency <range>', 'Simulate latency (e.g., "500-2000")')
  .option('--no-hot-reload', 'Disable hot-reload of contracts')
  .option('--no-cache', 'Disable schema caching')
  .option('-v, --verbose', 'Enable verbose logging', false)
  .action((options) => {
    // Resolve the absolute path of the contracts directory
    const contractsDir = path.resolve(process.cwd(), options.dir);

    // Resolve the absolute paths of external directories
    const externalDirs = options.externalDir
      ? (Array.isArray(options.externalDir) ? options.externalDir : [options.externalDir])
          .map((dir: string) => path.resolve(dir))
      : undefined;

    // Verify that the directory exists
    if (!fs.existsSync(contractsDir)) {
      logger.error(`Contracts directory not found: ${contractsDir}`);
      logger.info('Creating contracts directory...');
      fs.mkdirSync(contractsDir, { recursive: true });
      logger.success(`Created: ${contractsDir}`);
    }

    // Verify that external directories exist
    if (externalDirs) {
      for (const dir of externalDirs) {
        if (!fs.existsSync(dir)) {
          logger.error(`External directory not found: ${dir}`);
          logger.warn('Make sure the path is correct and accessible');
          process.exit(1);
        }
      }
    }

    // Parse the latency if provided
    let latency: { min: number; max: number } | undefined;

    if (options.latency) {
      const match = options.latency.match(/^(\d+)-(\d+)$/);

      if (match) {
        latency = {
          min: parseInt(match[1], 10),
          max: parseInt(match[2], 10),
        };
      } else {
        logger.warn(`Invalid latency format: ${options.latency}. Expected format: "min-max" (e.g., "500-2000")`);
      }
    }

    // Build the configuration
    const config: ServerConfig = {
      contractsDir,
      externalDirs,
      port: parseInt(options.port, 10),
      targetUrl: options.target,
      latency,
      hotReload: options.hotReload !== false,
      cache: options.cache !== false,
      verbose: options.verbose,
    };

    // Configure the global cache
    if (!config.cache) {
      logger.info('Schema cache disabled');
    }

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
