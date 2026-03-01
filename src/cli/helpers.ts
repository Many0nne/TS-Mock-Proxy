import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../utils/logger';

/**
 * Validate and resolve the types directory
 * Ensures the directory exists and is readable
 */
export async function validateTypesDir(dirPath: string): Promise<string> {
  const resolvedPath = path.resolve(process.cwd(), dirPath);

  if (!fs.existsSync(resolvedPath)) {
    logger.error(`Types directory not found: ${resolvedPath}`);
    logger.warn('Make sure the path is correct and accessible');
    process.exit(1);
  }

  // Check if directory is accessible
  try {
    fs.accessSync(resolvedPath, fs.constants.R_OK);
  } catch {
    logger.error(`Types directory is not readable: ${resolvedPath}`);
    process.exit(1);
  }

  return resolvedPath;
}

/**
 * Parse latency format from CLI string (e.g., "500-2000" -> { min: 500, max: 2000 })
 */
export function parseLatency(latencyStr?: string): { min: number; max: number } | undefined {
  if (!latencyStr) return undefined;

  const match = latencyStr.match(/^(\d+)-(\d+)$/);

  if (match && match[1] && match[2]) {
    const min = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);

    if (min > max) {
      logger.warn('Minimum latency is greater than maximum. Values will be swapped.');
      return { min: max, max: min };
    }

    return { min, max };
  }

  logger.warn(
    `Invalid latency format: "${latencyStr}". Expected format: "min-max" (e.g., "500-2000")`
  );
  return undefined;
}

/**
 * Display startup success message
 */
export function displayStartupSuccess(port: number, typesDir: string): void {
  console.log('');
  console.log('✨ Server is running!');
  console.log('');
  console.log(`  Local: http://localhost:${port}`);
  console.log(`  Types: ${typesDir}`);
  console.log(`  API Docs: http://localhost:${port}/api-docs`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
}
