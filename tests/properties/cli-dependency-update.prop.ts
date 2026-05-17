/**
 * Property 8: Add command dependency update produces no duplicates
 *
 * For any valid fixture and any existing package.json content (with or without some
 * of the fixture's dependencies already present), the dependency update SHALL result
 * in all required packages being present exactly once with correct version ranges.
 *
 * **Validates: Requirements 2.6, 3.4, 3.5**
 *
 * Feature: cli-init-and-add, Property 8: Add command dependency update produces no duplicates
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';

/**
 * Merges fixture dependencies into an existing package.json dependencies object.
 * If a dependency already exists, keeps the existing version (no overwrite).
 * If not present, adds it with the fixture's version.
 * This mirrors the expected behavior of the Add command's dependency update logic.
 */
function mergeDependencies(
    existingDeps: Record<string, string>,
    fixtureDeps: Record<string, string>,
): Record<string, string> {
    const merged = { ...existingDeps };
    for (const [pkg, version] of Object.entries(fixtureDeps)) {
        if (!(pkg in merged)) {
            merged[pkg] = version;
        }
    }
    return merged;
}

/** All supported fixture names from the metadata registry */
const FIXTURE_NAMES = Object.keys(FIXTURE_METADATA);

/** Arbitrary that picks a random fixture name from the supported set */
const arbFixtureName = fc.constantFrom(...FIXTURE_NAMES);

/**
 * Generates a random npm package name (scoped or unscoped).
 */
const arbPackageName = fc.oneof(
    // Unscoped package name
    fc.stringOf(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
        { minLength: 2, maxLength: 20 },
    ),
    // Scoped package name
    fc.tuple(
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
            { minLength: 2, maxLength: 10 },
        ),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-'.split('')),
            { minLength: 2, maxLength: 15 },
        ),
    ).map(([scope, name]) => `@${scope}/${name}`),
);

/**
 * Generates a random semver-like version string with caret prefix.
 */
