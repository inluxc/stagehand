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

    test('[TC-RDS-001] set and get a value', { tag: ['@TC-RDS-001'] }, async ({ redisClient }) => {
        await test.step('Step 1: Set a value for key user:1:name', async () => {
            await redisClient.set('user:1:name', 'Alice');
        });

        await test.step('Step 2: Get the value and verify it matches', async () => {
            const name = await redisClient.get('user:1:name');
            expect(name).toBe('Alice');
        });
    });

    test('[TC-RDS-002] set a value with TTL', { tag: ['@TC-RDS-002'] }, async ({ redisClient }) => {
        await test.step('Step 1: Set a session value with 60 second TTL', async () => {
            await redisClient.set('session:abc123', 'active', 60);
        });

        await test.step('Step 2: Verify the value is retrievable before expiry', async () => {
            const session = await redisClient.get('session:abc123');
            expect(session).toBe('active');
        });
    });

    test('[TC-RDS-003] delete a key', { tag: ['@TC-RDS-003'] }, async ({ redisClient }) => {
        await test.step('Step 1: Set a temporary value', async () => {
            await redisClient.set('temp:data', 'to-be-deleted');
        });

        await test.step('Step 2: Delete the key and verify removal count', async () => {
            const removed = await redisClient.del('temp:data');
            expect(removed).toBe(1);
        });

        await test.step('Step 3: Verify key no longer exists', async () => {
            const value = await redisClient.get('temp:data');
            expect(value).toBeNull();
        });
    });

    test('[TC-RDS-004] publish and subscribe to a channel', { tag: ['@TC-RDS-004'] }, async ({ redisClient }) => {
        const channel = 'notifications';
        const message = JSON.stringify({ type: 'alert', text: 'Server restarted' });

        await test.step('Step 1: Start subscribing to channel', async () => {
            // subscribe() is started here but awaited later
        });

        const subscribePromise = redisClient.subscribe(channel, { timeout: 5000 });

        await test.step('Step 2: Wait for subscription to be active', async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });

        await test.step('Step 3: Publish a message to the channel', async () => {
            const receivers = await redisClient.publish(channel, message);
            expect(receivers).toBeGreaterThanOrEqual(1);
        });

        await test.step('Step 4: Verify the subscribed message is received', async () => {
            const received = await subscribePromise;
            expect(received).toBe(message);
        });
    });

    test('[TC-RDS-005] get returns null for non-existent key', { tag: ['@TC-RDS-005'] }, async ({ redisClient }) => {
        await test.step('Step 1: Get a key that does not exist', async () => {
            const value = await redisClient.get('non:existent:key');
            expect(value).toBeNull();
        });
    });
});
