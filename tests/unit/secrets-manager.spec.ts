import { test, expect } from '@playwright/test';
import { SecretsManager } from '../../src/secrets/secrets-manager';
import { SecretsProvider } from '../../src/secrets/provider.interface';
import { SecretsError } from '../../src/errors';
import { FrameworkConfig } from '../../src/config/schema';

/**
 * Creates a mock SecretsProvider for testing.
 */
function createMockProvider(
    name: string,
    secrets: Record<string, string> = {},
    options?: { delay?: number; shouldFail?: boolean; failMessage?: string }
): SecretsProvider {
    return {
        name,
        async getSecret(key: string): Promise<string> {
            if (options?.delay) {
                await new Promise((resolve) => setTimeout(resolve, options.delay));
            }
            if (options?.shouldFail) {
                throw new Error(options.failMessage ?? `Failed to fetch secret: ${key}`);
            }
            const value = secrets[key];
            if (value === undefined) {
                throw new Error(`Secret not found: ${key}`);
            }
            return value;
        },
        async getSecrets(keys: string[]): Promise<Map<string, string>> {
            if (options?.delay) {
                await new Promise((resolve) => setTimeout(resolve, options.delay));
            }
            if (options?.shouldFail) {
                throw new Error(options.failMessage ?? 'Failed to fetch secrets');
            }
            const result = new Map<string, string>();
            for (const key of keys) {
                const value = secrets[key];
                if (value === undefined) {
                    throw new Error(`Secret not found: ${key}`);
                }
                result.set(key, value);
            }
            return result;
        },
    };
}

