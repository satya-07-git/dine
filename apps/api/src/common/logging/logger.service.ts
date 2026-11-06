import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';

@Injectable()
export class StructuredLoggerService implements NestLoggerService {
  private formatMessage(level: string, message: any, context?: string): string {
    const timestamp = new Date().toISOString();
    const logObject: Record<string, any> = {
      timestamp,
      level,
      context: context || 'Application',
      message: typeof message === 'object' ? message : String(message),
    };

    return JSON.stringify(logObject);
  }

  log(message: any, context?: string) {
    console.log(this.formatMessage('info', message, context));
  }

  error(message: any, trace?: string, context?: string) {
    console.error(this.formatMessage('error', { message, trace }, context));
  }

  warn(message: any, context?: string) {
    console.warn(this.formatMessage('warn', message, context));
  }

  debug(message: any, context?: string) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.debug(this.formatMessage('debug', message, context));
    }
  }

  verbose(message: any, context?: string) {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(this.formatMessage('verbose', message, context));
    }
  }
}
