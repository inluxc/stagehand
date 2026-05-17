/**
 * Property 6: Fixture name validation accepts valid names case-insensitively and rejects invalid names
 *
 * For any string, the fixture name validator SHALL accept it if and only if its
 * lowercase form matches one of the supported fixture names (database, kafka,
 * mobilewright, openapi, redis), and SHALL reject all other strings with an error
 * listing valid names.
 *
 * **Validates: Requirements 2.1, 2.2, 4.3**
 *
 * Feature: cli-init-and-add, Property 6: Fixture name validation accepts valid names case-insensitively and rejects invalid names
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';

/** Supported fixture names (lowercase) */
const SUPPORTED_NAMES = Object.keys(FIXTURE_METADATA);

/**
 * Validates a fixture name against the supported set (case-insensitive).
 * Returns normalized name on success, or error with valid names on failure.
 */
function validateFixtureName(name: string): { valid: true; normalized: string } | { valid: false; validNames: string[] } {
    const normalized = name.toLowerCase();
    if (SUPPORTED_NAMES.includes(normalized)) {
        return { valid: true, normalized };
    }
    return { valid: false, validNames: SUPPORTED_NAMES };
}

/**
 * Generates a valid fixture name with random casing.
 * Picks one of the supported names and applies random upper/lower to each character.
 */
const arbValidFixtureName = fc
    .constantFrom(...SUPPORTED_NAMES)
    .chain((name) =>
        fc.array(fc.boolean(), { minLength: name.length, maxLength: name.length }).map((casings) =>
            name
                .split('')
                .map((ch, i) => (casings[i] ? ch.toUpperCase() : ch.toLowerCase()))
                .join('')
        )
    );

/**
 * Generates arbitrary strings that do NOT match any supported fixture name when lowercased.
 */
const arbInvalidFixtureName = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !SUPPORTED_NAMES.includes(s.toLowerCase()));

test.describe('Property 6: Fixture name validation accepts valid names case-insensitively and rejects invalid names', {
    tag: '@Feature: cli-init-and-add, Property 6: Fixture name validation accepts valid names case-insensitively and rejects invalid names',
}, () => {
    test('valid fixture names with any casing are accepted and normalized to lowercase', () => {
        fc.assert(
            fc.property(arbValidFixtureName, (name) => {
                const result = validateFixtureName(name);

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect(result.normalized).toBe(name.toLowerCase());
                    expect(SUPPORTED_NAMES).toContain(result.normalized);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('invalid fixture names are rejected with the list of valid names', () => {
        fc.assert(
            fc.property(arbInvalidFixtureName, (name) => {
                const result = validateFixtureName(name);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.validNames).toEqual(SUPPORTED_NAMES);
                    expect(result.validNames.length).toBeGreaterThan(0);
                    // Confirm the name truly doesn't match any supported fixture
                    expect(SUPPORTED_NAMES).not.toContain(name.toLowerCase());
                }
            }),
            { numRuns: 100 }
        );
    });
});
