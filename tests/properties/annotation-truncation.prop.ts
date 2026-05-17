/**
 * Property 2: Annotation value truncation preserves prefix and appends indicator
 *
 * For any string value and any positive truncation limit, if the string length
 * exceeds the limit, the truncated output SHALL have length equal to
 * `limit + "[truncated]".length`, SHALL start with the first `limit` characters
 * of the original string, and SHALL end with the `[truncated]` indicator.
 * If the string length does not exceed the limit, the output SHALL equal the
 * original string unchanged.
 *
 * **Validates: Requirements 12.7**
 *
 * Feature: cicd-emulated-testing, Property 2: Annotation value truncation preserves prefix and appends indicator
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { truncate } from '../../src/annotations/truncation';

const TRUNCATION_INDICATOR = '[truncated]';

test.describe('Property 2: Annotation value truncation preserves prefix and appends indicator', {
    tag: '@Feature: cicd-emulated-testing, Property 2: Annotation value truncation preserves prefix and appends indicator',
}, () => {
    test('when string length > limit: output length === limit + indicator length', async () => {
        await fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.integer({ min: 1 }),
                (value, limit) => {
                    fc.pre(value.length > limit);
                    const result = truncate(value, limit);
                    expect(result.length).toBe(limit + TRUNCATION_INDICATOR.length);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('when string length > limit: output starts with first `limit` characters of original', async () => {
        await fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.integer({ min: 1 }),
                (value, limit) => {
                    fc.pre(value.length > limit);
                    const result = truncate(value, limit);
                    expect(result.startsWith(value.slice(0, limit))).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('when string length > limit: output ends with [truncated]', async () => {
        await fc.assert(
            fc.property(
                fc.string({ minLength: 1 }),
                fc.integer({ min: 1 }),
                (value, limit) => {
                    fc.pre(value.length > limit);
                    const result = truncate(value, limit);
                    expect(result.endsWith(TRUNCATION_INDICATOR)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('when string length <= limit: output === original string unchanged', async () => {
        await fc.assert(
            fc.property(
                fc.string(),
                fc.integer({ min: 1 }),
                (value, limit) => {
                    fc.pre(value.length <= limit);
                    const result = truncate(value, limit);
                    expect(result).toBe(value);
                }
            ),
            { numRuns: 100 }
        );
    });
});
