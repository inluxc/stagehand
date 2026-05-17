/**
 * Property 3: Credential redaction replaces all sensitive patterns
 *
 * For any annotation value string containing credential patterns (password fields,
 * bearer tokens, API keys, connection string secrets), the redaction function SHALL
 * replace all matched credential values with `[REDACTED]` while preserving the
 * non-sensitive portions of the string unchanged.
 *
 * **Validates: Requirements 12.6**
 *
 * Feature: cicd-emulated-testing, Property 3: Credential redaction replaces all sensitive patterns
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { redactCredentials } from '../../src/annotations/truncation';

/**
 * Generates a random alphanumeric string suitable for use as a secret value.
 * Uses minimum length of 4 and avoids characters that would terminate pattern matching.
 */
const arbSecretValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-.'.split('')),
    { minLength: 4, maxLength: 40 }
);

/**
 * Generates a random non-sensitive prefix/suffix string that won't match credential patterns.
 */
const arbNonSensitiveText = fc.stringOf(
    fc.constantFrom(...'0123456789 ,.:()[]{}!@#$%^*'.split('')),
    { minLength: 0, maxLength: 30 }
);

/**
 * Generates a random uppercase alphanumeric string of exactly 16 characters for AWS key suffix.
 */
const arbAwsKeySuffix = fc.stringOf(
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
    { minLength: 16, maxLength: 16 }
);

/**
 * Generates a base64url-safe string for JWT segment simulation.
 * Must end with a word character (alphanumeric or underscore) to match the \b boundary in the regex.
 */
const arbBase64UrlSegment = fc.tuple(
    fc.stringOf(
        fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'.split('')),
        { minLength: 4, maxLength: 29 }
    ),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_'.split(''))
).map(([body, lastChar]) => body + lastChar);

test.describe('Property 3: Credential redaction replaces all sensitive patterns', {
    tag: '@Feature: cicd-emulated-testing, Property 3: Credential redaction replaces all sensitive patterns',
}, () => {
    test('strings containing password=<secret> patterns have the secret replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (secret) => {
                const input = `password=${secret}`;
                const result = redactCredentials(input);
                expect(result).toBe('password=[REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing pwd=<secret> patterns have the secret replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (secret) => {
                const input = `pwd=${secret}`;
                const result = redactCredentials(input);
                expect(result).toBe('pwd=[REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing Bearer <token> patterns have the token replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (token) => {
                const input = `Bearer ${token}`;
                const result = redactCredentials(input);
                expect(result).toBe('Bearer [REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing Basic <token> patterns have the token replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (token) => {
                const input = `Basic ${token}`;
                const result = redactCredentials(input);
                expect(result).toBe('Basic [REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing token=<value> patterns have values replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (value) => {
                const input = `token=${value}`;
                const result = redactCredentials(input);
                expect(result).toBe('token=[REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing api_key=<value> patterns have values replaced with [REDACTED]', async () => {
        await fc.assert(
            fc.property(arbSecretValue, (value) => {
                const input = `api_key=${value}`;
                const result = redactCredentials(input);
                expect(result).toBe('api_key=[REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing AWS key patterns (AKIA + 16 uppercase alphanumeric chars) are replaced', async () => {
        await fc.assert(
            fc.property(arbAwsKeySuffix, (suffix) => {
                const awsKey = `AKIA${suffix}`;
                const input = awsKey;
                const result = redactCredentials(input);
                expect(result).toBe('[REDACTED]');
            }),
            { numRuns: 100 }
        );
    });

    test('strings containing JWT patterns (eyJ...eyJ...) are replaced', async () => {
        await fc.assert(
            fc.property(
                arbBase64UrlSegment,
                arbBase64UrlSegment,
                arbBase64UrlSegment,
                (header, payload, signature) => {
                    const jwt = `eyJ${header}.eyJ${payload}.${signature}`;
                    const input = jwt;
                    const result = redactCredentials(input);
                    expect(result).toBe('[REDACTED]');
                }
            ),
            { numRuns: 100 }
        );
    });

    test('non-sensitive portions of the string remain unchanged', async () => {
        await fc.assert(
            fc.property(
                arbNonSensitiveText,
                arbSecretValue,
                arbNonSensitiveText,
                (prefix, secret, suffix) => {
                    // Use a separator that won't be consumed by the regex
                    const input = `${prefix} password=${secret} ${suffix}`;
                    const result = redactCredentials(input);
                    // The redacted result should contain the prefix and suffix unchanged
                    const expected = `${prefix} password=[REDACTED] ${suffix}`;
                    expect(result).toBe(expected);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('strings without any credential patterns are returned unchanged', async () => {
        // Generate strings that don't contain any credential patterns
        const arbSafeString = fc.stringOf(
            fc.constantFrom(...'0123456789 ,.:()[]{}!@#$%^*'.split('')),
            { minLength: 0, maxLength: 100 }
        );

        await fc.assert(
            fc.property(arbSafeString, (input) => {
                const result = redactCredentials(input);
                expect(result).toBe(input);
            }),
            { numRuns: 100 }
        );
    });
});
