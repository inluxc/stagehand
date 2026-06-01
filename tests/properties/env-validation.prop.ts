/**
 * Property 8: Required environment variable validation rejects incomplete configurations
 *
 * For any subset of the required environment variables (PW_DB_TYPE, PW_DB_HOST,
 * PW_DB_PORT, PW_DB_NAME, PW_DB_USERNAME, PW_DB_PASSWORD, PW_KAFKA_BROKERS,
 * PW_REDIS_HOST, PW_REDIS_PORT, PW_REDIS_KEY_PREFIX) where at least one variable
 * is missing or empty, the validation function SHALL return a failure result
 * identifying the missing variable name.
 *
 * **Validates: Requirements 8.7**
 *
 * Feature: cicd-emulated-testing, Property 8: Required environment variable validation rejects incomplete configurations
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** All required environment variables that the validation script checks */
const REQUIRED_ENV_VARS = [
    'PW_DB_TYPE',
    'PW_DB_HOST',
    'PW_DB_PORT',
    'PW_DB_NAME',
    'PW_DB_USERNAME',
    'PW_DB_PASSWORD',
    'PW_KAFKA_BROKERS',
    'PW_REDIS_HOST',
    'PW_REDIS_PORT',
    'PW_REDIS_KEY_PREFIX',
] as const;

/** Path to the validation script */
const SCRIPT_PATH = path.resolve(__dirname, '../../.github/scripts/validate-env.sh');

/**
 * Generates a non-empty value suitable for an environment variable.
 */
const arbEnvValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_-.:/'.split('')),
    { minLength: 1, maxLength: 30 }
);

/**
 * Generates a random subset of required env vars to be "present" (set with a value),
 * ensuring at least one variable is missing or empty.
 */
const arbIncompleteEnv = fc
    .record({
        /** Which variables to include (true = set with value, false = missing) */
        presence: fc.tuple(
            ...REQUIRED_ENV_VARS.map(() => fc.boolean())
        ),
        /** Values for the variables that are present */
        values: fc.array(arbEnvValue, {
            minLength: REQUIRED_ENV_VARS.length,
            maxLength: REQUIRED_ENV_VARS.length,
        }),
        /** Optionally make some "present" variables empty instead */
        emptyOverrides: fc.tuple(
            ...REQUIRED_ENV_VARS.map(() => fc.boolean())
        ),
    })
    .filter(({ presence, emptyOverrides }) => {
        // Ensure at least one variable is missing (not present) or empty (present but overridden to empty)
        for (let i = 0; i < REQUIRED_ENV_VARS.length; i++) {
            if (!presence[i] || emptyOverrides[i]) {
                return true;
            }
        }
        return false;
    })
    .map(({ presence, values, emptyOverrides }) => {
        const env: Record<string, string> = {};
        let firstMissing: string | null = null;

        for (let i = 0; i < REQUIRED_ENV_VARS.length; i++) {
            const varName = REQUIRED_ENV_VARS[i];
            if (presence[i]) {
                // Variable is present — but might be empty if overridden
                env[varName] = emptyOverrides[i] ? '' : values[i];
                if (emptyOverrides[i] && firstMissing === null) {
                    firstMissing = varName;
                }
            } else {
                // Variable is not set at all
                if (firstMissing === null) {
                    firstMissing = varName;
                }
            }
        }

        return { env, firstMissing: firstMissing! };
    });

test.describe('Property 8: Required environment variable validation rejects incomplete configurations', {
    tag: '@Feature: cicd-emulated-testing, Property 8: Required environment variable validation rejects incomplete configurations',
}, () => {
    test('incomplete env var configurations cause validation script to exit with code 1 and report missing variable', async () => {
        await fc.assert(
            fc.property(arbIncompleteEnv, ({ env, firstMissing }) => {
                // Build a clean environment with only PATH (needed for bash) and our test vars
                const cleanEnv: Record<string, string> = {
                    PATH: process.env.PATH || '/usr/bin:/bin',
                };

                // Set only the variables that are "present" in this test case
                for (const [key, value] of Object.entries(env)) {
                    if (value !== '') {
                        cleanEnv[key] = value;
                    }
                    // Empty string vars are set as empty in the environment
                    else {
                        cleanEnv[key] = '';
                    }
                }

                // Remove variables that are not present (not in env object at all)
                // They simply won't be in cleanEnv

                const result = spawnSync('bash', [SCRIPT_PATH, ...REQUIRED_ENV_VARS], {
                    env: cleanEnv,
                    encoding: 'utf-8',
                    timeout: 5000,
                });

                // Script should exit with code 1
                expect(result.status).toBe(1);

                // Script should report the missing variable name
                const output = result.stderr || '';
                expect(output).toContain('Missing required variable:');

                // The first missing/empty variable encountered (in argument order) should be reported
                expect(output).toContain(`Missing required variable: ${firstMissing}`);
            }),
            { numRuns: 100 }
        );
    });

    test('all required env vars set causes validation script to exit with code 0', async () => {
        await fc.assert(
            fc.property(
                fc.array(arbEnvValue, {
                    minLength: REQUIRED_ENV_VARS.length,
                    maxLength: REQUIRED_ENV_VARS.length,
                }),
                (values) => {
                    const cleanEnv: Record<string, string> = {
                        PATH: process.env.PATH || '/usr/bin:/bin',
                    };

                    for (let i = 0; i < REQUIRED_ENV_VARS.length; i++) {
                        cleanEnv[REQUIRED_ENV_VARS[i]] = values[i];
                    }

                    const result = spawnSync('bash', [SCRIPT_PATH, ...REQUIRED_ENV_VARS], {
                        env: cleanEnv,
                        encoding: 'utf-8',
                        timeout: 5000,
                    });

                    // Script should exit with code 0 (success)
                    expect(result.status).toBe(0);

                    // No error output about missing variables
                    const output = result.stderr || '';
                    expect(output).not.toContain('Missing required variable:');
                }
            ),
            { numRuns: 100 }
        );
    });
});
