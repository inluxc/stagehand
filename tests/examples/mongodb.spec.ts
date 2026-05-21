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

    test('find documents in a collection', async ({ mongoDbClient }) => {
        // The mongoDbClient fixture provides:
        //   - find<T>(collection, filter?, options?): query documents
        //   - findOne<T>(collection, filter?): find a single document
        //   - insertOne(collection, document): insert one document
        //   - insertMany(collection, documents): insert multiple documents
        //   - updateOne(collection, filter, update): update one document
        //   - updateMany(collection, filter, update): update multiple documents
        //   - deleteOne(collection, filter): delete one document
        //   - deleteMany(collection, filter): delete multiple documents
        //   - aggregate<T>(collection, pipeline, options?): run aggregation pipeline
        //   - close(): manually close the connection (handled automatically on teardown)

        const users = await mongoDbClient.find<{ _id: unknown; name: string; email: string }>(
            'users',
            { active: true },
            { limit: 10, sort: { name: 1 } }
        );

        expect(users).toBeDefined();
        expect(Array.isArray(users)).toBe(true);

        if (users.length > 0) {
            expect(users[0]).toHaveProperty('name');
            expect(users[0]).toHaveProperty('email');
        }
    });

    test('find a single document', async ({ mongoDbClient }) => {
        const user = await mongoDbClient.findOne<{ name: string; email: string }>(
            'users',
            { email: 'admin@example.com' }
        );

        // findOne returns null if no document matches
        if (user) {
            expect(user).toHaveProperty('name');
            expect(user).toHaveProperty('email');
        } else {
            expect(user).toBeNull();
        }
    });

    test('insert a document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.insertOne('users', {
            name: 'Test User',
            email: 'test@example.com',
            active: true,
            createdAt: new Date().toISOString(),
        });

        expect(result.acknowledged).toBe(true);
        expect(result.insertedId).toBeDefined();
    });

    test('insert multiple documents', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.insertMany('users', [
            { name: 'User A', email: 'a@example.com', active: true },
            { name: 'User B', email: 'b@example.com', active: false },
        ]);

        expect(result.acknowledged).toBe(true);
        expect(result.insertedCount).toBe(2);
    });

    test('update a document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.updateOne(
            'users',
            { email: 'test@example.com' },
            { $set: { active: false, updatedAt: new Date().toISOString() } }
        );

        expect(result.acknowledged).toBe(true);
        expect(result.matchedCount).toBeGreaterThanOrEqual(0);
    });

    test('delete a document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.deleteOne('users', {
            email: 'test@example.com',
        });

        expect(result.acknowledged).toBe(true);
        expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });

    test('run an aggregation pipeline', async ({ mongoDbClient }) => {
        const results = await mongoDbClient.aggregate<{ _id: boolean; count: number }>(
            'users',
            [
                { $group: { _id: '$active', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]
        );

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        if (results.length > 0) {
            expect(results[0]).toHaveProperty('_id');
            expect(results[0]).toHaveProperty('count');
        }
    });
});
