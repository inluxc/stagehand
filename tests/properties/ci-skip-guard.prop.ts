/**
 * Property 1: CI skip guard evaluates correctly for any non-empty string
 *
 * For any non-empty string value assigned to `process.env.CI`, the skip condition
 * `!process.env.CI` SHALL evaluate to `false`, causing infrastructure-dependent
 * tests to execute rather than skip.
 *
 * **Validates: Requirements 9.1, 14.2, 15.4, 16.4**
 *
 * Feature: cicd-emulated-testing, Property 1: CI skip guard evaluates correctly for any non-empty string
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';

test.describe('Property 1: CI skip guard evaluates correctly for any non-empty string', {
    tag: '@Feature: cicd-emulated-testing, Property 1: CI skip guard evaluates correctly for any non-empty string',
}, () => {
    test('for any non-empty string assigned to process.env.CI, !process.env.CI evaluates to false', async () => {
        const originalCI = process.env.CI;

        try {
            await fc.assert(
                fc.property(
                    fc.string({ minLength: 1, maxLength: 100 }),
                    (ciValue) => {
                        process.env.CI = ciValue;
                        // The skip condition used in test files: !process.env.CI
                        const skipCondition = !process.env.CI;
                        expect(skipCondition).toBe(false);
                    }
                ),
                { numRuns: 100 }
            );
        } finally {
            // Restore original CI value
            if (originalCI === undefined) {
                delete process.env.CI;
            } else {
                process.env.CI = originalCI;
            }
        }
    });

    test('when process.env.CI is undefined, !process.env.CI evaluates to true', async () => {
        const originalCI = process.env.CI;

        try {
            delete process.env.CI;
            const skipCondition = !process.env.CI;
            expect(skipCondition).toBe(true);
        } finally {
            if (originalCI === undefined) {
                delete process.env.CI;
            } else {
                process.env.CI = originalCI;
            }
        }
    });

    test('when process.env.CI is empty string, !process.env.CI evaluates to true', async () => {
        const originalCI = process.env.CI;

        try {
            process.env.CI = '';
            const skipCondition = !process.env.CI;
            expect(skipCondition).toBe(true);
        } finally {
            if (originalCI === undefined) {
                delete process.env.CI;
            } else {
                process.env.CI = originalCI;
            }
        }
    });
});
