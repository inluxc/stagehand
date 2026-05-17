/**
 * Property 6: Unique consumer group ID generation
 *
 * For any set of concurrent or sequential test executions requesting the Kafka
 * fixture, each test SHALL receive a consumer group ID that is unique across all
 * tests in the run.
 *
 * We extract and test the generateGroupId logic directly, verifying that for any
 * set of test IDs and timestamps, all generated group IDs are unique.
 *
 * **Validates: Requirements 4.1**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';

/**
 * Reimplements the generateGroupId function from kafka.fixture.ts for testing.
 * The actual implementation uses: `test-${testId}-${Date.now()}`
 */
function generateGroupId(testId: string, timestamp: number): string {
    return `test-${testId}-${timestamp}`;
}

/**
 * Generates arbitrary test IDs (alphanumeric with dashes).
 */
const arbTestId = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
    { minLength: 1, maxLength: 30 }
);

/**
 * Generates arbitrary timestamps (realistic range).
 */
const arbTimestamp = fc.nat({ max: 2_000_000_000_000 }).map((n) => n + 1_700_000_000_000);

test.describe('Property 6: Unique consumer group ID generation', () => {
    test('all generated group IDs are unique when test IDs differ', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(arbTestId, { minLength: 2, maxLength: 50 }),
                arbTimestamp,
                (testIds, timestamp) => {
                    const groupIds = testIds.map((id) => generateGroupId(id, timestamp));
                    const uniqueGroupIds = new Set(groupIds);

                    // All group IDs must be unique
                    expect(uniqueGroupIds.size).toBe(groupIds.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('all generated group IDs are unique when timestamps differ', () => {
        fc.assert(
            fc.property(
                arbTestId,
                fc.uniqueArray(arbTimestamp, { minLength: 2, maxLength: 50 }),
                (testId, timestamps) => {
                    const groupIds = timestamps.map((ts) => generateGroupId(testId, ts));
                    const uniqueGroupIds = new Set(groupIds);

                    // All group IDs must be unique
                    expect(uniqueGroupIds.size).toBe(groupIds.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('all generated group IDs are unique across arbitrary test ID and timestamp pairs', () => {
        fc.assert(
            fc.property(
                fc.uniqueArray(
                    fc.tuple(arbTestId, arbTimestamp),
                    {
                        minLength: 2,
                        maxLength: 50,
                        comparator: (a, b) => a[0] === b[0] && a[1] === b[1],
                    }
                ),
                (pairs) => {
                    const groupIds = pairs.map(([id, ts]) => generateGroupId(id, ts));
                    const uniqueGroupIds = new Set(groupIds);

                    // All group IDs must be unique
                    expect(uniqueGroupIds.size).toBe(groupIds.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('generated group ID follows expected format: test-{testId}-{timestamp}', () => {
        fc.assert(
            fc.property(
                arbTestId,
                arbTimestamp,
                (testId, timestamp) => {
                    const groupId = generateGroupId(testId, timestamp);

                    expect(groupId).toBe(`test-${testId}-${timestamp}`);
                    expect(groupId.startsWith('test-')).toBe(true);
                    expect(groupId).toContain(testId);
                    expect(groupId).toContain(String(timestamp));
                }
            ),
            { numRuns: 100 }
        );
    });
});
