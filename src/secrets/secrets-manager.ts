/**
 * SecretsManager — resolves, caches, and injects secrets into framework configuration.
 *
 * Responsibilities:
 * - Resolves which provider to use based on `secrets.provider` in the config
 * - Fetches secrets from the configured provider backend with timeout enforcement
 * - Caches all fetched secrets for the entire test runner invocation (singleton)
 * - Injects resolved secret values into FrameworkConfig via key mappings
 * - Throws SecretsError for unrecognized providers, fetch failures, timeouts, or invalid mappings
 */

import { SecretsError } from '../errors';
import { FrameworkConfig, SecretsConfig } from '../config/schema';
import type { SecretsProvider } from './provider.interface';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Wraps a promise with a timeout. Rejects with SecretsError if the timeout is exceeded.
 */
function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    providerName: string,
    secretKey?: string
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(
                new SecretsError(providerName, 'timeout', secretKey, {
                    timeoutMs,
                })
            );
        }, timeoutMs);

        promise
            .then((value) => {
                clearTimeout(timer);
                resolve(value);
            })
            .catch((error) => {
                clearTimeout(timer);
                reject(error);
            });
    });
}

/**
 * Sets a value at a dot-notation path in an object.
 * Throws SecretsError with operation 'mapping' if the path is invalid.
 */
function setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
    providerName: string,
    secretKey: string
): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = current[part];

        if (next === undefined || next === null) {
            throw new SecretsError(providerName, 'mapping', secretKey, {
                invalidField: path,
                reason: `Path segment "${part}" does not exist in config`,
            });
        }

        if (typeof next !== 'object' || Array.isArray(next)) {
            throw new SecretsError(providerName, 'mapping', secretKey, {
                invalidField: path,
                reason: `Path segment "${part}" is not an object`,
            });
        }

        current = next as Record<string, unknown>;
    }

    const finalKey = parts[parts.length - 1];

    // Validate that the final key exists in the target object (the field must be defined)
    if (!(finalKey in current)) {
        throw new SecretsError(providerName, 'mapping', secretKey, {
            invalidField: path,
            reason: `Field "${finalKey}" does not exist at path "${path}"`,
        });
    }

    current[finalKey] = value;
}

export class SecretsManager {
    private providers: Map<string, SecretsProvider> = new Map();
    private cache: Map<string, string> = new Map();

    /**
     * Register a secrets provider backend.
     * The provider's name is used to match against `secrets.provider` in config.
     */
    registerProvider(provider: SecretsProvider): void {
        this.providers.set(provider.name, provider);
    }

    /**
     * Resolve secrets and inject them into the framework configuration.
     *
     * 1. Determines the provider from `config.secrets.provider`
     * 2. Fetches all secrets defined in `keyMappings`
     * 3. Injects fetched values into the config at the mapped paths
     *
     * @param config - The framework configuration to resolve secrets for
     * @returns The config with secrets injected
     * @throws SecretsError if provider is unrecognized, fetch fails, or mapping is invalid
     */
    async resolve(config: FrameworkConfig): Promise<FrameworkConfig> {
        const secretsConfig = config.secrets;
        if (!secretsConfig) {
            return config;
        }

        const provider = this.getProvider(secretsConfig.provider);
        const keyMappings = secretsConfig.keyMappings;

        if (!keyMappings || Object.keys(keyMappings).length === 0) {
            return config;
        }

        const timeout = secretsConfig.timeout ?? DEFAULT_TIMEOUT_MS;
        const secretKeys = Object.keys(keyMappings);

        // Fetch all required secrets (uses cache where available)
        const secrets = await this.fetchSecrets(secretKeys, provider, timeout);

        // Inject secrets into config at mapped paths
        const resolvedConfig = structuredClone(config) as unknown as Record<string, unknown>;

        for (const [secretKey, configPath] of Object.entries(keyMappings)) {
            const value = secrets.get(secretKey);
            if (value !== undefined) {
                setNestedValue(
                    resolvedConfig,
                    configPath,
                    value,
                    provider.name,
                    secretKey
                );
            }
        }

        return resolvedConfig as unknown as FrameworkConfig;
    }

