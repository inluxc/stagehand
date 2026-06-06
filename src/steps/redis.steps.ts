/**
 * Redis Step Class
 *
 * Reusable step sequences for Redis client operations.
 * Wraps common key-value and pub/sub patterns for test reuse.
 */

import { test, expect } from '../index';

export interface RedisClient {
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttl?: number): Promise<void>;
    del(key: string): Promise<number>;
    publish(channel: string, message: string): Promise<number>;
    subscribe(channel: string, options?: { timeout?: number }): Promise<string | null>;
}

export class RedisSteps {
    constructor(private redisClient: RedisClient) {}

    /**
     * Sets a key-value pair with optional TTL.
     */
    async set(description: string, key: string, value: string, ttl?: number): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.redisClient.set(key, value, ttl);
        });
    }

    /**
     * Gets a value by key and returns it.
     */
    async get(description: string, key: string): Promise<string | null> {
        let result: string | null = null;

        await test.step(`Step: ${description}`, async () => {
            result = await this.redisClient.get(key);
        });

        return result;
    }

    /**
     * Gets a value and asserts it equals expected.
     */
    async getExpectValue(description: string, key: string, expected: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const value = await this.redisClient.get(key);
            expect(value).toBe(expected);
        });
    }

    /**
     * Gets a value and asserts it is null.
     */
    async getExpectNull(description: string, key: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const value = await this.redisClient.get(key);
            expect(value).toBeNull();
        });
    }

    /**
     * Deletes a key and returns the count of removed keys.
     */
    async del(description: string, key: string): Promise<number> {
        let removed = 0;

        await test.step(`Step: ${description}`, async () => {
            removed = await this.redisClient.del(key);
        });

        return removed;
    }

    /**
     * Deletes a key and asserts exactly one key was removed.
     */
    async delExpectRemoved(description: string, key: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const removed = await this.redisClient.del(key);
            expect(removed).toBe(1);
        });
    }

    /**
     * Publishes a message to a channel and returns the receiver count.
     */
    async publish(description: string, channel: string, message: string): Promise<number> {
        let receivers = 0;

        await test.step(`Step: ${description}`, async () => {
            receivers = await this.redisClient.publish(channel, message);
        });

        return receivers;
    }

    /**
     * Subscribes to a channel and returns the received message.
     */
    async subscribe(description: string, channel: string, options?: { timeout?: number }): Promise<string | null> {
        let received: string | null = null;

        await test.step(`Step: ${description}`, async () => {
            received = await this.redisClient.subscribe(channel, options);
        });

        return received;
    }
}
