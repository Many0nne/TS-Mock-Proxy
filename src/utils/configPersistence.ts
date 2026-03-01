import * as fs from 'fs';
import * as path from 'path';
import { ServerConfig } from '../types/config';
import { logger } from './logger';

const CONFIG_FILE = path.join(process.cwd(), '.mock-config.json');

/**
 * Save the server configuration to a file for later reuse
 * @param config The configuration to save
 */
export function saveConfig(config: ServerConfig): void {
  try {
    // Convert to relative paths for better portability
    const configToSave = {
      ...config,
      typesDir: path.relative(process.cwd(), config.typesDir),
    };
    
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configToSave, null, 2), 'utf-8');
    logger.debug(`Configuration saved to ${CONFIG_FILE}`);
  } catch (error) {
    logger.warn(`Failed to save configuration: ${error}`);
  }
}

/**
 * Load the saved server configuration, if it exists
 * Converts relative paths back to absolute paths
 * @returns The saved configuration, or null if none exists
 */
export function loadSavedConfig(): ServerConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      return null;
    }

    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content);

    // Minimal runtime validation to avoid silent failures from malformed or
    // outdated config files. We check required fields and types.
    function isValidSavedConfig(obj: unknown): obj is ServerConfig {
      if (typeof obj !== 'object' || obj === null) return false;
      const s = obj as any;
      if (typeof s.typesDir !== 'string') return false;
      if (typeof s.port !== 'number') return false;
      if (typeof s.hotReload !== 'boolean') return false;
      if (typeof s.cache !== 'boolean') return false;
      if (typeof s.verbose !== 'boolean') return false;
      if (s.latency !== undefined) {
        if (typeof s.latency !== 'object' || s.latency === null) return false;
        if (typeof s.latency.min !== 'number' || typeof s.latency.max !== 'number') return false;
      }
      return true;
    }

    if (!isValidSavedConfig(parsed)) {
      logger.warn(`Saved configuration at ${CONFIG_FILE} is malformed or missing required fields — ignoring.`);
      return null;
    }

    const saved = parsed as ServerConfig;

    // Convert relative paths back to absolute
    const resolvedTypesDir = path.resolve(process.cwd(), saved.typesDir);

    if (!fs.existsSync(resolvedTypesDir) || !fs.statSync(resolvedTypesDir).isDirectory()) {
      logger.warn(`Saved configuration's typesDir does not exist: ${resolvedTypesDir} — ignoring saved config.`);
      return null;
    }

    return {
      ...saved,
      typesDir: resolvedTypesDir,
    };
  } catch (error) {
    logger.warn(`Failed to load saved configuration: ${error}`);
    return null;
  }
}

/**
 * Check if a saved configuration exists
 */
export function hasSavedConfig(): boolean {
  return fs.existsSync(CONFIG_FILE);
}
