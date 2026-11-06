import { Injectable, Optional, Inject } from '@nestjs/common';
import * as dotenv from 'dotenv';
import { EnvConfig, validateEnv } from './env.validation';

// Load .env if present
dotenv.config();

export const CONFIG_OPTIONS = 'CONFIG_OPTIONS';

@Injectable()
export class ConfigService {
  private readonly config: EnvConfig;

  constructor(@Optional() @Inject(CONFIG_OPTIONS) customEnv?: Record<string, unknown>) {
    const rawEnv = customEnv || process.env;
    this.config = validateEnv(rawEnv);
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production';
  }

  get isTest(): boolean {
    return this.config.NODE_ENV === 'test';
  }
}
