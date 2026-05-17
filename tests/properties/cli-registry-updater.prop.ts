/**
 * Property 7: Add command registry update is idempotent
 *
 * For any valid fixture and any existing registry content, applying the registry
 * update when the fixture is already registered SHALL produce the same registry
 * content (no duplicates, no modifications).
 *
 * **Validates: Requirements 2.5, 2.10, 3.5**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { RegistryUpdater } from '../../src/cli/registry-updater';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';

/**
 * Generates a random fixture name from the supported set.
 */
const arbFixtureName = fc.constantFrom('database', 'kafka', 'mobilewright', 'openapi', 'redis');

/**
 * Base registry content template with CLI markers.
 * This simulates the structure of a generated `src/fixtures/index.ts` file.
 */
function createBaseRegistryContent(): string {
    return [
        "import { test as base } from '@playwright/test';",
        '// CLI:IMPORTS',
        '',
        'const allFixtures = {',
        '    // CLI:FIXTURES',
        '};',
        '',
        'export const test = base.extend(allFixtures);',
    ].join('\n');
}

test.describe('Feature: cli-init-and-add, Property 7: Add command registry update is idempotent', {
    tag: ['@property'],
}, () => {
    test('applying addFixture twice produces identical content (idempotent)', () => {
        const updater = new RegistryUpdater();

        fc.assert(
            fc.property(
                arbFixtureName,
                (fixtureName) => {
                    const fixture = FIXTURE_METADATA[fixtureName];
                    const baseContent = createBaseRegistryContent();

                    // First application — adds the fixture
                    const afterFirstAdd = updater.addFixture(baseContent, fixture);

                    // Second application — should produce identical content
                    const afterSecondAdd = updater.addFixture(afterFirstAdd, fixture);

                    // Idempotence: second application produces same result as first
                    expect(afterSecondAdd).toBe(afterFirstAdd);
                },
            ),
            { numRuns: 100 },
        );
    });

    test('after adding a fixture, isRegistered returns true', () => {
        const updater = new RegistryUpdater();

        fc.assert(
            fc.property(
                arbFixtureName,
                (fixtureName) => {
                    const fixture = FIXTURE_METADATA[fixtureName];
                    const baseContent = createBaseRegistryContent();

                    // Add the fixture
                    const updatedContent = updater.addFixture(baseContent, fixture);

                    // isRegistered should return true for the added fixture
                    expect(updater.isRegistered(updatedContent, fixture)).toBe(true);
                },
            ),
            { numRuns: 100 },
        );
    });
});
