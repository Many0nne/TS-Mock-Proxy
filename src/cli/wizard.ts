import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs';
import chalk from 'chalk';
import { ServerConfig, MockMode } from '../types/config';
import { logger } from '../utils/logger';
import { loadSavedConfig, saveConfig } from '../utils/configPersistence';

/**
 * Display a welcome message for the interactive wizard
 */
export function displayWelcome(): void {
  console.log('');
  console.log(chalk.cyan.bold('🚀 TS-Mock-Proxy Configuration Wizard'));
  console.log(chalk.gray('Let\'s set up your mock API server\n'));
}

/**
 * Run the interactive configuration wizard
 * Asks the user a series of questions to build the ServerConfig
 */
export async function runWizard(): Promise<ServerConfig> {
  displayWelcome();

  try {
    // Check if a saved configuration exists and offer to reuse it
    const savedConfig = loadSavedConfig();
    if (savedConfig) {
      const useExisting = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useSaved',
          message: `Use previous configuration? (types: ${path.relative(process.cwd(), savedConfig.typesDir)}, port: ${savedConfig.port})`,
          default: true,
        },
      ]);

      if (useExisting.useSaved) {
        console.log('');
        displayConfigSummary(savedConfig);
        
        const confirmAnswer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Start the server with this configuration?',
            default: true,
          },
        ]);

        if (!confirmAnswer.proceed) {
          logger.info('Server startup cancelled');
          process.exit(0);
        }

        console.log('');
        return savedConfig;
      }

      // If user doesn't want to use saved config, fall through to new config
      console.log('');
    }

    // Question 1: Types directory - with proper input validation loop
    let typesDirAnswer = { typesDir: '' };
    let isValidTypesDir = false;
    
    while (!isValidTypesDir) {
      typesDirAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'typesDir',
          message: 'Where are your TypeScript type definitions located?',
          default: savedConfig?.typesDir ? path.relative(process.cwd(), savedConfig.typesDir) : './types',
        },
      ]);
      
      const resolvedPath = path.resolve(typesDirAnswer.typesDir);
      if (!fs.existsSync(resolvedPath)) {
        console.log(chalk.red(`❌ Directory not found: ${resolvedPath}\n   (you entered: ${typesDirAnswer.typesDir})\n`));
        continue;
      }
      isValidTypesDir = true;
    }

    const typesPath = path.resolve(typesDirAnswer.typesDir);

    // Question 2: Server port
    let portAnswer = { port: '' };
    let isValidPort = false;
    
    while (!isValidPort) {
      portAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'port',
          message: 'What port should the server run on?',
          default: savedConfig?.port.toString() || '8080',
        },
      ]);
      
      const port = parseInt(portAnswer.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        console.log(chalk.red('❌ Please enter a valid port number (1-65535)\n'));
        continue;
      }
      isValidPort = true;
    }

    // Question 3: Advanced options
    const advancedAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'showAdvanced',
        message: 'Configure advanced options?',
        default: false,
      },
    ]);

    let hotReload = savedConfig?.hotReload ?? true;
    let cache = savedConfig?.cache ?? true;
    let latency: { min: number; max: number } | undefined = savedConfig?.latency;
    let verbose = savedConfig?.verbose ?? false;
    let writeMethods: ServerConfig['writeMethods'] = savedConfig?.writeMethods;
    let mockMode: MockMode = savedConfig?.mockMode ?? 'dev';
    let persistData: string | false = savedConfig?.persistData ?? false;

    if (advancedAnswer.showAdvanced) {
      const advOptions = await inquirer.prompt([
        {
          type: 'list',
          name: 'mockMode',
          message: 'Mock mode:',
          choices: [
            { name: 'dev — all mock features enabled (status override, artificial latency)', value: 'dev' },
            { name: 'strict — clean REST simulation, mock features disabled', value: 'strict' },
          ],
          default: mockMode,
        },
        {
          type: 'confirm',
          name: 'hotReload',
          message: 'Enable hot-reload (automatically reload types on changes)?',
          default: hotReload,
        },
        {
          type: 'confirm',
          name: 'cache',
          message: 'Enable schema caching?',
          default: cache,
        },
        {
          type: 'confirm',
          name: 'enableLatency',
          message: 'Simulate network latency?',
          default: !!latency,
        },
        {
          type: 'confirm',
          name: 'verbose',
          message: 'Enable verbose logging?',
          default: verbose,
        },
      ]);

      mockMode = advOptions.mockMode;
      hotReload = advOptions.hotReload;
      cache = advOptions.cache;
      verbose = advOptions.verbose;

      if (advOptions.enableLatency) {
        let latencyAnswered = false;
        
        while (!latencyAnswered) {
          const latencyAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'latencyMin',
              message: 'Minimum latency (ms)?',
              default: latency?.min.toString() || '500',
            },
            {
              type: 'input',
              name: 'latencyMax',
              message: 'Maximum latency (ms)?',
              default: latency?.max.toString() || '2000',
            },
          ]);

          const minNum = parseInt(latencyAnswer.latencyMin, 10);
          const maxNum = parseInt(latencyAnswer.latencyMax, 10);
          
          if (isNaN(minNum) || minNum < 0) {
            console.log(chalk.red('❌ Minimum latency: Please enter a positive number\n'));
            continue;
          }
          if (isNaN(maxNum) || maxNum < 0) {
            console.log(chalk.red('❌ Maximum latency: Please enter a positive number\n'));
            continue;
          }

          latency = {
            min: minNum,
            max: maxNum,
          };

          if (latency.min > latency.max) {
            logger.warn('Minimum latency is greater than maximum. Swapping values...');
            [latency.min, latency.max] = [latency.max, latency.min];
          }
          
          latencyAnswered = true;
        }
      } else {
        latency = undefined;
      }

      // Persistence configuration
      const persistAnswer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'enablePersist',
          message: 'Persist mock data to JSON file?',
          default: !!persistData,
        },
      ]);

      if (persistAnswer.enablePersist) {
        const persistPathAnswer = await inquirer.prompt([
          {
            type: 'input',
            name: 'persistPath',
            message: 'Path to persist file?',
            default: typeof persistData === 'string' ? persistData : '.mock-data.json',
          },
        ]);
        persistData = persistPathAnswer.persistPath as string;
      } else {
        persistData = false;
      }

      // Write methods configuration
      const writeMethodsAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'writeMode',
          message: 'Write methods configuration:',
          choices: [
            { name: 'Enable all write methods (POST, PUT, PATCH, DELETE)', value: 'all' },
            { name: 'Read-only mode (disable all write methods)', value: 'none' },
            { name: 'Custom — toggle each method individually', value: 'custom' },
          ],
          default: 'all',
        },
      ]);

      if (writeMethodsAnswer.writeMode === 'none') {
        writeMethods = { post: false, put: false, patch: false, delete: false };
      } else if (writeMethodsAnswer.writeMode === 'custom') {
        const customMethods = await inquirer.prompt([
          { type: 'confirm', name: 'post',   message: 'Enable POST?',   default: writeMethods?.post   !== false },
          { type: 'confirm', name: 'put',    message: 'Enable PUT?',    default: writeMethods?.put    !== false },
          { type: 'confirm', name: 'patch',  message: 'Enable PATCH?',  default: writeMethods?.patch  !== false },
          { type: 'confirm', name: 'delete', message: 'Enable DELETE?', default: writeMethods?.delete !== false },
        ]);
        writeMethods = {
          post:   customMethods.post,
          put:    customMethods.put,
          patch:  customMethods.patch,
          delete: customMethods.delete,
        };
      } else {
        writeMethods = undefined; // all enabled (default)
      }
    }

    // Build and display the configuration summary
    const config: ServerConfig = {
      typesDir: typesPath,
      port: parseInt(portAnswer.port, 10),
      latency,
      hotReload,
      cache,
      verbose,
      writeMethods,
      mockMode,
      persistData: persistData || undefined,
    };

    displayConfigSummary(config);

    // Confirm and proceed
    const confirmAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: 'Start the server with this configuration?',
        default: true,
      },
    ]);

    if (!confirmAnswer.proceed) {
      logger.info('Server startup cancelled');
      process.exit(0);
    }

    // Save the configuration for future use
    saveConfig(config);

    console.log('');
    return config;
  } catch (error) {
    if ((error as any).isTtyError) {
      logger.error('Interactive mode not supported in this environment');
    } else {
      logger.error('An error occurred during configuration:', error);
    }
    process.exit(1);
  }
}

