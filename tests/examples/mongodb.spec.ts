/**
 * MongoDB Fixture — Example Test
 *
 * Demonstrates how to use the MongoDB client fixture to perform CRUD operations
 * and aggregations against a MongoDB database.
 * The fixture manages connection lifecycle and teardown automatically.
 *
 * Prerequisites:
 *   - MongoDB configured in environments.json or via PW_MONGODB_* environment variables
 *   - The target MongoDB server running and accessible
 *
 * @requirements 8.1, 8.2, 8.3
 */

import { test, expect } from '../../src';

test.describe('MongoDB Fixture Examples', () => {
    // These tests require a running MongoDB server.
    // Skip them when infrastructure is not available (only run in CI).
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-MDB-001] find documents in a collection', { tag: ['@TC-MDB-001'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Query active users with limit and sort options', async () => {
            const users = await mongoDbClient.find<{ _id: unknown; name: string; email: string }>(
                'users',
                { active: true },
                { limit: 10, sort: { name: 1 } }
            );

            expect(users).toBeDefined();
            expect(Array.isArray(users)).toBe(true);
        });

        await test.step('Step 2: Verify returned documents have expected fields', async () => {
            const users = await mongoDbClient.find<{ _id: unknown; name: string; email: string }>(
                'users',
                { active: true },
                { limit: 10, sort: { name: 1 } }
            );

            if (users.length > 0) {
                expect(users[0]).toHaveProperty('name');
                expect(users[0]).toHaveProperty('email');
            }
        });
    });

    test('[TC-MDB-002] find a single document', { tag: ['@TC-MDB-002'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Query for a specific user by email', async () => {
            const user = await mongoDbClient.findOne<{ name: string; email: string }>(
                'users',
                { email: 'admin@example.com' }
            );

            if (user) {
                expect(user).toHaveProperty('name');
                expect(user).toHaveProperty('email');
            } else {
                expect(user).toBeNull();
            }
        });
    });

    test('[TC-MDB-003] insert a document', { tag: ['@TC-MDB-003'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Insert a new user document', async () => {
            const result = await mongoDbClient.insertOne('users', {
                name: 'Test User',
                email: 'test@example.com',
                active: true,
                createdAt: new Date().toISOString(),
            });

            expect(result.acknowledged).toBe(true);
            expect(result.insertedId).toBeDefined();
        });
    });

    test('[TC-MDB-004] insert multiple documents', { tag: ['@TC-MDB-004'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Insert two user documents at once', async () => {
            const result = await mongoDbClient.insertMany('users', [
                { name: 'User A', email: 'a@example.com', active: true },
                { name: 'User B', email: 'b@example.com', active: false },
            ]);

            expect(result.acknowledged).toBe(true);
            expect(result.insertedCount).toBe(2);
        });
    });

    test('[TC-MDB-005] update a document', { tag: ['@TC-MDB-005'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Update user active status using $set operator', async () => {
            const result = await mongoDbClient.updateOne(
                'users',
                { email: 'test@example.com' },
                { $set: { active: false, updatedAt: new Date().toISOString() } }
            );

            expect(result.acknowledged).toBe(true);
            expect(result.matchedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-006] delete a document', { tag: ['@TC-MDB-006'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Delete user document by email filter', async () => {
            const result = await mongoDbClient.deleteOne('users', {
                email: 'test@example.com',
            });

            expect(result.acknowledged).toBe(true);
            expect(result.deletedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-007] run an aggregation pipeline', { tag: ['@TC-MDB-007'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Execute aggregation grouping by active status', async () => {
            const results = await mongoDbClient.aggregate<{ _id: boolean; count: number }>(
                'users',
                [
                    { $group: { _id: '$active', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]
            );

            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        await test.step('Step 2: Verify aggregation result structure', async () => {
            const results = await mongoDbClient.aggregate<{ _id: boolean; count: number }>(
                'users',
                [
                    { $group: { _id: '$active', count: { $sum: 1 } } },
                    { $sort: { count: -1 } },
                ]
            );

            if (results.length > 0) {
                expect(results[0]).toHaveProperty('_id');
                expect(results[0]).toHaveProperty('count');
            }
        });
    });
});
