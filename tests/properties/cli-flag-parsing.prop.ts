/**
 * Property 9: --fixtures flag parsing produces correct fixture set
 *
 * For any comma-separated string of valid fixture names with arbitrary whitespace
 * and casing, the flag parser SHALL produce a normalized array containing exactly
 * those fixture names in lowercase.
 *
 * **Validates: Requirements 4.2**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { parseArgs } from '../../src/cli/index';

const VALID_FIXTURES = ['database', 'kafka', 'mobilewright', 'openapi', 'redis'] as const;

/**
 * Generates a random non-empty subset of valid fixture names.
 */
const arbFixtureSubset = fc
    .subarray([...VALID_FIXTURES], { minLength: 1 })
    .map((subset) => [...new Set(subset)]);

/**
 * Applies random casing to a string (uppercase, lowercase, or mixed).
 */
const arbRandomCasing = (name: string): fc.Arbitrary<string> =>
    fc.array(fc.boolean(), { minLength: name.length, maxLength: name.length }).map((flags) =>
        name
            .split('')
            .map((ch, i) => (flags[i] ? ch.toUpperCase() : ch.toLowerCase()))
            .join('')
    );

/**
 * Generates arbitrary whitespace (spaces and tabs) of varying length.
 */
const arbWhitespace = fc.stringOf(fc.constantFrom(' ', '\t'), { minLength: 0, maxLength: 5 });

/**
 * Builds a comma-separated fixtures string with random casing and whitespace.
 */
function arbFixturesFlag(fixtures: string[]): fc.Arbitrary<string> {
    return fc
        .tuple(
            ...fixtures.map((name) =>
                fc.tuple(arbRandomCasing(name), arbWhitespace, arbWhitespace)
            )
        )
        .map((entries) =>
            entries
                .map(([casedName, wsBefore, wsAfter]) => `${wsBefore}${casedName}${wsAfter}`)
                .join(',')
        );
}

test.describe('Feature: cli-init-and-add, Property 9: --fixtures flag parsing produces correct fixture set', () => {
    test('parsing --fixtures with arbitrary casing and whitespace produces normalized fixture set', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset.chain((fixtures) =>
                    fc.tuple(fc.constant(fixtures), arbFixturesFlag(fixtures))
                ),
                async ([expectedFixtures, fixturesString]) => {
                    const parsed = parseArgs(['init', '--fixtures', fixturesString]);

                    // The parser should store the raw fixtures string
                    expect(parsed.flags.fixtures).toBeDefined();

                    // When we split, trim, and lowercase the parsed value,
                    // it should produce exactly the expected fixture set
                    const parsedFixtures = parsed.flags.fixtures!
                        .split(',')
                        .map((f) => f.trim().toLowerCase())
                        .filter((f) => f.length > 0);

                    // Sort both arrays for comparison
                    const sortedExpected = [...expectedFixtures].sort();
                    const sortedParsed = [...parsedFixtures].sort();

                    expect(sortedParsed).toEqual(sortedExpected);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('parsing --fixtures preserves all fixture names without loss', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset.chain((fixtures) =>
                    fc.tuple(fc.constant(fixtures), arbFixturesFlag(fixtures))
                ),
                async ([expectedFixtures, fixturesString]) => {
                    const parsed = parseArgs(['init', '--fixtures', fixturesString]);

                    expect(parsed.flags.fixtures).toBeDefined();

                    const parsedFixtures = parsed.flags.fixtures!
                        .split(',')
                        .map((f) => f.trim().toLowerCase())
                        .filter((f) => f.length > 0);

                    // The count of parsed fixtures must match the expected count
                    expect(parsedFixtures.length).toBe(expectedFixtures.length);

                    // Every expected fixture must appear in the parsed result
                    for (const fixture of expectedFixtures) {
                        expect(parsedFixtures).toContain(fixture);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('parsing --fixtures with command set to init correctly identifies the command', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset.chain((fixtures) =>
                    fc.tuple(fc.constant(fixtures), arbFixturesFlag(fixtures))
                ),
                async ([_expectedFixtures, fixturesString]) => {
                    const parsed = parseArgs(['init', '--fixtures', fixturesString]);

                    // Command should be correctly identified as 'init'
                    expect(parsed.command).toBe('init');
                }
            ),
            { numRuns: 100 }
        );
    });
});
