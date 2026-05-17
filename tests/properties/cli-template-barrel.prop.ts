/**
 * Property 5: Init scaffolding produces a barrel file consistent with selection
 *
 * For any non-empty subset of supported fixtures, the generated src/index.ts
 * re-exports exactly the selected modules — no more, no less — plus the
 * config and errors modules.
 *
 * **Validates: Requirements 1.11**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { generateBarrelFile } from '../../src/cli/templates/index';
import { FIXTURE_METADATA, type FixtureMetadata } from '../../src/cli/fixtures-metadata';

const ALL_FIXTURE_NAMES = Object.keys(FIXTURE_METADATA);

/**
 * Generates a random non-empty subset of supported fixture names.
 */
const arbNonEmptyFixtureSubset = fc
    .subarray(ALL_FIXTURE_NAMES, { minLength: 1, maxLength: ALL_FIXTURE_NAMES.length })
    .map((names) => names.map((name) => FIXTURE_METADATA[name]));

test.describe('Feature: cli-init-and-add, Property 5: Init scaffolding produces a barrel file consistent with selection', {
    tag: ['@property'],
}, () => {
    test('barrel file contains a re-export for each selected fixture', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateBarrelFile(selectedMetadata);

                    // Each selected fixture should have a re-export line
                    for (const fixture of selectedMetadata) {
                        const expectedExport = `export * from './fixtures/${fixture.name}.fixture';`;
                        expect(output).toContain(expectedExport);
                    }
                },
            ),
            { numRuns: 100 },
        );
    });

    test('barrel file contains re-exports for config and errors modules', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateBarrelFile(selectedMetadata);

                    // Config module re-export
                    expect(output).toContain("export * from './config';");

                    // Errors module re-export
                    expect(output).toContain("export * from './errors';");
                },
            ),
            { numRuns: 100 },
        );
    });

    test('barrel file does NOT contain re-exports for unselected fixtures', () => {
        fc.assert(
            fc.property(
                arbNonEmptyFixtureSubset,
                (selectedMetadata: FixtureMetadata[]) => {
                    const output = generateBarrelFile(selectedMetadata);
                    const selectedNames = new Set(selectedMetadata.map((f) => f.name));

                    // Unselected fixtures should NOT appear in the barrel file
                    for (const name of ALL_FIXTURE_NAMES) {
                        if (!selectedNames.has(name)) {
                            const unexpectedExport = `export * from './fixtures/${name}.fixture';`;
                            expect(output).not.toContain(unexpectedExport);
                        }
                    }
                },
            ),
            { numRuns: 100 },
        );
    });
});
