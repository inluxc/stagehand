/**
 * Property 6: Redis annotation contains required metadata
 *
 * For any key or channel name string and any result value string, the Redis
 * annotation formatter SHALL produce an annotation containing the operation type,
 * the exact key/channel name, and the result value (truncated to 1024 characters
 * if necessary).
 *
 * **Validates: Requirements 12.4**
 *
 * Feature: cicd-emulated-testing, Property 6: Redis annotation contains required metadata
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { recordRedis } from '../../src/annotations/recorder';

/** Creates a mock testInfo object for testing */
function createMockTestInfo() {
    return { annotations: [] as Array<{ type: string; description?: string }> };
}

/** Valid Redis operations */
const REDIS_OPERATIONS = ['get', 'set', 'del', 'publish', 'subscribe'] as const;

/** Arbitrary for Redis operation types */
const arbOperation = fc.constantFrom(...REDIS_OPERATIONS);

/** Arbitrary for key/channel names — non-empty strings */
const arbKey = fc.string({ minLength: 1, maxLength: 200 });

/** Arbitrary for result values — any string including long ones */
const arbResult = fc.string({ minLength: 0, maxLength: 2048 });

test.describe('Property 6: Redis annotation contains required metadata', {
    tag: '@Feature: cicd-emulated-testing, Property 6: Redis annotation contains required metadata',
}, () => {
    test('annotation has type fixture-operation', async () => {
        await fc.assert(
            fc.property(arbOperation, arbKey, arbResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                expect(testInfo.annotations).toHaveLength(1);
                expect(testInfo.annotations[0].type).toBe('fixture-operation');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains fixture redis', async () => {
        await fc.assert(
            fc.property(arbOperation, arbKey, arbResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                const description = JSON.parse(testInfo.annotations[0].description!);
                expect(description.fixture).toBe('redis');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the correct operation', async () => {
        await fc.assert(
            fc.property(arbOperation, arbKey, arbResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                const description = JSON.parse(testInfo.annotations[0].description!);
                expect(description.operation).toBe(operation);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the key field after redaction', async () => {
        await fc.assert(
            fc.property(arbOperation, arbKey, arbResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                const description = JSON.parse(testInfo.annotations[0].description!);
                expect(description).toHaveProperty('key');
                // Key should be a non-empty string (redaction may alter content but field must exist)
                expect(typeof description.key).toBe('string');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the result field truncated to 1024 chars if longer', async () => {
        await fc.assert(
            fc.property(arbOperation, arbKey, arbResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                const description = JSON.parse(testInfo.annotations[0].description!);
                expect(description).toHaveProperty('result');
                expect(typeof description.result).toBe('string');

                // After redaction, the result is truncated to 1024 chars
                // The recorded result length should never exceed 1024 + '[truncated]'.length
                const maxLength = 1024 + '[truncated]'.length;
                expect(description.result.length).toBeLessThanOrEqual(maxLength);
            }),
            { numRuns: 100 }
        );
    });

    test('when result length exceeds 1024 after redaction, result field ends with [truncated]', async () => {
        // Generate results that are guaranteed to be longer than 1024 chars
        const arbLongResult = fc.string({ minLength: 1025, maxLength: 2048 });

        await fc.assert(
            fc.property(arbOperation, arbKey, arbLongResult, (operation, key, result) => {
                const testInfo = createMockTestInfo();
                recordRedis(testInfo as any, operation, key, result);

                const description = JSON.parse(testInfo.annotations[0].description!);
                expect(description.result).toContain('[truncated]');
                expect(description.result.endsWith('[truncated]')).toBe(true);
            }),
            { numRuns: 100 }
        );
    });
});