test.describe('SecretsManager', () => {
    test.describe('registerProvider', () => {
        test('should register a provider and make it available', () => {
            const manager = new SecretsManager();
            const provider = createMockProvider('aws', { key1: 'value1' });

            manager.registerProvider(provider);

            expect(manager.getRegisteredProviders()).toContain('aws');
        });

        test('should support registering multiple providers', () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('aws'));
            manager.registerProvider(createMockProvider('vault'));
            manager.registerProvider(createMockProvider('gitlab'));

            expect(manager.getRegisteredProviders()).toEqual(['aws', 'vault', 'gitlab']);
        });
    });

    test.describe('getSecret', () => {
        test('should fetch a secret from the provider', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('aws', { 'db-password': 's3cret' }));

            const value = await manager.getSecret('db-password', 'aws');
            expect(value).toBe('s3cret');
        });

        test('should return cached value on subsequent requests', async () => {
            let callCount = 0;
            const provider: SecretsProvider = {
                name: 'aws',
                async getSecret(key: string) {
                    callCount++;
                    return `value-for-${key}`;
                },
                async getSecrets(keys: string[]) {
                    callCount++;
                    return new Map(keys.map((k) => [k, `value-for-${k}`]));
                },
            };

            const manager = new SecretsManager();
            manager.registerProvider(provider);

            const first = await manager.getSecret('my-key', 'aws');
            const second = await manager.getSecret('my-key', 'aws');

            expect(first).toBe('value-for-my-key');
            expect(second).toBe('value-for-my-key');
            expect(callCount).toBe(1); // Only one API call
        });

        test('should throw SecretsError for unrecognized provider', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('aws'));

            await expect(manager.getSecret('key', 'nonexistent')).rejects.toThrow(SecretsError);

            try {
                await manager.getSecret('key', 'nonexistent');
            } catch (error) {
                const secretsError = error as SecretsError;
                expect(secretsError.providerName).toBe('nonexistent');
                expect(secretsError.operation).toBe('resolve');
                expect(secretsError.details?.availableProviders).toEqual(['aws']);
            }
        });

        test('should throw SecretsError on fetch failure', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', {}, { shouldFail: true, failMessage: 'Access denied' })
            );

            await expect(manager.getSecret('key', 'aws')).rejects.toThrow(SecretsError);

            try {
                await manager.getSecret('key', 'aws');
            } catch (error) {
                const secretsError = error as SecretsError;
                expect(secretsError.providerName).toBe('aws');
                expect(secretsError.operation).toBe('fetch');
                expect(secretsError.secretKey).toBe('key');
            }
        });

        test('should throw SecretsError on timeout', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { key: 'value' }, { delay: 200 })
            );

            await expect(manager.getSecret('key', 'aws', 50)).rejects.toThrow(SecretsError);

            try {
                await manager.getSecret('key', 'aws', 50);
            } catch (error) {
                const secretsError = error as SecretsError;
                expect(secretsError.providerName).toBe('aws');
                expect(secretsError.operation).toBe('timeout');
            }
        });
    });

    test.describe('getSecrets', () => {
        test('should fetch multiple secrets from the provider', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { key1: 'val1', key2: 'val2', key3: 'val3' })
            );

            const result = await manager.getSecrets(['key1', 'key2', 'key3'], 'aws');

            expect(result.get('key1')).toBe('val1');
            expect(result.get('key2')).toBe('val2');
            expect(result.get('key3')).toBe('val3');
        });

        test('should use cache for previously fetched keys', async () => {
            let callCount = 0;
            const provider: SecretsProvider = {
                name: 'aws',
                async getSecret(key: string) {
                    callCount++;
                    return `value-${key}`;
                },
                async getSecrets(keys: string[]) {
                    callCount++;
                    return new Map(keys.map((k) => [k, `value-${k}`]));
                },
            };

            const manager = new SecretsManager();
            manager.registerProvider(provider);

            // First call fetches all keys
            await manager.getSecrets(['key1', 'key2'], 'aws');
            expect(callCount).toBe(1);

            // Second call should use cache entirely
            const result = await manager.getSecrets(['key1', 'key2'], 'aws');
            expect(callCount).toBe(1); // No additional calls
            expect(result.get('key1')).toBe('value-key1');
            expect(result.get('key2')).toBe('value-key2');
        });

        test('should only fetch uncached keys from provider', async () => {
            const fetchedKeys: string[][] = [];
            const provider: SecretsProvider = {
                name: 'aws',
                async getSecret(key: string) {
                    return `value-${key}`;
                },
                async getSecrets(keys: string[]) {
                    fetchedKeys.push([...keys]);
                    return new Map(keys.map((k) => [k, `value-${k}`]));
                },
            };

            const manager = new SecretsManager();
            manager.registerProvider(provider);

            // Fetch key1 first
            await manager.getSecret('key1', 'aws');

            // Now fetch key1 and key2 — only key2 should be fetched
            await manager.getSecrets(['key1', 'key2'], 'aws');

            expect(fetchedKeys[0]).toEqual(['key2']);
        });
    });

    test.describe('provider selection per environment', () => {
        test('should resolve using env-file provider for local environment', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('env-file', { 'local-db-pass': 'local-secret' }));
            manager.registerProvider(createMockProvider('aws', { 'aws-db-pass': 'aws-secret' }));
            manager.registerProvider(createMockProvider('vault', { 'vault-db-pass': 'vault-secret' }));

            const config: FrameworkConfig = {
                environment: 'local',
                database: { type: 'postgresql', database: 'testdb', password: 'placeholder' },
                secrets: {
                    provider: 'env-file',
                    keyMappings: { 'local-db-pass': 'database.password' },
                },
            };
            const result = await manager.resolve(config);
            expect(result.database?.password).toBe('local-secret');
        });

        test('should resolve using aws provider for stg environment', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('env-file', { 'aws-db-pass': 'wrong' }));
            manager.registerProvider(createMockProvider('aws', { 'aws-db-pass': 'aws-secret' }));
            manager.registerProvider(createMockProvider('vault', { 'aws-db-pass': 'wrong' }));

            const config: FrameworkConfig = {
                environment: 'stg',
                database: { type: 'postgresql', database: 'testdb', password: 'placeholder' },
                secrets: {
                    provider: 'aws',
                    keyMappings: { 'aws-db-pass': 'database.password' },
                },
            };
            const result = await manager.resolve(config);
            expect(result.database?.password).toBe('aws-secret');
        });

        test('should resolve using vault provider for prod environment', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('env-file', { 'vault-db-pass': 'wrong' }));
            manager.registerProvider(createMockProvider('aws', { 'vault-db-pass': 'wrong' }));
            manager.registerProvider(createMockProvider('vault', { 'vault-db-pass': 'vault-secret' }));

            const config: FrameworkConfig = {
                environment: 'prod',
                database: { type: 'postgresql', database: 'testdb', password: 'placeholder' },
                secrets: {
                    provider: 'vault',
                    keyMappings: { 'vault-db-pass': 'database.password' },
                },
            };
            const result = await manager.resolve(config);
            expect(result.database?.password).toBe('vault-secret');
        });
    });

    test.describe('resolve', () => {
        test('should return config unchanged if no secrets config', async () => {
            const manager = new SecretsManager();
            const config: FrameworkConfig = { environment: 'local' };

            const result = await manager.resolve(config);
            expect(result).toEqual(config);
        });

        test('should return config unchanged if no keyMappings', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('aws'));

            const config: FrameworkConfig = {
                environment: 'dev',
                secrets: { provider: 'aws' },
            };

            const result = await manager.resolve(config);
            expect(result.environment).toBe('dev');
        });

        test('should inject secrets into config at mapped paths', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { 'db-password': 'secret123', 'db-user': 'admin' })
            );

            const config: FrameworkConfig = {
                environment: 'dev',
                database: {
                    type: 'postgresql',
                    database: 'testdb',
                    host: 'localhost',
                    port: 5432,
                    username: 'placeholder',
                    password: 'placeholder',
                },
                secrets: {
                    provider: 'aws',
                    keyMappings: {
                        'db-password': 'database.password',
                        'db-user': 'database.username',
                    },
                },
            };

            const result = await manager.resolve(config);

            expect(result.database?.password).toBe('secret123');
            expect(result.database?.username).toBe('admin');
        });

        test('should not mutate the original config', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { 'db-password': 'secret123' })
            );

            const config: FrameworkConfig = {
                environment: 'dev',
                database: {
                    type: 'postgresql',
                    database: 'testdb',
                    password: 'original',
                },
                secrets: {
                    provider: 'aws',
                    keyMappings: { 'db-password': 'database.password' },
                },
            };

            await manager.resolve(config);

            expect(config.database?.password).toBe('original');
        });

        test('should throw SecretsError for unrecognized provider in config', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(createMockProvider('aws'));

            const config: FrameworkConfig = {
                environment: 'dev',
                secrets: {
                    provider: 'nonexistent',
                    keyMappings: { key: 'database.password' },
                },
            };

            await expect(manager.resolve(config)).rejects.toThrow(SecretsError);
        });

        test('should throw SecretsError for invalid key mapping path', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { 'my-secret': 'value' })
            );

            const config: FrameworkConfig = {
                environment: 'dev',
                database: {
                    type: 'postgresql',
                    database: 'testdb',
                },
                secrets: {
                    provider: 'aws',
                    keyMappings: { 'my-secret': 'database.nonexistentField' },
                },
            };

            try {
                await manager.resolve(config);
                expect(true).toBe(false); // Should not reach here
            } catch (error) {
                const secretsError = error as SecretsError;
                expect(secretsError).toBeInstanceOf(SecretsError);
                expect(secretsError.operation).toBe('mapping');
                expect(secretsError.secretKey).toBe('my-secret');
                expect(secretsError.details?.invalidField).toBe('database.nonexistentField');
            }
        });

        test('should throw SecretsError for path through non-existent segment', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { 'my-secret': 'value' })
            );

            const config: FrameworkConfig = {
                environment: 'dev',
                secrets: {
                    provider: 'aws',
                    keyMappings: { 'my-secret': 'nonexistent.field' },
                },
            };

            try {
                await manager.resolve(config);
                expect(true).toBe(false);
            } catch (error) {
                const secretsError = error as SecretsError;
                expect(secretsError).toBeInstanceOf(SecretsError);
                expect(secretsError.operation).toBe('mapping');
            }
        });

        test('should use configured timeout from secrets config', async () => {
            const manager = new SecretsManager();
            manager.registerProvider(
                createMockProvider('aws', { key: 'value' }, { delay: 100 })
            );

            const config: FrameworkConfig = {
                environment: 'dev',
                database: {
                    type: 'postgresql',
                    database: 'testdb',
                    password: 'old',
                },
                secrets: {
                    provider: 'aws',
                    timeout: 50, // 50ms timeout, provider takes 100ms
                    keyMappings: { key: 'database.password' },
                },
            };

            await expect(manager.resolve(config)).rejects.toThrow(SecretsError);
        });
    });
});
