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

    test('query rows from a table', async ({ databaseClient }) => {
        // The databaseClient fixture provides:
        //   - query<T>(sql, params?): executes a SELECT and returns typed rows
        //   - execute(sql, params?): executes INSERT/UPDATE/DELETE and returns affected row count
        //   - close(): manually close the connection (handled automatically on teardown)

        // Run a parameterized query — parameters prevent SQL injection
        const users = await databaseClient.query<{ id: number; name: string; email: string }>(
            'SELECT id, name, email FROM users WHERE active = $1',
            [true]
        );

        expect(users).toBeDefined();
        expect(Array.isArray(users)).toBe(true);

        // Each row is typed according to the generic parameter
        if (users.length > 0) {
            expect(users[0]).toHaveProperty('id');
            expect(users[0]).toHaveProperty('name');
            expect(users[0]).toHaveProperty('email');
        }
    });

    test('execute an insert statement', async ({ databaseClient }) => {
        // Use execute() for statements that modify data
        const result = await databaseClient.execute(
            'INSERT INTO users (name, email, active) VALUES ($1, $2, $3)',
            ['Test User', 'test@example.com', true]
        );

        // execute() returns the number of affected rows
        expect(result.affectedRows).toBe(1);
    });

    test('execute an update statement', async ({ databaseClient }) => {
        const result = await databaseClient.execute(
            'UPDATE users SET active = $1 WHERE email = $2',
            [false, 'test@example.com']
        );

        // affectedRows tells you how many rows were modified
        expect(result.affectedRows).toBeGreaterThanOrEqual(0);
    });

    test('query with no results returns empty array', async ({ databaseClient }) => {
        const results = await databaseClient.query(
            'SELECT * FROM users WHERE id = $1',
            [-1]
        );

        // An empty result set returns an empty array, not null or undefined
        expect(results).toEqual([]);
    });
});
