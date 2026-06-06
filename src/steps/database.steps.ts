/**
 * Database Step Class
 *
 * Reusable step sequences for database client operations.
 * Wraps common SQL query/execute patterns for test reuse.
 */

import { test, expect } from '../index';

export interface DatabaseClient {
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    execute(sql: string, params?: any[]): Promise<{ affectedRows: number }>;
}

export class DatabaseSteps {
    constructor(private databaseClient: DatabaseClient) {}

    /**
     * Executes a SELECT query and returns typed rows.
     */
    async query<T = any>(description: string, sql: string, params?: any[]): Promise<T[]> {
        let rows: T[] = [];

        await test.step(`Step: ${description}`, async () => {
            rows = await this.databaseClient.query<T>(sql, params);
            expect(rows).toBeDefined();
            expect(Array.isArray(rows)).toBe(true);
        });

        return rows;
    }

    /**
     * Executes an INSERT/UPDATE/DELETE statement and returns the result.
     */
    async execute(description: string, sql: string, params?: any[]): Promise<{ affectedRows: number }> {
        let result: { affectedRows: number } = { affectedRows: 0 };

        await test.step(`Step: ${description}`, async () => {
            result = await this.databaseClient.execute(sql, params);
            expect(result).toBeDefined();
            expect(typeof result.affectedRows).toBe('number');
        });

        return result;
    }

    /**
     * Queries and asserts that at least one row is returned.
     */
    async queryExpectRows<T = any>(description: string, sql: string, params?: any[]): Promise<T[]> {
        let rows: T[] = [];

        await test.step(`Step: ${description}`, async () => {
            rows = await this.databaseClient.query<T>(sql, params);
            expect(rows.length).toBeGreaterThan(0);
        });

        return rows;
    }

    /**
     * Queries and asserts that no rows are returned.
     */
    async queryExpectEmpty(description: string, sql: string, params?: any[]): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const rows = await this.databaseClient.query(sql, params);
            expect(rows).toEqual([]);
        });
    }

    /**
     * Executes and asserts the affected row count equals the expected value.
     */
    async executeExpectAffected(description: string, sql: string, params: any[], expectedCount: number): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const result = await this.databaseClient.execute(sql, params);
            expect(result.affectedRows).toBe(expectedCount);
        });
    }

    /**
     * Verifies rows have expected properties.
     */
    async verifyRowProperties(description: string, rows: any[], properties: string[]): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            if (rows.length > 0) {
                for (const prop of properties) {
                    expect(rows[0]).toHaveProperty(prop);
                }
            }
        });
    }
}
