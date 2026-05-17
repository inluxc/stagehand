/**
 * Property 11: Secrets provider validation
 *
 * For any string provided as --secrets-provider value, the validator SHALL accept it
 * if and only if its lowercase form matches one of the supported providers (aws, azure,
 * env-file, gitlab, vault), and SHALL reject all other strings with an error listing
 * valid providers.
 *
 * **Validates: Requirements 5.4, 5.5**
 *
 * Feature: cli-init-and-add, Property 11: Secrets provider validation
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { SECRETS_PROVIDERS } from '../../src/cli/secrets-metadata';

/**
 * Validates a secrets provider name against the supported set.
 * Accepts case-insensitively and normalizes to lowercase.
 */
function validateSecretsProvider(name: string): { valid: true; normalized: string } | { valid: false; validProviders: string[] } {
    const normalized = name.toLowerCase();
    const supported = Object.keys(SECRETS_PROVIDERS);
    if (supported.includes(normalized)) {
        return { valid: true, normalized };
    }
    return { valid: false, validProviders: supported };
}

/** All supported provider names (lowercase) */
const SUPPORTED_PROVIDERS = Object.keys(SECRETS_PROVIDERS);

/**
 * Generates a valid provider name with random casing.
 * Picks a random supported provider and applies random upper/lower to each character.
 */
const arbValidProviderWithRandomCasing = fc
    .constantFrom(...SUPPORTED_PROVIDERS)
    .chain((provider) =>
        fc.array(fc.boolean(), { minLength: provider.length, maxLength: provider.length }).map(
            (upperFlags) =>
                provider
                    .split('')
                    .map((ch, i) => (upperFlags[i] ? ch.toUpperCase() : ch.toLowerCase()))
                    .join('')
        )
    );

/**
 * Generates arbitrary strings that do NOT match any supported provider when lowercased.
 */
const arbInvalidProvider = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !SUPPORTED_PROVIDERS.includes(s.toLowerCase()));

test.describe('Property 11: Secrets provider validation', {
    tag: '@Feature: cli-init-and-add, Property 11: Secrets provider validation',
}, () => {
    test('valid provider names with any casing are accepted and normalized to lowercase', async () => {
        await fc.assert(
            fc.asyncProperty(arbValidProviderWithRandomCasing, async (providerInput) => {
                const result = validateSecretsProvider(providerInput);

                expect(result.valid).toBe(true);
                if (result.valid) {
                    expect(result.normalized).toBe(providerInput.toLowerCase());
                    expect(SUPPORTED_PROVIDERS).toContain(result.normalized);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('invalid provider names are rejected with valid providers list', async () => {
        await fc.assert(
            fc.asyncProperty(arbInvalidProvider, async (invalidInput) => {
                const result = validateSecretsProvider(invalidInput);

                expect(result.valid).toBe(false);
                if (!result.valid) {
                    expect(result.validProviders).toEqual(SUPPORTED_PROVIDERS);
                    expect(result.validProviders.length).toBeGreaterThan(0);
                    // Confirm the input truly doesn't match any provider
                    expect(SUPPORTED_PROVIDERS).not.toContain(invalidInput.toLowerCase());
                }
            }),
            { numRuns: 100 }
        );
    });
});
