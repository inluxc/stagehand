/**
 * Property 4: Database annotation contains required metadata
 *
 * For any SQL string and non-negative row count, the database annotation formatter
 * SHALL produce an annotation containing the operation type (`query` or `execute`),
 * the SQL statement (truncated to 2048 characters if necessary), and the exact row count.
 *
 * **Validates: Requirements 12.2**
 *
 * Feature: cicd-emulated-testing, Property 4: Database annotation contains required metadata
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { recordDatabase } from '../../src/annotations/recorder';

const SQL_LIMIT = 2048;
const TRUNCATION_INDICATOR = '[truncated]';

/**
 * Creates a mock testInfo object matching the minimal interface expected by recordDatabase.
 */
function createMockTestInfo() {
    return { annotations: [] as Array<{ type: string; description?: string }> };
}

/**
 * Generates arbitrary SQL strings that do NOT contain credential patterns,
 * so we can test metadata structure without redaction interference.
 */
const arbSafeSql = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _.,;:()[]{}=<>*+-/\n\t'.split('')),
    { minLength: 0, maxLength: 4096 }
);

/**
 * Generates a non-negative integer for row count.
 */
const arbRowCount = fc.nat();

/**
 * Generates a database operation type.
 */
const arbOperation = fc.constantFrom('query', 'execute') as fc.Arbitrary<'query' | 'execute'>;

/**
 * Generates SQL strings containing credential patterns for redaction testing.
 */
const arbSqlWithCredentials = fc.tuple(
    fc.constantFrom(
        'SELECT * FROM users WHERE password=secret123',
        'INSERT INTO config SET pwd=mypass;',
        'SELECT token=abc123 FROM tokens',
        'UPDATE keys SET api_key=sk_live_xyz',
    ),
    arbOperation
);

test.describe('Property 4: Database annotation contains required metadata', {
    tag: '@Feature: cicd-emulated-testing, Property 4: Database annotation contains required metadata',
}, () => {
    test('annotation has type fixture-operation', async () => {
        await fc.assert(
            fc.property(arbOperation, arbSafeSql, arbRowCount, (operation, sql, rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                expect(testInfo.annotations).toHaveLength(1);
                expect(testInfo.annotations[0].type).toBe('fixture-operation');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains fixture: database', async () => {
        await fc.assert(
            fc.property(arbOperation, arbSafeSql, arbRowCount, (operation, sql, rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.fixture).toBe('database');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the correct operation type', async () => {
        await fc.assert(
            fc.property(arbOperation, arbSafeSql, arbRowCount, (operation, sql, rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.operation).toBe(operation);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains sql field truncated to 2048 chars if longer', async () => {
        await fc.assert(
            fc.property(arbOperation, arbSafeSql, arbRowCount, (operation, sql, rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);

                if (sql.length <= SQL_LIMIT) {
                    expect(metadata.sql).toBe(sql);
                } else {
                    expect(metadata.sql).toBe(sql.slice(0, SQL_LIMIT) + TRUNCATION_INDICATOR);
                    expect(metadata.sql.length).toBe(SQL_LIMIT + TRUNCATION_INDICATOR.length);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the exact rowCount', async () => {
        await fc.assert(
            fc.property(arbOperation, arbSafeSql, arbRowCount, (operation, sql, rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.rowCount).toBe(rowCount);
            }),
            { numRuns: 100 }
        );
    });

    test('SQL values with credentials are redacted', async () => {
        await fc.assert(
            fc.property(arbSqlWithCredentials, arbRowCount, ([sql, operation], rowCount) => {
                const testInfo = createMockTestInfo();
                recordDatabase(testInfo, operation, sql, rowCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                // The sql field should not contain the original secret values
                expect(metadata.sql).toContain('[REDACTED]');
                // The sql field should not contain the raw credential values
                expect(metadata.sql).not.toContain('secret123');
                expect(metadata.sql).not.toContain('mypass');
                expect(metadata.sql).not.toContain('abc123');
                expect(metadata.sql).not.toContain('sk_live_xyz');
            }),
            { numRuns: 100 }
        );
    });
});
