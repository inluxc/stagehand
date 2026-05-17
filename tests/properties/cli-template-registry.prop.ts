/**
 * Property 4: Init scaffolding produces a fixture registry consistent with selection
 *
 * For any non-empty subset of supported fixtures, the generated src/fixtures/index.ts
 * imports exactly the selected fixtures' modules and spreads exactly their exported
 * fixture objects (including internal dependencies like redisConfig) into the composed
 * allFixtures object.
 *
 * **Validates: Requirements 1.7, 1.8, 3.1, 3.2**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { generateFixtureRegistry } from '../../src/cli/templates/index';
import { FIXTURE_METADATA, type FixtureMetadata } from '../../src/cli/fixtures-metadata';

/**
 * All supported fixture names.
 */
const ALL_FIXTURE_NAMES = Object.keys(FIXTURE_METADATA);

/**
 * Generates a random non-empty subset of supported fixture names.
 */
const arbNonEmptyFixtureSubset = fc
    .subarray(ALL_FIXTURE_NAMES, { minLength: 1, maxLength: ALL_FIXTURE_NAMES.length })
    .map((names) => names.map((name) => FIXTURE_METADATA[name]));

test.describe('Feature: cli-init-and-add, Property 4: Init scaffolding produces a fixture registry consistent with selection', {
    tag: ['@property'],
}, () => {
    test('generated registry contains an import statement for each selected fixture', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateFixtureRegistry(selectedMetadata);

                    for (const fixture of selectedMetadata) {
                        expect(output).toContain(
                            `import { ${fixture.exportedObject} } from '${fixture.importPath}';`,
                        );
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    test('generated registry contains a spread for each selected fixture exportedObject', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateFixtureRegistry(selectedMetadata);

                    for (const fixture of selectedMetadata) {
                        expect(output).toContain(`...${fixture.exportedObject},`);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    test('if redis is selected, the output contains redisConfig internal dependency', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset.filter((fixtures) =>
                    fixtures.some((f) => f.name === 'redis'),
                ),
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateFixtureRegistry(selectedMetadata);

                    // Redis has an internalDependency named 'redisConfig'
                    expect(output).toContain('redisConfig');
                    expect(output).toContain('...redisConfig,');
                },
            ),
            { numRuns: 100 },
        );
    });

    test('generated registry contains CLI:IMPORTS and CLI:FIXTURES markers', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateFixtureRegistry(selectedMetadata);

                    expect(output).toContain('// CLI:IMPORTS');
                    expect(output).toContain('// CLI:FIXTURES');
                },
            ),
            { numRuns: 100 },
        );
    });
});
