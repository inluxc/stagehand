/**
 * Property 3: Init scaffolding produces env vars consistent with fixture and provider selection
 *
 * For any non-empty subset of fixtures and valid secrets provider, generated .env.local.example
 * has exactly the correct env vars (union of all selected fixtures' envVars + provider's envVars + PW_ENVIRONMENT).
 *
 * **Validates: Requirements 1.6, 5.3**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { generateEnvExample } from '../../src/cli/templates/index';
import { FIXTURE_METADATA, type FixtureMetadata } from '../../src/cli/fixtures-metadata';
import { SECRETS_PROVIDERS, type SecretsProviderMetadata } from '../../src/cli/secrets-metadata';

const ALL_FIXTURES = Object.values(FIXTURE_METADATA);
const ALL_PROVIDERS = Object.values(SECRETS_PROVIDERS);

/**
 * Generates a random non-empty subset of fixture metadata entries.
 */
const arbFixtureSubset: fc.Arbitrary<FixtureMetadata[]> = fc
    .subarray(ALL_FIXTURES, { minLength: 1 })
    .map((subset) => {
        // Deduplicate by name
        const seen = new Set<string>();
        return subset.filter((f) => {
            if (seen.has(f.name)) return false;
            seen.add(f.name);
            return true;
        });
    });

/**
 * Generates a random secrets provider metadata entry.
 */
const arbProvider: fc.Arbitrary<SecretsProviderMetadata> = fc.constantFrom(...ALL_PROVIDERS);

/**
 * Parses the generated .env.local.example content and extracts all env var names.
 * Matches lines of the form `VARNAME=` or `VARNAME=value`.
 */
function extractEnvVarNames(content: string): Set<string> {
    const vars = new Set<string>();
    const lines = content.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip empty lines and comments
        if (trimmed === '' || trimmed.startsWith('#')) continue;
        // Match pattern: VARNAME= or VARNAME=value
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) {
            vars.add(match[1]);
        }
    }
    return vars;
}

/**
 * Computes the expected set of env vars for a given fixture selection and provider.
 */
function computeExpectedEnvVars(fixtures: FixtureMetadata[], provider: SecretsProviderMetadata): Set<string> {
    const expected = new Set<string>();

    // Always includes PW_ENVIRONMENT
    expected.add('PW_ENVIRONMENT');

    // Union of all selected fixtures' envVars
    for (const fixture of fixtures) {
        for (const envVar of fixture.envVars) {
            expected.add(envVar);
        }
    }

    // Provider's envVars
    for (const envVar of provider.envVars) {
        expected.add(envVar);
    }

    return expected;
}

test.describe('Feature: cli-init-and-add, Property 3: Init scaffolding produces env vars consistent with fixture and provider selection', () => {
    test('generated .env.local.example contains exactly the expected env vars for any fixture subset and provider', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset,
                arbProvider,
                async (selectedFixtures, provider) => {
                    // Generate the .env.local.example content
                    const content = generateEnvExample(selectedFixtures, provider);

                    // Parse the generated content to extract env var names
                    const actualVars = extractEnvVarNames(content);

                    // Compute the expected set
                    const expectedVars = computeExpectedEnvVars(selectedFixtures, provider);

                    // Verify exact match: no extra vars, no missing vars
                    expect(actualVars).toEqual(expectedVars);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('generated .env.local.example always includes PW_ENVIRONMENT regardless of selection', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset,
                arbProvider,
                async (selectedFixtures, provider) => {
                    const content = generateEnvExample(selectedFixtures, provider);
                    const actualVars = extractEnvVarNames(content);

                    // PW_ENVIRONMENT must always be present
                    expect(actualVars.has('PW_ENVIRONMENT')).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('generated .env.local.example includes all fixture env vars for selected fixtures', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbFixtureSubset,
                arbProvider,
                async (selectedFixtures, provider) => {
                    const content = generateEnvExample(selectedFixtures, provider);
                    const actualVars = extractEnvVarNames(content);

                    // Every env var from every selected fixture must be present
                    for (const fixture of selectedFixtures) {
                        for (const envVar of fixture.envVars) {
                            expect(actualVars.has(envVar)).toBe(true);
                        }
                    }

                    // Every env var from the provider must be present
                    for (const envVar of provider.envVars) {
                        expect(actualVars.has(envVar)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
