/**
 * Property 12: Secrets provider extensibility
 *
 * For any custom provider implementing the SecretsProvider interface and
 * registered with the SecretsManager, the framework SHALL use that provider
 * when configured for an environment.
 *
 * **Validates: Requirements 9.5, 9.6**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { SecretsManager } from '../../src/secrets/secrets-manager';
import { SecretsProvider } from '../../src/secrets/provider.interface';

/**
 * Generates valid provider names (alphanumeric with dashes).
 */
const arbProviderName = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
    { minLength: 1, maxLength: 20 }
);

/**
 * Generates valid secret key names.
 */
const arbSecretKey = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
    { minLength: 1, maxLength: 30 }
);

/**
 * Generates arbitrary secret values.
 */
const arbSecretValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+'.split('')),
    { minLength: 1, maxLength: 100 }
);

/**
 * Creates a custom SecretsProvider implementation with tracking.
 */
function createCustomProvider(
    name: string,
    secrets: Map<string, string>
): { provider: SecretsProvider; wasUsed: () => boolean; getCallLog: () => string[] } {
    let used = false;
    const callLog: string[] = [];

    const provider: SecretsProvider = {
        name,
        async getSecret(key: string): Promise<string> {
            used = true;
            callLog.push(`getSecret:${key}`);
            const value = secrets.get(key);
            if (value === undefined) {
                throw new Error(`Secret not found: ${key}`);
            }
            return value;
        },
        async getSecrets(keys: string[]): Promise<Map<string, string>> {
            used = true;
            callLog.push(`getSecrets:${keys.join(',')}`);
            const result = new Map<string, string>();
            for (const key of keys) {
                const value = secrets.get(key);
                if (value === undefined) {
                    throw new Error(`Secret not found: ${key}`);
                }
                result.set(key, value);
            }
            return result;
        },
    };

    return {
        provider,
        wasUsed: () => used,
        getCallLog: () => callLog,
    };
}

test.describe('Property 12: Secrets provider extensibility', () => {
    test('custom provider implementing SecretsProvider interface is used when registered and configured', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbProviderName,
                arbSecretKey,
                arbSecretValue,
                async (providerName, secretKey, secretValue) => {
                    const secrets = new Map<string, string>([[secretKey, secretValue]]);
                    const { provider, wasUsed } = createCustomProvider(providerName, secrets);

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // Verify the provider is registered
                    expect(manager.getRegisteredProviders()).toContain(providerName);

                    // Use the custom provider by name
                    const result = await manager.getSecret(secretKey, providerName);

                    // Verify the custom provider was used and returned the correct value
                    expect(wasUsed()).toBe(true);
                    expect(result).toBe(secretValue);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('correct custom provider is selected among multiple registered providers', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uniqueArray(arbProviderName, { minLength: 2, maxLength: 5 }),
                arbSecretKey,
                fc.array(arbSecretValue, { minLength: 2, maxLength: 5 }),
                async (providerNames, secretKey, secretValues) => {
                    // Ensure we have matching providers and values
                    const effectiveNames = providerNames.slice(0, Math.min(providerNames.length, secretValues.length));
                    const effectiveValues = secretValues.slice(0, effectiveNames.length);
                    fc.pre(effectiveNames.length >= 2);

                    const manager = new SecretsManager();
                    const providers: Array<{ provider: SecretsProvider; wasUsed: () => boolean }> = [];

                    // Register multiple custom providers, each with a different value for the same key
                    for (let i = 0; i < effectiveNames.length; i++) {
                        const secrets = new Map<string, string>([[secretKey, effectiveValues[i]]]);
                        const tracked = createCustomProvider(effectiveNames[i], secrets);
                        providers.push(tracked);
                        manager.registerProvider(tracked.provider);
                    }

                    // Pick a random provider to use (use the last one to avoid caching from previous)
                    const targetIndex = effectiveNames.length - 1;
                    const targetName = effectiveNames[targetIndex];
                    const expectedValue = effectiveValues[targetIndex];

                    // Fetch using the target provider name
                    const result = await manager.getSecret(secretKey, targetName);

                    // Verify the correct provider was used
                    expect(result).toBe(expectedValue);
                    expect(providers[targetIndex].wasUsed()).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('custom provider getSecrets (batch) is used when configured', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbProviderName,
                fc.uniqueArray(arbSecretKey, { minLength: 1, maxLength: 5 }),
                fc.array(arbSecretValue, { minLength: 1, maxLength: 5 }),
                async (providerName, keys, values) => {
                    // Ensure we have matching keys and values
                    const effectiveKeys = keys.slice(0, Math.min(keys.length, values.length));
                    const effectiveValues = values.slice(0, effectiveKeys.length);
                    fc.pre(effectiveKeys.length >= 1);

                    const secrets = new Map<string, string>();
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        secrets.set(effectiveKeys[i], effectiveValues[i]);
                    }

                    const { provider, wasUsed, getCallLog } = createCustomProvider(providerName, secrets);

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // Fetch multiple secrets using the custom provider
                    const result = await manager.getSecrets(effectiveKeys, providerName);

                    // Verify the custom provider was used
                    expect(wasUsed()).toBe(true);

                    // Verify all values were returned correctly
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        expect(result.get(effectiveKeys[i])).toBe(effectiveValues[i]);
                    }

                    // Verify the batch method was called (not individual getSecret calls)
                    const batchCalls = getCallLog().filter((log) => log.startsWith('getSecrets:'));
                    expect(batchCalls.length).toBe(1);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('custom provider is used during resolve() when configured for an environment', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbProviderName,
                arbSecretKey,
                arbSecretValue,
                async (providerName, secretKey, secretValue) => {
                    const secrets = new Map<string, string>([[secretKey, secretValue]]);
                    const { provider, wasUsed } = createCustomProvider(providerName, secrets);

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // Create a config that uses the custom provider with a key mapping
                    const config = {
                        environment: 'dev',
                        database: {
                            type: 'postgresql' as const,
                            database: 'testdb',
                            password: 'placeholder',
                        },
                        secrets: {
                            provider: providerName,
                            keyMappings: {
                                [secretKey]: 'database.password',
                            },
                        },
                    };

                    // Resolve secrets using the custom provider
                    const resolved = await manager.resolve(config);

                    // Verify the custom provider was used
                    expect(wasUsed()).toBe(true);

                    // Verify the secret was injected into the config
                    expect(resolved.database?.password).toBe(secretValue);
                }
            ),
            { numRuns: 100 }
        );
    });
});
