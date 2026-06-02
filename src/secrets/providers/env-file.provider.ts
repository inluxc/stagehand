/**
 * Local .env file fallback provider.
 *
 * Reads secrets from the local `.env.{environment}` file using the existing EnvLoader.
 * Intended as a fallback for local development where external secrets services
 * are not available.
 */

import type { SecretsProvider } from '../provider.interface';
import { SecretsError } from '../../errors';
import { EnvLoader } from '../../config/env-loader';

export interface EnvFileProviderOptions {
    /** Project root directory where .env files are located. Defaults to process.cwd(). */
    projectRoot?: string;
    /** Environment name to load (e.g., 'local', 'dev'). Defaults to 'local'. */
    environment?: string;
}

export class EnvFileSecretsProvider implements SecretsProvider {
    readonly name = 'env-file';
    private readonly envLoader: EnvLoader;
    private readonly environment: string;
    private envValues: Record<string, string> | null = null;

    constructor(options: EnvFileProviderOptions = {}) {
        this.envLoader = new EnvLoader(options.projectRoot);
        this.environment = options.environment ?? 'local';
    }

    async getSecret(key: string): Promise<string> {
        const values = this.loadEnvValues();
        const value = values[key];

        if (value === undefined) {
            throw new SecretsError(this.name, 'fetch', key, {
                reason: `Key "${key}" not found in .env.${this.environment}`,
                environment: this.environment,
            });
        }

        return value;
    }

    async getSecrets(keys: string[]): Promise<Map<string, string>> {
        const values = this.loadEnvValues();
        const results = new Map<string, string>();

        for (const key of keys) {
            const value = values[key];
            if (value === undefined) {
                throw new SecretsError(this.name, 'fetch', key, {
                    reason: `Key "${key}" not found in .env.${this.environment}`,
                    environment: this.environment,
                });
            }
            results.set(key, value);
        }

        return results;
    }

    /**
     * Lazily loads and caches the env file values.
     * The file is only read once; subsequent calls return the cached result.
     */
    private loadEnvValues(): Record<string, string> {
        if (this.envValues === null) {
            this.envValues = this.envLoader.load(this.environment);
        }
        return this.envValues;
    }
}