    /**
     * Fetch a single secret value by key.
     * Returns cached value if available; otherwise fetches from the provider.
     *
     * @param key - The secret key to retrieve
     * @param providerName - Optional provider name override (defaults to first registered)
     * @param timeout - Optional timeout in ms (defaults to 10s)
     * @returns The secret value
     */
    async getSecret(
        key: string,
        providerName?: string,
        timeout: number = DEFAULT_TIMEOUT_MS
    ): Promise<string> {
        // Return cached value if available
        const cached = this.cache.get(key);
        if (cached !== undefined) {
            return cached;
        }

        const provider = this.getProvider(providerName);

        try {
            const value = await withTimeout(
                provider.getSecret(key),
                timeout,
                provider.name,
                key
            );
            this.cache.set(key, value);
            return value;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                provider.name,
                'fetch',
                key,
                { reason: (error as Error).message },
                error as Error
            );
        }
    }

    /**
     * Fetch multiple secret values by keys.
     * Returns cached values where available; fetches remaining from the provider.
     *
     * @param keys - Array of secret keys to retrieve
     * @param providerName - Optional provider name override (defaults to first registered)
     * @param timeout - Optional timeout in ms (defaults to 10s)
     * @returns A map of key → secret value pairs
     */
    async getSecrets(
        keys: string[],
        providerName?: string,
        timeout: number = DEFAULT_TIMEOUT_MS
    ): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const uncachedKeys: string[] = [];

        // Collect cached values and identify uncached keys
        for (const key of keys) {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                result.set(key, cached);
            } else {
                uncachedKeys.push(key);
            }
        }

        // If all keys are cached, return immediately
        if (uncachedKeys.length === 0) {
            return result;
        }

        const provider = this.getProvider(providerName);

        try {
            const fetched = await withTimeout(
                provider.getSecrets(uncachedKeys),
                timeout,
                provider.name
            );

            // Cache and collect fetched values
            for (const [key, value] of fetched) {
                this.cache.set(key, value);
                result.set(key, value);
            }

            return result;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                provider.name,
                'fetch',
                undefined,
                {
                    keys: uncachedKeys,
                    reason: (error as Error).message,
                },
                error as Error
            );
        }
    }

    /**
     * Get the list of registered provider names.
     */
    getRegisteredProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Fetch secrets using cache-first strategy.
     * Only fetches uncached keys from the provider.
     */
    private async fetchSecrets(
        keys: string[],
        provider: SecretsProvider,
        timeout: number
    ): Promise<Map<string, string>> {
        const result = new Map<string, string>();
        const uncachedKeys: string[] = [];

        for (const key of keys) {
            const cached = this.cache.get(key);
            if (cached !== undefined) {
                result.set(key, cached);
            } else {
                uncachedKeys.push(key);
            }
        }

        if (uncachedKeys.length === 0) {
            return result;
        }

        try {
            const fetched = await withTimeout(
                provider.getSecrets(uncachedKeys),
                timeout,
                provider.name
            );

            for (const [key, value] of fetched) {
                this.cache.set(key, value);
                result.set(key, value);
            }
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                provider.name,
                'fetch',
                undefined,
                {
                    keys: uncachedKeys,
                    reason: (error as Error).message,
                },
                error as Error
            );
        }

        return result;
    }

    /**
     * Get a provider by name. Throws SecretsError if not found.
     */
    private getProvider(name?: string): SecretsProvider {
        if (!name) {
            // If no name specified, use the first registered provider
            const first = this.providers.values().next().value;
            if (!first) {
                throw new SecretsError('unknown', 'resolve', undefined, {
                    reason: 'No providers registered',
                    availableProviders: [],
                });
            }
            return first;
        }

        const provider = this.providers.get(name);
        if (!provider) {
            throw new SecretsError(name, 'resolve', undefined, {
                reason: `Provider "${name}" is not registered`,
                availableProviders: this.getRegisteredProviders(),
            });
        }
        return provider;
    }
}
