/**
 * Property 1: Init scaffolding produces dependencies consistent with fixture selection
 *
 * For any non-empty subset of supported fixtures, the generated package.json SHALL
 * contain exactly the union of npm dependencies defined in the fixture metadata for
 * the selected fixtures — no more, no less (excluding framework base dependencies
 * like @playwright/test, dotenv, and fast-check).
 *
 * **Validates: Requirements 1.2, 3.3, 3.4**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { generatePackageJson } from '../../src/cli/templates/index';
import { FIXTURE_METADATA, type FixtureMetadata } from '../../src/cli/fixtures-metadata';

const ALL_FIXTURE_NAMES = Object.keys(FIXTURE_METADATA);

/** Base dependencies that are always present regardless of fixture selection */
const BASE_DEPENDENCIES: Record<string, string> = {
    '@playwright/test': '^1.52.0',
    dotenv: '^16.4.5',
    'fast-check': '^3.22.0',
};

/**
 * Generates a random non-empty subset of the 5 supported fixture names.
 */
const arbFixtureSubset = fc
    .subarray([...ALL_FIXTURE_NAMES], { minLength: 1 })
    .map((subset) => [...new Set(subset)]);

test.describe('Feature: cli-init-and-add, Property 1: Init scaffolding produces dependencies consistent with fixture selection', () => {
    test('generated package.json contains exactly the union of selected fixture dependencies plus base dependencies', async () => {
        await fc.assert(
            fc.asyncProperty(arbFixtureSubset, async (selectedFixtureNames) => {
                // Get the FixtureMetadata for each selected fixture
                const selectedMetadata: FixtureMetadata[] = selectedFixtureNames.map(
                    (name) => FIXTURE_METADATA[name]
                );

                // Call generatePackageJson with the selected metadata
                const result = generatePackageJson(selectedMetadata);

                // Parse the result as JSON
                const pkg = JSON.parse(result);

                // Compute the expected dependencies: base + union of all selected fixtures' deps
                const expectedDeps: Record<string, string> = { ...BASE_DEPENDENCIES };
                for (const fixture of selectedMetadata) {
                    for (const [dep, version] of Object.entries(fixture.dependencies)) {
                        expectedDeps[dep] = version;
                    }
                }

                // Verify the dependencies section contains exactly the expected set
                expect(pkg.dependencies).toBeDefined();
                expect(pkg.dependencies).toEqual(expectedDeps);

                // Verify no extra fixture dependencies are present beyond what's expected
                const actualDepNames = Object.keys(pkg.dependencies).sort();
                const expectedDepNames = Object.keys(expectedDeps).sort();
                expect(actualDepNames).toEqual(expectedDepNames);
            }),
            { numRuns: 100 }
        );
    });

    test('generated package.json never includes dependencies from unselected fixtures', async () => {
        await fc.assert(
            fc.asyncProperty(arbFixtureSubset, async (selectedFixtureNames) => {
                const selectedMetadata: FixtureMetadata[] = selectedFixtureNames.map(
                    (name) => FIXTURE_METADATA[name]
                );

                const result = generatePackageJson(selectedMetadata);
                const pkg = JSON.parse(result);

                // Collect dependencies from unselected fixtures
                const unselectedNames = ALL_FIXTURE_NAMES.filter(
                    (name) => !selectedFixtureNames.includes(name)
                );

                for (const unselectedName of unselectedNames) {
                    const unselectedFixture = FIXTURE_METADATA[unselectedName];
                    for (const dep of Object.keys(unselectedFixture.dependencies)) {
                        // A dependency from an unselected fixture should NOT be present
                        // unless it also happens to be a dependency of a selected fixture
                        const isAlsoSelectedDep = selectedMetadata.some(
                            (selected) => dep in selected.dependencies
                        );
                        if (!isAlsoSelectedDep) {
                            expect(pkg.dependencies[dep]).toBeUndefined();
                        }
                    }
                }
            }),
            { numRuns: 100 }
        );
    });
});
