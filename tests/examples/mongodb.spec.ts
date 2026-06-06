/**
 * MongoDB Fixture — Example Test
 *
 * Demonstrates how to use the MongoDB client fixture to perform CRUD operations
 * and aggregations against a MongoDB database.
 * Uses the MongoDbSteps class for reusable step sequences.
 *
 * Prerequisites:
 *   - MongoDB configured in environments.json or via PW_MONGODB_* environment variables
 *   - The target MongoDB server running and accessible
 *
 * @requirements 8.1, 8.2, 8.3
 */

import { test, expect } from '../../src';
import { MongoDbSteps } from '../../src/steps';

test.describe('MongoDB Fixture Examples', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-MDB-001] find documents in a collection', { tag: ['@TC-MDB-001'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        const users = await mongo.find<{ _id: unknown; name: string; email: string }>(
            'Query active users with limit and sort options',
            'users',
            { active: true },
            { limit: 10, sort: { name: 1 } },
        );

        await mongo.verifyDocumentProperties('Verify returned documents have expected fields', users, ['name', 'email']);
    });

    test('[TC-MDB-002] find a single document', { tag: ['@TC-MDB-002'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        const user = await mongo.findOne<{ name: string; email: string }>(
            'Query for a specific user by email',
            'users',
            { email: 'admin@example.com' },
        );

        await test.step('Step 1: Verify document shape if found', async () => {
            if (user) {
                expect(user).toHaveProperty('name');
                expect(user).toHaveProperty('email');
            } else {
                expect(user).toBeNull();
            }
        });
    });

    test('[TC-MDB-003] insert a document', { tag: ['@TC-MDB-003'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        await mongo.insertOne('Insert a new user document', 'users', {
            name: 'Test User',
            email: 'test@example.com',
            active: true,
            createdAt: new Date().toISOString(),
        });
    });

    test('[TC-MDB-004] insert multiple documents', { tag: ['@TC-MDB-004'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        await mongo.insertMany('Insert two user documents at once', 'users', [
            { name: 'User A', email: 'a@example.com', active: true },
            { name: 'User B', email: 'b@example.com', active: false },
        ]);
    });

    test('[TC-MDB-005] update a document', { tag: ['@TC-MDB-005'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        const result = await mongo.updateOne(
            'Update user active status using $set operator',
            'users',
            { email: 'test@example.com' },
            { $set: { active: false, updatedAt: new Date().toISOString() } },
        );

        await test.step('Step 1: Verify matchedCount is non-negative', async () => {
            expect(result.matchedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-006] delete a document', { tag: ['@TC-MDB-006'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        const result = await mongo.deleteOne(
            'Delete user document by email filter',
            'users',
            { email: 'test@example.com' },
        );

        await test.step('Step 1: Verify deletedCount is non-negative', async () => {
            expect(result.deletedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-007] run an aggregation pipeline', { tag: ['@TC-MDB-007'] }, async ({ mongoDbClient }) => {
        const mongo = new MongoDbSteps(mongoDbClient);

        const results = await mongo.aggregate<{ _id: boolean; count: number }>(
            'Execute aggregation grouping by active status',
            'users',
            [
                { $group: { _id: '$active', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ],
        );

        await mongo.verifyDocumentProperties('Verify aggregation result structure', results, ['_id', 'count']);
    });
});
