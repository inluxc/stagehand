/**
 * Redis Fixture — Example Test
 *
 * Demonstrates how to use the Redis client fixture for key-value operations
 * and pub/sub messaging. The fixture supports test-scoped key prefix isolation
 * and automatic cleanup on teardown.
 *
 * Prerequisites:
 *   - Redis configured in environments.json or via PW_REDIS_* environment variables
 *   - Redis server running and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('Redis Fixture Examples', () => {
    // These tests require a running Redis server.
    // Skip them when infrastructure is not available.
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('set and get a value', async ({ redisClient }) => {
        // The redisClient fixture provides:
        //   - get(key): retrieve a value by key
        //   - set(key, value, ttl?): store a value with optional TTL in seconds
        //   - del(key): delete a key
        //   - publish(channel, message): publish a message to a channel
        //   - subscribe(channel, options?): wait for a message on a channel
        //   - quit(): manually disconnect (handled automatically on teardown)

        // Set a value
        await redisClient.set('user:1:name', 'Alice');

        // Get the value back
        const name = await redisClient.get('user:1:name');
        expect(name).toBe('Alice');
    });

    test('set a value with TTL', async ({ redisClient }) => {
        // Set a value that expires after 60 seconds
        await redisClient.set('session:abc123', 'active', 60);

        const session = await redisClient.get('session:abc123');
        expect(session).toBe('active');
    });

    test('delete a key', async ({ redisClient }) => {
        await redisClient.set('temp:data', 'to-be-deleted');

        // del() returns the number of keys removed
        const removed = await redisClient.del('temp:data');
        expect(removed).toBe(1);

        // Key no longer exists
        const value = await redisClient.get('temp:data');
        expect(value).toBeNull();
    });

    test('publish and subscribe to a channel', async ({ redisClient }) => {
        const channel = 'notifications';
        const message = JSON.stringify({ type: 'alert', text: 'Server restarted' });

        // Start subscribing BEFORE publishing.
        // subscribe() returns the first message received within the timeout, or null.
        const subscribePromise = redisClient.subscribe(channel, { timeout: 5000 });

        // Small delay to ensure subscription is active before publishing
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Publish a message to the channel
        const receivers = await redisClient.publish(channel, message);
        expect(receivers).toBeGreaterThanOrEqual(1);

        // Await the subscribed message
        const received = await subscribePromise;
        expect(received).toBe(message);
    });

    test('get returns null for non-existent key', async ({ redisClient }) => {
        const value = await redisClient.get('non:existent:key');
        expect(value).toBeNull();
    });
});
