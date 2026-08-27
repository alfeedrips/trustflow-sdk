type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class SDKLogger {
  constructor(private prefix = 'TrustFlow') {}

  private log(level: LogLevel, msg: string, data?: unknown): void {
    const ts = new Date().toISOString();
    const line = `[${ts}] [${this.prefix}] [${level.toUpperCase()}] ${msg}`;
    if (data !== undefined) {
      console[level](line, data);
    } else {
      console[level](line);
    }
  }

  debug(msg: string, data?: unknown) {
    this.log('debug', msg, data);
  }
  info(msg: string, data?: unknown) {
    this.log('info', msg, data);
  }
  warn(msg: string, data?: unknown) {
    this.log('warn', msg, data);
  }
  error(msg: string, data?: unknown) {
    this.log('error', msg, data);
  }
}

export const logger = new SDKLogger();