/**
 * Display a summary of the chosen configuration
 */
function displayConfigSummary(config: ServerConfig): void {
  console.log('');
  console.log(chalk.bold('📋 Configuration Summary:'));
  console.log(chalk.gray('─'.repeat(50)));

  console.log(`  ${chalk.cyan('Port:')} ${config.port}`);
  console.log(`  ${chalk.cyan('Types Dir:')} ${config.typesDir}`);

  if (config.latency) {
    console.log(`  ${chalk.cyan('Latency:')} ${config.latency.min}-${config.latency.max}ms`);
  }

  console.log(`  ${chalk.cyan('Mock mode:')} ${config.mockMode ?? 'dev'}`);
  console.log(`  ${chalk.cyan('Hot-reload:')} ${config.hotReload ? 'enabled' : 'disabled'}`);
  console.log(`  ${chalk.cyan('Cache:')} ${config.cache ? 'enabled' : 'disabled'}`);
  console.log(`  ${chalk.cyan('Verbose:')} ${config.verbose ? 'enabled' : 'disabled'}`);
  console.log(`  ${chalk.cyan('Persist data:')} ${config.persistData ? config.persistData : 'disabled'}`);

  const wm = config.writeMethods;
  if (wm) {
    const enabled = (['post', 'put', 'patch', 'delete'] as const)
      .filter((m) => wm[m] !== false)
      .map((m) => m.toUpperCase());
    const disabled = (['post', 'put', 'patch', 'delete'] as const)
      .filter((m) => wm[m] === false)
      .map((m) => m.toUpperCase());
    if (disabled.length > 0) {
      console.log(`  ${chalk.cyan('Write methods:')} enabled: ${enabled.join(', ') || 'none'} | disabled: ${disabled.join(', ')}`);
    } else {
      console.log(`  ${chalk.cyan('Write methods:')} all enabled`);
    }
  } else {
    console.log(`  ${chalk.cyan('Write methods:')} all enabled`);
  }

  console.log(chalk.gray('─'.repeat(50)));
  console.log('');
}

/**
 * Check if any CLI arguments were provided (excluding node and script path)
 * Returns true if user provided explicit CLI args (should skip wizard)
 */
export function hasExplicitCliArgs(): boolean {
  const args = process.argv.slice(2);

  // If no args at all, or only non-option arguments (commands like 'stats', 'clear-cache')
  if (args.length === 0) return false;

  // Check for interactive flag or if any option flags are provided
  const hasOptions = args.some(
    (arg) =>
      arg.startsWith('-') ||
      arg === 'stats' ||
      arg === 'clear-cache' ||
      arg === '--help' ||
      arg === '--version'
  );

  return hasOptions;
}
