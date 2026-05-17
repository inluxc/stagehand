/**
 * Property 2: Init scaffolding produces environment config consistent with fixture selection
 *
 * For any non-empty subset of supported fixtures and any valid secrets provider,
 * the generated environments.json SHALL contain a `local` environment entry with
 * configuration keys for exactly the selected fixtures and a `secrets` object with
 * the `provider` field matching the selected provider.
 *
 * **Validates: Requirements 1.5, 5.2**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { generateEnvironmentsJson } from '../../src/cli/templates/index';
import { FIXTURE_METADATA, type FixtureMetadata } from '../../src/cli/fixtures-metadata';
import { SECRETS_PROVIDERS, type SecretsProviderMetadata } from '../../src/cli/secrets-metadata';

const ALL_FIXTURES = Object.values(FIXTURE_METADATA);
const ALL_PROVIDERS = Object.values(SECRETS_PROVIDERS);

/**
 * Generates a random non-empty subset of supported fixture metadata.
 */
const arbFixtureSubset: fc.Arbitrary<FixtureMetadata[]> = fc
    .subarray(ALL_FIXTURES, { minLength: 1 })
    .map((subset) => [...new Map(subset.map((f) => [f.name, f])).values()]);

/**
 * Generates a random secrets provider metadata.
 */
const arbSecretsProvider: fc.Arbitrary<SecretsProviderMetadata> = fc.constantFrom(...ALL_PROVIDERS);

test.describe('Feature: cli-init-and-add, Property 2: Init scaffolding produces environment config consistent with fixture selection', () => {
    test('generated environments.json has config keys for exactly the selected fixtures', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset,
                arbSecretsProvider,
                async (selectedFixtures, provider) => {
                    const result = generateEnvironmentsJson(selectedFixtures, provider);

                    // Must be valid JSON
                    const parsed = JSON.parse(result);

                    // Must have environments.local object
                    expect(parsed).toHaveProperty('environments');
                    expect(parsed.environments).toHaveProperty('local');

                    const local = parsed.environments.local;

                    // Extract fixture config keys (all keys except 'secrets')
                    const fixtureKeys = Object.keys(local).filter((k) => k !== 'secrets');
                    const expectedFixtureNames = selectedFixtures.map((f) => f.name).sort();

                    // The fixture config keys must match exactly the selected fixture names
                    expect([...fixtureKeys].sort()).toEqual(expectedFixtureNames);

                    // Each fixture config must match the fixture's configTemplate
                    for (const fixture of selectedFixtures) {
                        expect(local[fixture.name]).toEqual(fixture.configTemplate);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('generated environments.json has secrets object with correct provider and keyMappings', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset,
                arbSecretsProvider,
                async (selectedFixtures, provider) => {
                    const result = generateEnvironmentsJson(selectedFixtures, provider);
                    const parsed = JSON.parse(result);

                    const local = parsed.environments.local;

                    // Must have a secrets object
                    expect(local).toHaveProperty('secrets');
                    const secrets = local.secrets;

                    // Provider field must match the selected provider name
                    expect(secrets.provider).toBe(provider.name);

                    // Must have a keyMappings object
                    expect(secrets).toHaveProperty('keyMappings');
                    expect(typeof secrets.keyMappings).toBe('object');
                }
            ),
            { numRuns: 100 }
        );
    });
});
