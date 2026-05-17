/**
 * Redis integration fixture for the Playwright Framework Template.
 *
 * Provides a Redis client with get, set, del, publish, and subscribe methods.
 * Supports test-scoped key prefix isolation and automatic teardown cleanup.
 *
 * Uses ioredis for Redis connectivity.
 *
 * @requirements 5.1, 5.2, 5.3, 5.4, 5.5
 */

import Redis from 'ioredis';
import { RedisFixtureConfig } from '../config/schema';
import { FixtureInitError } from '../errors';

/**
 * Options for the subscribe method.
 */
export interface SubscribeOptions {
    /** Timeout in ms to wait for a message (default: 5000). */
    timeout?: number;
}

/**
 * Redis client interface exposed to tests.
 */
export interface RedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    del(key: string): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string, options?: SubscribeOptions): Promise<string | null>;
    quit(): Promise<void>;
}

const DEFAULT_CONNECTION_TIMEOUT = 5000;
const DEFAULT_SUBSCRIBE_TIMEOUT = 5000;

/**
 * Creates a Redis client instance connected to the configured server.
 * Verifies connectivity with a PING command.
 * If keyPrefix is configured, creates a separate subscriber client for pub/sub.
 */
async function createRedisClient(config: RedisFixtureConfig): Promise<{
    client: Redis;
    subscriber: Redis | null;
}> {
    const connectionTimeout = config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT;

    const client = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        keyPrefix: config.keyPrefix,
        connectTimeout: connectionTimeout,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null, // Do not retry on connection failure
        lazyConnect: true,
    });

    try {
        await client.connect();
        await client.ping();
    } catch (error) {
        client.disconnect();
        throw new FixtureInitError(
            'redis',
            'connect',
            {
                host: config.host,
                port: config.port,
                timeout: connectionTimeout,
                reason: error instanceof Error ? error.message : String(error),
            },
            error instanceof Error ? error : undefined
        );
    }

    let subscriber: Redis | null = null;

    if (config.keyPrefix) {
        subscriber = new Redis({
            host: config.host,
            port: config.port,
            password: config.password,
            db: config.db,
            connectTimeout: connectionTimeout,
            maxRetriesPerRequest: 0,
            retryStrategy: () => null,
            lazyConnect: true,
        });

        try {
            await subscriber.connect();
        } catch (error) {
            client.disconnect();
            subscriber.disconnect();
            throw new FixtureInitError(
                'redis',
                'connect',
                {
                    host: config.host,
                    port: config.port,
                    timeout: connectionTimeout,
                    reason: `Subscriber connection failed: ${error instanceof Error ? error.message : String(error)}`,
                },
                error instanceof Error ? error : undefined
            );
        }
    }

    return { client, subscriber };
}

/**
 * Builds the RedisClient interface wrapping the ioredis instances.
 */
function buildRedisClient(
    client: Redis,
    subscriber: Redis | null,
    config: RedisFixtureConfig
): RedisClient {
    return {
        async get(key: string): Promise<string | null> {
            return client.get(key);
        },

        async set(key: string, value: string, ttl?: number): Promise<void> {
            if (ttl !== undefined) {
                await client.set(key, value, 'EX', ttl);
            } else {
                await client.set(key, value);
            }
        },

        async del(key: string): Promise<number> {
            return client.del(key);
        },

        async publish(channel: string, message: string): Promise<number> {
            return client.publish(channel, message);
        },

        async subscribe(channel: string, options?: SubscribeOptions): Promise<string | null> {
            const timeout = options?.timeout ?? DEFAULT_SUBSCRIBE_TIMEOUT;
            const subClient = subscriber ?? client.duplicate();
            const shouldDisconnect = !subscriber;

            return new Promise<string | null>((resolve) => {
                let resolved = false;

                const timer = setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        subClient.unsubscribe(channel).catch(() => { });
                        if (shouldDisconnect) {
                            subClient.disconnect();
                        }
                        resolve(null);
                    }
                }, timeout);

                subClient.on('message', (ch: string, message: string) => {
                    if (ch === channel && !resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        subClient.unsubscribe(channel).catch(() => { });
                        if (shouldDisconnect) {
                            subClient.disconnect();
                        }
                        resolve(message);
                    }
                });

                subClient.subscribe(channel).catch((err) => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timer);
                        if (shouldDisconnect) {
                            subClient.disconnect();
                        }
                        resolve(null);
                    }
                });
            });
        },

        async quit(): Promise<void> {
            await client.quit();
        },
    };
}

/**
 * Flushes all keys matching the configured keyPrefix pattern.
 */
async function flushPrefixedKeys(client: Redis, keyPrefix: string): Promise<void> {
    const pattern = `${keyPrefix}*`;
    let cursor = '0';

    do {
        // Use SCAN with the raw pattern (keyPrefix is already applied by ioredis for commands,
        // but SCAN needs the full pattern including the prefix)
        const [nextCursor, keys] = await client.scan(
            cursor,
            'MATCH',
            pattern,
            'COUNT',
            100
        );
        cursor = nextCursor;

        if (keys.length > 0) {
            // Keys returned by SCAN already include the prefix, so use unlink directly
            // We need to strip the keyPrefix since ioredis auto-prepends it
            const strippedKeys = keys.map((k) => k.startsWith(keyPrefix) ? k.slice(keyPrefix.length) : k);
            await client.del(...strippedKeys);
        }
    } while (cursor !== '0');
}

/**
 * Redis fixture definition for Playwright's test.extend() pattern.
 *
 * Setup: Creates ioredis client, verifies connection with PING,
 *        creates subscriber client if keyPrefix is configured.
 * Teardown: Flushes prefixed keys, disconnects subscriber, quits main client.
 */
export const redisFixture = {
    redisClient: async (
        { redisConfig }: { redisConfig: RedisFixtureConfig },
        use: (client: RedisClient) => Promise<void>
    ) => {
        const { client, subscriber } = await createRedisClient(redisConfig);
        const redisClient = buildRedisClient(client, subscriber, redisConfig);

        await use(redisClient);

        // Teardown
        if (redisConfig.keyPrefix) {
            try {
                await flushPrefixedKeys(client, redisConfig.keyPrefix);
            } catch {
                // Log warning but don't fail the test
            }
        }

        if (subscriber) {
            try {
                subscriber.disconnect();
            } catch {
                // Log warning but don't fail the test
            }
        }

        try {
            await client.quit();
        } catch {
            client.disconnect();
        }
    },
};
