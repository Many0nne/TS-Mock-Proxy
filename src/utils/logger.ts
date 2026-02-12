import chalk from 'chalk';

export class Logger {
  constructor(private verbose: boolean = false) {}

  info(message: string, ...args: unknown[]): void {
    console.log(chalk.blue('ℹ'), message, ...args);
  }

  success(message: string, ...args: unknown[]): void {
    console.log(chalk.green('✓'), message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(chalk.yellow('⚠'), message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(chalk.red('✖'), message, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.verbose) {
      console.log(chalk.gray('🔍'), message, ...args);
    }
  }

  request(method: string, url: string, status: number): void {
    const statusColor =
      status >= 500
        ? chalk.red
        : status >= 400
        ? chalk.yellow
        : status >= 300
        ? chalk.cyan
        : chalk.green;

    console.log(
      chalk.gray('[REQUEST]'),
      chalk.bold(method),
      url,
      statusColor(status)
    );
  }

  server(port: number): void {
    console.log('\n' + chalk.bold.green('🚀 TS-Mock-Proxy started!'));
    console.log(chalk.gray('   Server running at:'), chalk.cyan.underline(`http://localhost:${port}`));
    console.log(chalk.gray('   Press'), chalk.yellow('Ctrl+C'), chalk.gray('to stop\n'));
  }
}

export const logger = new Logger();
