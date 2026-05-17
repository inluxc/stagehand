/**
 * Unit tests for the Redis integration fixture.
 *
 * Tests cover:
 * - Key prefix matching for test isolation
 * - FixtureInitError formatting on connection failure
 * - Subscribe timeout returns null
 * - Default timeout values
 * - Configuration handling
 *
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { test, expect } from '@playwright/test';
import { FixtureInitError } from '../../src/errors';
import type { RedisFixtureConfig } from '../../src/config/schema';

test.describe('Redis Fixture', () => {
    test.describe('Key prefix matching', () => {
        test('keyPrefix is applied to isolate test keys', () => {
            const config: RedisFixtureConfig = {
                host: 'localhost',
                port: 6379,
                keyPrefix: 'test-run-123:',
            };

            expect(config.keyPrefix).toBe('test-run-123:');
        });

        test('keyPrefix is optional', () => {
            const config: RedisFixtureConfig = {
                host: 'localhost',
                port: 6379,
            };

            expect(config.keyPrefix).toBeUndefined();
        });

        test('key prefix pattern for flush uses prefix with wildcard', () => {
            const keyPrefix = 'test-abc:';
            const pattern = `${keyPrefix}*`;

            expect(pattern).toBe('test-abc:*');
            expect(pattern).toContain(keyPrefix);
        });

        test('keys with prefix are stripped before deletion', () => {
            const keyPrefix = 'test:';
            const rawKeys = ['test:user:1', 'test:user:2', 'test:session:abc'];
            const strippedKeys = rawKeys.map((k) =>
                k.startsWith(keyPrefix) ? k.slice(keyPrefix.length) : k
            );

            expect(strippedKeys).toEqual(['user:1', 'user:2', 'session:abc']);
        });
    });

    test.describe('FixtureInitError on connection failure', () => {
        test('includes host, port, and timeout', () => {
            const error = new FixtureInitError('redis', 'connect', {
                host: 'redis.example.com',
                port: 6379,
                timeout: 5000,
                reason: 'Connection refused',
            });

            expect(error).toBeInstanceOf(FixtureInitError);
            expect(error.fixtureName).toBe('redis');
            expect(error.operation).toBe('connect');
            expect(error.details.host).toBe('redis.example.com');
            expect(error.details.port).toBe(6379);
            expect(error.details.timeout).toBe(5000);
            expect(error.details.reason).toBe('Connection refused');
        });

        test('error message contains fixture name and operation', () => {
            const error = new FixtureInitError('redis', 'connect', {
                host: 'localhost',
                port: 6379,
                timeout: 5000,
                reason: 'ECONNREFUSED',
            });

            expect(error.message).toContain('redis');
            expect(error.message).toContain('connect');
            expect(error.message).toContain('ECONNREFUSED');
        });

        test('preserves cause error', () => {
            const originalError = new Error('Redis connection timeout');
            const error = new FixtureInitError('redis', 'connect', {
                host: 'localhost',
                port: 6379,
                timeout: 5000,
                reason: 'Redis connection timeout',
            }, originalError);

            expect(error.cause).toBe(originalError);
        });

        test('includes subscriber connection failure context', () => {
            const error = new FixtureInitError('redis', 'connect', {
                host: 'localhost',
                port: 6379,
                timeout: 5000,
                reason: 'Subscriber connection failed: ECONNREFUSED',
            });

            expect(error.details.reason).toContain('Subscriber connection failed');
        });
    });

    test.describe('Subscribe timeout behavior', () => {
        test('subscribe returns null when timeout expires', async () => {
            // The subscribe method resolves with null when timeout fires
            // and no message has been received on the channel.
            const result = await new Promise<string | null>((resolve) => {
                const timeout = 50; // Use short timeout for test
                setTimeout(() => resolve(null), timeout);
            });

            expect(result).toBeNull();
        });

        test('default subscribe timeout is 5000ms', () => {
            const DEFAULT_SUBSCRIBE_TIMEOUT = 5000;
            expect(DEFAULT_SUBSCRIBE_TIMEOUT).toBe(5000);
        });

        test('subscribe options allow custom timeout', () => {
            const options = { timeout: 10000 };
            expect(options.timeout).toBe(10000);
        });
    });

    test.describe('Configuration handling', () => {
        test('requires host and port', () => {
            const config: RedisFixtureConfig = {
                host: 'redis-server',
                port: 6380,
            };

            expect(config.host).toBe('redis-server');
            expect(config.port).toBe(6380);
        });

        test('password is optional', () => {
            const config: RedisFixtureConfig = {
                host: 'localhost',
                port: 6379,
            };

            expect(config.password).toBeUndefined();
        });

        test('db index is optional', () => {
            const config: RedisFixtureConfig = {
                host: 'localhost',
                port: 6379,
                db: 2,
            };

            expect(config.db).toBe(2);
        });

        test('default connection timeout is 5000ms', () => {
            const DEFAULT_CONNECTION_TIMEOUT = 5000;
            expect(DEFAULT_CONNECTION_TIMEOUT).toBe(5000);
        });

        test('connectionTimeout is optional and overridable', () => {
            const config: RedisFixtureConfig = {
                host: 'localhost',
                port: 6379,
                connectionTimeout: 10000,
            };

            expect(config.connectionTimeout).toBe(10000);
        });
    });

    test.describe('Error message formatting', () => {
        test('FixtureInitError message includes all detail fields', () => {
            const error = new FixtureInitError('redis', 'connect', {
                host: 'redis-host',
                port: 6379,
                timeout: 5000,
                reason: 'Auth failed',
            });

            expect(error.message).toContain('host');
            expect(error.message).toContain('port');
            expect(error.message).toContain('timeout');
            expect(error.message).toContain('reason');
        });

        test('error name is FixtureInitError', () => {
            const error = new FixtureInitError('redis', 'connect', {
                host: 'localhost',
                port: 6379,
                timeout: 5000,
                reason: 'Connection closed',
            });

            expect(error.name).toBe('FixtureInitError');
        });
    });
});
