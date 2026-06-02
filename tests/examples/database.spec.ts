/**
 * Database Fixture — Example Test
 *
 * Demonstrates how to use the Database client fixture to run queries and
 * execute statements against PostgreSQL, MySQL, MSSQL, or SQLite databases.
 * The fixture manages connection pooling and teardown automatically.
 *
 * Prerequisites:
 *   - Database configured in environments.json or via PW_DB_* environment variables
 *   - The target database server running and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('Database Fixture Examples', () => {
    // These tests require a running database server.
    // Skip them when infrastructure is not available (only run in CI).
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-DB-001] query rows from a table', { tag: ['@TC-DB-001'] }, async ({ databaseClient }) => {
        await test.step('Step 1: Execute parameterized SELECT query for active users', async () => {
            const users = await databaseClient.query<{ id: number; name: string; email: string }>(
                'SELECT id, name, email FROM users WHERE active = $1',
                [true]
            );

            expect(users).toBeDefined();
            expect(Array.isArray(users)).toBe(true);
        });

        await test.step('Step 2: Verify returned rows have expected properties', async () => {
            const users = await databaseClient.query<{ id: number; name: string; email: string }>(
                'SELECT id, name, email FROM users WHERE active = $1',
                [true]
            );

            if (users.length > 0) {
                expect(users[0]).toHaveProperty('id');
                expect(users[0]).toHaveProperty('name');
                expect(users[0]).toHaveProperty('email');
            }
        });
    });

    test('[TC-DB-002] execute an insert statement', { tag: ['@TC-DB-002'] }, async ({ databaseClient }) => {
        await test.step('Step 1: Insert a new user record', async () => {
            const result = await databaseClient.execute(
                'INSERT INTO users (name, email, active) VALUES ($1, $2, $3)',
                ['Test User', 'test@example.com', true]
            );

            expect(result.affectedRows).toBe(1);
        });
    });

    test('[TC-DB-003] execute an update statement', { tag: ['@TC-DB-003'] }, async ({ databaseClient }) => {
        await test.step('Step 1: Update user active status by email', async () => {
            const result = await databaseClient.execute(
                'UPDATE users SET active = $1 WHERE email = $2',
                [false, 'test@example.com']
            );

            expect(result.affectedRows).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-DB-004] query with no results returns empty array', { tag: ['@TC-DB-004'] }, async ({ databaseClient }) => {
        await test.step('Step 1: Query with non-existent ID', async () => {
            const results = await databaseClient.query(
                'SELECT * FROM users WHERE id = $1',
                [-1]
            );

            expect(results).toEqual([]);
        });
    });
});
