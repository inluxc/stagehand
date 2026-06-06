/**
 * Redis Fixture — Example Test
 *
 * Demonstrates how to use the Redis client fixture for key-value operations
 * and pub/sub messaging. Uses the RedisSteps class for reusable step sequences.
 * The fixture supports test-scoped key prefix isolation and automatic cleanup.
 *
 * Prerequisites:
 *   - Redis configured in environments.json or via PW_REDIS_* environment variables
 *   - Redis server running and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';
import { RedisSteps } from '../../src/steps';

test.describe('Redis Fixture Examples', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-RDS-001] set and get a value', { tag: ['@TC-RDS-001'] }, async ({ redisClient }) => {
        const redis = new RedisSteps(redisClient);

        await redis.set('Set a value for key user:1:name', 'user:1:name', 'Alice');
        await redis.getExpectValue('Get the value and verify it matches', 'user:1:name', 'Alice');
    });

    test('[TC-RDS-002] set a value with TTL', { tag: ['@TC-RDS-002'] }, async ({ redisClient }) => {
        const redis = new RedisSteps(redisClient);

        await redis.set('Set a session value with 60 second TTL', 'session:abc123', 'active', 60);
        await redis.getExpectValue('Verify the value is retrievable before expiry', 'session:abc123', 'active');
    });

    test('[TC-RDS-003] delete a key', { tag: ['@TC-RDS-003'] }, async ({ redisClient }) => {
        const redis = new RedisSteps(redisClient);

        await redis.set('Set a temporary value', 'temp:data', 'to-be-deleted');
        await redis.delExpectRemoved('Delete the key and verify removal count', 'temp:data');
        await redis.getExpectNull('Verify key no longer exists', 'temp:data');
    });

    test('[TC-RDS-004] publish and subscribe to a channel', { tag: ['@TC-RDS-004'] }, async ({ redisClient }) => {
        const redis = new RedisSteps(redisClient);
        const channel = 'notifications';
        const message = JSON.stringify({ type: 'alert', text: 'Server restarted' });

        // Start subscription (non-blocking, returned as a promise)
        const subscribePromise = redisClient.subscribe(channel, { timeout: 5000 });

        await test.step('Step 1: Wait for subscription to be active', async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
        });

        await test.step('Step 2: Publish a message to the channel', async () => {
            const receivers = await redisClient.publish(channel, message);
            expect(receivers).toBeGreaterThanOrEqual(1);
        });

        await test.step('Step 3: Verify the subscribed message is received', async () => {
            const received = await subscribePromise;
            expect(received).toBe(message);
        });
    });

    test('[TC-RDS-005] get returns null for non-existent key', { tag: ['@TC-RDS-005'] }, async ({ redisClient }) => {
        const redis = new RedisSteps(redisClient);

        await redis.getExpectNull('Get a key that does not exist', 'non:existent:key');
    });
});
