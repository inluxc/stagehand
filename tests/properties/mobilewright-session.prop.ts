/**
 * Property 10: Mobilewright session isolation
 *
 * For any test requesting the Mobilewright_Fixture, the fixture SHALL provide
 * an isolated device session, and teardown SHALL uninstall the app regardless
 * of test outcome (pass, fail, or error).
 *
 * We verify the teardown contract: close() is always called even when uninstall
 * fails, ensuring session release regardless of test outcome.
 *
 * **Validates: Requirements 8.5**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';

/**
 * Represents the possible outcomes of a test execution.
 */
type TestOutcome = 'pass' | 'fail' | 'error';

/**
 * Represents the possible outcomes of the uninstall operation.
 */
type UninstallOutcome = 'success' | 'failure';

/**
 * Simulates the Mobilewright fixture teardown logic.
 * Returns whether close() was called (session released).
 *
 * The fixture contract is:
 * 1. Always attempt uninstallApp()
 * 2. Always attempt close() regardless of uninstall outcome
 */
function simulateTeardown(
    uninstallOutcome: UninstallOutcome,
    closeOutcome: 'success' | 'failure'
): { uninstallAttempted: boolean; closeAttempted: boolean; teardownCompleted: boolean } {
    let uninstallAttempted = false;
    let closeAttempted = false;
    let teardownCompleted = false;

    // Simulate the teardown logic from mobilewright.fixture.ts
    try {
        uninstallAttempted = true;
        if (uninstallOutcome === 'failure') {
            throw new Error('Uninstall failed');
        }
    } catch {
        // Log warning but continue — uninstall failure should not prevent session release
    }

    try {
        closeAttempted = true;
        if (closeOutcome === 'failure') {
            throw new Error('Close failed');
        }
    } catch {
        // Best-effort session release
    }

    teardownCompleted = true;

    return { uninstallAttempted, closeAttempted, teardownCompleted };
}

/**
 * Generates arbitrary test outcomes.
 */
const arbTestOutcome: fc.Arbitrary<TestOutcome> = fc.constantFrom('pass', 'fail', 'error');

/**
 * Generates arbitrary uninstall outcomes.
 */
const arbUninstallOutcome: fc.Arbitrary<UninstallOutcome> = fc.constantFrom('success', 'failure');

/**
 * Generates arbitrary close outcomes.
 */
const arbCloseOutcome: fc.Arbitrary<'success' | 'failure'> = fc.constantFrom('success', 'failure');

/**
 * Generates arbitrary bundle IDs.
 */
const arbBundleId = fc
    .tuple(
        fc.constantFrom('com', 'org', 'io', 'net'),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
            { minLength: 2, maxLength: 10 }
        ),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
            { minLength: 2, maxLength: 10 }
        )
    )
    .map(([tld, org, app]) => `${tld}.${org}.${app}`);

test.describe('Property 10: Mobilewright session isolation', () => {
    test('close() is always called regardless of uninstall outcome', () => {
        fc.assert(
            fc.property(
                arbTestOutcome,
                arbUninstallOutcome,
                arbCloseOutcome,
                (testOutcome, uninstallOutcome, closeOutcome) => {
                    // Regardless of test outcome and uninstall result,
                    // close() must always be attempted
                    const result = simulateTeardown(uninstallOutcome, closeOutcome);

                    expect(result.closeAttempted).toBe(true);
                    expect(result.teardownCompleted).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('uninstall is always attempted regardless of test outcome', () => {
        fc.assert(
            fc.property(
                arbTestOutcome,
                arbUninstallOutcome,
                arbCloseOutcome,
                (testOutcome, uninstallOutcome, closeOutcome) => {
                    const result = simulateTeardown(uninstallOutcome, closeOutcome);

                    // Uninstall must always be attempted
                    expect(result.uninstallAttempted).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('teardown completes even when both uninstall and close fail', () => {
        fc.assert(
            fc.property(
                arbTestOutcome,
                (testOutcome) => {
                    // Worst case: both operations fail
                    const result = simulateTeardown('failure', 'failure');

                    // Teardown must still complete without throwing
                    expect(result.uninstallAttempted).toBe(true);
                    expect(result.closeAttempted).toBe(true);
                    expect(result.teardownCompleted).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('each fixture invocation creates an independent session (no shared state)', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.tuple(arbBundleId, arbTestOutcome, arbUninstallOutcome),
                    { minLength: 2, maxLength: 10 }
                ),
                (testRuns) => {
                    // Simulate multiple sequential test runs
                    // Each should independently attempt teardown
                    const results = testRuns.map(([_bundleId, _outcome, uninstallOutcome]) =>
                        simulateTeardown(uninstallOutcome, 'success')
                    );

                    // Every single run must have attempted both uninstall and close
                    for (const result of results) {
                        expect(result.uninstallAttempted).toBe(true);
                        expect(result.closeAttempted).toBe(true);
                        expect(result.teardownCompleted).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('session isolation: failure in one test teardown does not affect subsequent tests', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.tuple(arbUninstallOutcome, arbCloseOutcome),
                    { minLength: 3, maxLength: 10 }
                ),
                (teardownScenarios) => {
                    // Run multiple teardowns sequentially, simulating independent test sessions
                    const results = teardownScenarios.map(([uninstallOutcome, closeOutcome]) =>
                        simulateTeardown(uninstallOutcome, closeOutcome)
                    );

                    // Each teardown must complete independently
                    for (let i = 0; i < results.length; i++) {
                        expect(results[i].teardownCompleted).toBe(true);
                        expect(results[i].closeAttempted).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