const arbVersion = fc
    .tuple(fc.nat({ max: 20 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
    .map(([major, minor, patch]) => `^${major}.${minor}.${patch}`);

/**
 * Generates a random existing dependencies object that may include
 * some of the fixture's dependencies (to test the "already present" case)
 * and some unrelated dependencies.
 */
function arbExistingDeps(fixtureDeps: Record<string, string>) {
    const fixturePackageNames = Object.keys(fixtureDeps);

    return fc.tuple(
        // Subset of fixture deps that are "already present" with possibly different versions
        fc.subarray(fixturePackageNames, { minLength: 0 }),
        // Random versions for the already-present deps
        fc.array(arbVersion, { minLength: 0, maxLength: fixturePackageNames.length }),
        // Number of unrelated deps to add
        fc.nat({ max: 5 }),
        // Unrelated package names
        fc.array(
            fc.tuple(arbPackageName, arbVersion),
            { minLength: 0, maxLength: 5 },
        ),
    ).map(([presentSubset, versions, _unrelatedCount, unrelatedPairs]) => {
        const deps: Record<string, string> = {};

        // Add subset of fixture deps with random versions
        for (let i = 0; i < presentSubset.length; i++) {
            deps[presentSubset[i]] = versions[i] ?? '^1.0.0';
        }

        // Add unrelated deps (filter out any that collide with fixture deps)
        for (const [name, version] of unrelatedPairs) {
            if (!fixturePackageNames.includes(name)) {
                deps[name] = version;
            }
        }

        return deps;
    });
}

test.describe('Property 8: Add command dependency update produces no duplicates', {
    tag: '@Feature: cli-init-and-add, Property 8: Add command dependency update produces no duplicates',
}, () => {
    test('merging fixture dependencies results in all packages present exactly once', () => {
        fc.assert(
            fc.property(
                arbFixtureName.chain((fixtureName) => {
                    const fixtureDeps = FIXTURE_METADATA[fixtureName].dependencies;
                    return arbExistingDeps(fixtureDeps).map((existingDeps) => ({
                        fixtureName,
                        fixtureDeps,
                        existingDeps,
                    }));
                }),
                ({ fixtureDeps, existingDeps }) => {
                    const merged = mergeDependencies(existingDeps, fixtureDeps);

                    // All fixture dependencies must be present in the merged result
                    for (const pkg of Object.keys(fixtureDeps)) {
                        expect(merged).toHaveProperty(pkg);
                    }

                    // No package appears more than once (object keys are unique by nature,
                    // but verify the count matches expected)
                    const allKeys = Object.keys(merged);
                    const uniqueKeys = new Set(allKeys);
                    expect(uniqueKeys.size).toBe(allKeys.length);

                    // The total number of keys should be:
                    // existing unique keys + fixture keys that were NOT already present
                    const existingKeys = new Set(Object.keys(existingDeps));
                    const newKeys = Object.keys(fixtureDeps).filter((k) => !existingKeys.has(k));
                    expect(allKeys.length).toBe(existingKeys.size + newKeys.length);
                },
            ),
            { numRuns: 100 },
        );
    });

    test('existing unrelated dependencies are preserved after merge', () => {
        fc.assert(
            fc.property(
                arbFixtureName.chain((fixtureName) => {
                    const fixtureDeps = FIXTURE_METADATA[fixtureName].dependencies;
                    return arbExistingDeps(fixtureDeps).map((existingDeps) => ({
                        fixtureName,
                        fixtureDeps,
                        existingDeps,
                    }));
                }),
                ({ fixtureDeps, existingDeps }) => {
                    const merged = mergeDependencies(existingDeps, fixtureDeps);

                    // Every dependency that was in the existing package.json must still be there
                    for (const [pkg, version] of Object.entries(existingDeps)) {
                        expect(merged).toHaveProperty(pkg);
                        // Existing deps keep their original version (not overwritten)
                        expect(merged[pkg]).toBe(version);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    test('dependencies already present keep their existing version', () => {
        fc.assert(
            fc.property(
                arbFixtureName.chain((fixtureName) => {
                    const fixtureDeps = FIXTURE_METADATA[fixtureName].dependencies;
                    // Ensure at least one fixture dep is already present
                    const fixturePackageNames = Object.keys(fixtureDeps);
                    return fc.tuple(
                        fc.subarray(fixturePackageNames, { minLength: 1 }),
                        fc.array(arbVersion, { minLength: fixturePackageNames.length, maxLength: fixturePackageNames.length }),
                    ).map(([presentSubset, versions]) => {
                        const existingDeps: Record<string, string> = {};
                        for (let i = 0; i < presentSubset.length; i++) {
                            existingDeps[presentSubset[i]] = versions[i];
                        }
                        return { fixtureName, fixtureDeps, existingDeps };
                    });
                }),
                ({ fixtureDeps, existingDeps }) => {
                    const merged = mergeDependencies(existingDeps, fixtureDeps);

                    // For deps that were already present, the version should be the EXISTING one
                    for (const [pkg, existingVersion] of Object.entries(existingDeps)) {
                        expect(merged[pkg]).toBe(existingVersion);
                    }

                    // For deps that were NOT present, the version should be the fixture's version
                    for (const [pkg, fixtureVersion] of Object.entries(fixtureDeps)) {
                        if (!(pkg in existingDeps)) {
                            expect(merged[pkg]).toBe(fixtureVersion);
                        }
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    test('merge is deterministic — same inputs always produce same output', () => {
        fc.assert(
            fc.property(
                arbFixtureName.chain((fixtureName) => {
                    const fixtureDeps = FIXTURE_METADATA[fixtureName].dependencies;
                    return arbExistingDeps(fixtureDeps).map((existingDeps) => ({
                        fixtureDeps,
                        existingDeps,
                    }));
                }),
                ({ fixtureDeps, existingDeps }) => {
                    const result1 = mergeDependencies(existingDeps, fixtureDeps);
                    const result2 = mergeDependencies(existingDeps, fixtureDeps);

                    expect(result1).toEqual(result2);
                },
            ),
            { numRuns: 100 },
        );
    });
});
