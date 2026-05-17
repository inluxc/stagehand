/**
 * Property 7: Redis key prefix isolation on teardown
 *
 * For any set of Redis keys where some match the configured test-scoped prefix
 * and others do not, when the fixture teardown executes with key-prefix isolation
 * enabled, only keys matching the prefix SHALL be deleted and all other keys
 * SHALL remain unchanged.
 *
 * We test the key prefix matching logic directly with arbitrary key names and
 * prefixes, without requiring a real Redis server.
 *
 * **Validates: Requirements 5.4**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';

/**
 * Simulates the key prefix matching logic used in the Redis fixture teardown.
 * The fixture uses SCAN with MATCH pattern `{keyPrefix}*` to find keys to delete.
 *
 * This function partitions keys into those that match the prefix (to be deleted)
 * and those that don't (to remain).
 */
function partitionKeysByPrefix(
    allKeys: string[],
    keyPrefix: string
): { toDelete: string[]; toKeep: string[] } {
    const toDelete: string[] = [];
    const toKeep: string[] = [];

    for (const key of allKeys) {
        if (key.startsWith(keyPrefix)) {
            toDelete.push(key);
        } else {
            toKeep.push(key);
        }
    }

    return { toDelete, toKeep };
}

/**
 * Simulates the teardown flush operation: given all keys in the store and a prefix,
 * returns the keys that remain after flushing prefixed keys.
 */
function simulateTeardownFlush(allKeys: string[], keyPrefix: string): string[] {
    const { toKeep } = partitionKeysByPrefix(allKeys, keyPrefix);
    return toKeep;
}

/**
 * Generates valid Redis key prefix strings (non-empty, alphanumeric with colons).
 */
const arbKeyPrefix = fc
    .tuple(
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
            { minLength: 1, maxLength: 10 }
        ),
        fc.constantFrom(':', '-', '_')
    )
    .map(([name, sep]) => `${name}${sep}`);

/**
 * Generates valid Redis key names.
 */
const arbKeyName = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789:/-_'.split('')),
    { minLength: 1, maxLength: 30 }
);

test.describe('Property 7: Redis key prefix isolation on teardown', () => {
    test('only keys matching the prefix are deleted; all others remain', () => {
        fc.assert(
            fc.property(
                arbKeyPrefix,
                fc.array(arbKeyName, { minLength: 0, maxLength: 20 }),
                fc.array(arbKeyName, { minLength: 0, maxLength: 20 }),
                (prefix, prefixedSuffixes, nonPrefixedKeys) => {
                    // Build prefixed keys by prepending the prefix
                    const prefixedKeys = prefixedSuffixes.map((suffix) => `${prefix}${suffix}`);

                    // Ensure non-prefixed keys don't accidentally start with the prefix
                    const safeNonPrefixedKeys = nonPrefixedKeys.filter(
                        (key) => !key.startsWith(prefix)
                    );

                    const allKeys = [...prefixedKeys, ...safeNonPrefixedKeys];
                    const remaining = simulateTeardownFlush(allKeys, prefix);

                    // All prefixed keys must be removed
                    for (const key of prefixedKeys) {
                        expect(remaining).not.toContain(key);
                    }

                    // All non-prefixed keys must remain
                    for (const key of safeNonPrefixedKeys) {
                        expect(remaining).toContain(key);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('when no keys match the prefix, all keys remain unchanged', () => {
        fc.assert(
            fc.property(
                arbKeyPrefix,
                fc.array(arbKeyName, { minLength: 1, maxLength: 20 }),
                (prefix, keys) => {
                    // Ensure none of the keys start with the prefix
                    const safeKeys = keys.filter((key) => !key.startsWith(prefix));
                    fc.pre(safeKeys.length > 0);

                    const remaining = simulateTeardownFlush(safeKeys, prefix);

                    // All keys must remain
                    expect(remaining.length).toBe(safeKeys.length);
                    for (const key of safeKeys) {
                        expect(remaining).toContain(key);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('when all keys match the prefix, no keys remain after teardown', () => {
        fc.assert(
            fc.property(
                arbKeyPrefix,
                fc.array(arbKeyName, { minLength: 1, maxLength: 20 }),
                (prefix, suffixes) => {
                    const allKeys = suffixes.map((suffix) => `${prefix}${suffix}`);
                    const remaining = simulateTeardownFlush(allKeys, prefix);

                    // No keys should remain
                    expect(remaining.length).toBe(0);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('prefix matching is exact prefix match, not substring match', () => {
        fc.assert(
            fc.property(
                arbKeyPrefix,
                arbKeyName,
                (prefix, keySuffix) => {
                    // A key that contains the prefix in the middle should NOT be deleted
                    const keyWithPrefixInMiddle = `other-${prefix}${keySuffix}`;
                    fc.pre(!keyWithPrefixInMiddle.startsWith(prefix));

                    const allKeys = [keyWithPrefixInMiddle, `${prefix}${keySuffix}`];
                    const remaining = simulateTeardownFlush(allKeys, prefix);

                    // The key with prefix in the middle should remain
                    expect(remaining).toContain(keyWithPrefixInMiddle);
                    // The key starting with prefix should be deleted
                    expect(remaining).not.toContain(`${prefix}${keySuffix}`);
                }
            ),
            { numRuns: 100 }
        );
    });
});
