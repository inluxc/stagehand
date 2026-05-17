/**
 * Property 11: Secrets caching
 *
 * For any secret key fetched during a test run, subsequent requests for the
 * same key SHALL return the cached value without additional provider API calls.
 *
 * **Validates: Requirements 9.5, 9.6**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { SecretsManager } from '../../src/secrets/secrets-manager';
import { SecretsProvider } from '../../src/secrets/provider.interface';

/**
 * Generates valid secret key names (alphanumeric with dashes/underscores).
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
 * Creates a mock provider that tracks API call counts per method.
 */
function createCountingProvider(
    name: string,
    secrets: Map<string, string>
): { provider: SecretsProvider; getSecretCallCount: () => number; getSecretsCallCount: () => number } {
    let getSecretCalls = 0;
    let getSecretsCalls = 0;

    const provider: SecretsProvider = {
        name,
        async getSecret(key: string): Promise<string> {
            getSecretCalls++;
            const value = secrets.get(key);
            if (value === undefined) {
                throw new Error(`Secret not found: ${key}`);
            }
            return value;
        },
        async getSecrets(keys: string[]): Promise<Map<string, string>> {
            getSecretsCalls++;
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
        getSecretCallCount: () => getSecretCalls,
        getSecretsCallCount: () => getSecretsCalls,
    };
}

test.describe('Property 11: Secrets caching', () => {
    test('getSecret: subsequent requests for the same key return cached value without additional provider API calls', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbSecretKey,
                arbSecretValue,
                fc.integer({ min: 2, max: 10 }),
                async (key, value, repeatCount) => {
                    const secrets = new Map<string, string>([[key, value]]);
                    const { provider, getSecretCallCount } = createCountingProvider('test-provider', secrets);

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // First fetch — should call the provider
                    const firstResult = await manager.getSecret(key, 'test-provider');
                    expect(firstResult).toBe(value);
                    expect(getSecretCallCount()).toBe(1);

                    // Subsequent fetches — should return cached value without additional calls
                    for (let i = 0; i < repeatCount; i++) {
                        const cachedResult = await manager.getSecret(key, 'test-provider');
                        expect(cachedResult).toBe(value);
                    }

                    // Only 1 API call total regardless of how many times we fetched
                    expect(getSecretCallCount()).toBe(1);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('getSecrets (batch): cached keys are not re-fetched from the provider', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uniqueArray(arbSecretKey, { minLength: 2, maxLength: 8 }),
                fc.array(arbSecretValue, { minLength: 2, maxLength: 8 }),
                async (keys, values) => {
                    // Ensure we have matching keys and values
                    const effectiveKeys = keys.slice(0, Math.min(keys.length, values.length));
                    const effectiveValues = values.slice(0, effectiveKeys.length);
                    fc.pre(effectiveKeys.length >= 2);

                    const secrets = new Map<string, string>();
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        secrets.set(effectiveKeys[i], effectiveValues[i]);
                    }

                    const { provider, getSecretsCallCount } = createCountingProvider('test-provider', secrets);

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // First batch fetch — should call the provider once
                    const firstResult = await manager.getSecrets(effectiveKeys, 'test-provider');
                    expect(getSecretsCallCount()).toBe(1);

                    // Verify all values returned correctly
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        expect(firstResult.get(effectiveKeys[i])).toBe(effectiveValues[i]);
                    }

                    // Second batch fetch of the same keys — should NOT call the provider again
                    const secondResult = await manager.getSecrets(effectiveKeys, 'test-provider');
                    expect(getSecretsCallCount()).toBe(1); // Still only 1 call

                    // Verify cached values are correct
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        expect(secondResult.get(effectiveKeys[i])).toBe(effectiveValues[i]);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('getSecrets (batch): only uncached keys trigger a provider call', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uniqueArray(arbSecretKey, { minLength: 3, maxLength: 8 }),
                fc.array(arbSecretValue, { minLength: 3, maxLength: 8 }),
                async (keys, values) => {
                    // Ensure we have matching keys and values
                    const effectiveKeys = keys.slice(0, Math.min(keys.length, values.length));
                    const effectiveValues = values.slice(0, effectiveKeys.length);
                    fc.pre(effectiveKeys.length >= 3);

                    const secrets = new Map<string, string>();
                    for (let i = 0; i < effectiveKeys.length; i++) {
                        secrets.set(effectiveKeys[i], effectiveValues[i]);
                    }

                    // Track which keys are fetched in each getSecrets call
                    const fetchedKeysBatches: string[][] = [];
                    const provider: SecretsProvider = {
                        name: 'test-provider',
                        async getSecret(key: string): Promise<string> {
                            const value = secrets.get(key);
                            if (value === undefined) throw new Error(`Not found: ${key}`);
                            return value;
                        },
                        async getSecrets(keys: string[]): Promise<Map<string, string>> {
                            fetchedKeysBatches.push([...keys]);
                            const result = new Map<string, string>();
                            for (const key of keys) {
                                const value = secrets.get(key);
                                if (value === undefined) throw new Error(`Not found: ${key}`);
                                result.set(key, value);
                            }
                            return result;
                        },
                    };

                    const manager = new SecretsManager();
                    manager.registerProvider(provider);

                    // Split keys into two groups: first half cached, second half new
                    const splitIndex = Math.floor(effectiveKeys.length / 2);
                    const firstBatch = effectiveKeys.slice(0, splitIndex);
                    const secondBatch = effectiveKeys.slice(splitIndex);

                    // Fetch first batch to cache them
                    await manager.getSecrets(firstBatch, 'test-provider');
                    expect(fetchedKeysBatches.length).toBe(1);
                    expect(fetchedKeysBatches[0]).toEqual(firstBatch);

                    // Now fetch ALL keys — only the uncached ones should be fetched
                    await manager.getSecrets(effectiveKeys, 'test-provider');
                    expect(fetchedKeysBatches.length).toBe(2);

                    // The second provider call should only contain the uncached keys
                    const secondFetchedKeys = fetchedKeysBatches[1];
                    for (const key of firstBatch) {
                        expect(secondFetchedKeys).not.toContain(key);
                    }
                    for (const key of secondBatch) {
                        expect(secondFetchedKeys).toContain(key);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
