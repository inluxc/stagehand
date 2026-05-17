/**
 * Property 8: Environment variable precedence over config file
 *
 * For any configuration key that has a value defined in both an environment
 * variable and the configuration file, the loaded configuration SHALL contain
 * the environment variable's value, not the config file's value.
 *
 * **Validates: Requirements 6.1, 8.8**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { ConfigLoader } from '../../src/config/loader';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'prop8-'));
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeEnvironmentsJson(dir: string, content: object): void {
    fs.writeFileSync(path.join(dir, 'environments.json'), JSON.stringify(content, null, 2));
}

/**
 * Generates non-empty alphanumeric strings suitable for config values.
 * Avoids empty strings since the ConfigLoader skips empty env var values.
 */
const arbConfigValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-./:_'.split('')),
    { minLength: 1, maxLength: 50 }
);

/**
 * String-valued PW_* env var mappings and their corresponding config accessors.
 * These are the mappings that accept plain string values (no parsing needed).
 */
const stringMappings = [
    {
        envVar: 'PW_DB_HOST',
        configPath: 'database.host',
        getFromConfig: (cfg: any) => cfg.database?.host,
        baseConfig: { database: { type: 'postgresql', database: 'testdb' } },
    },
    {
        envVar: 'PW_REDIS_HOST',
        configPath: 'redis.host',
        getFromConfig: (cfg: any) => cfg.redis?.host,
        baseConfig: { redis: { host: 'placeholder', port: 6379 } },
    },
    {
        envVar: 'PW_OPENAPI_BASE_URL',
        configPath: 'openapi.baseUrl',
        getFromConfig: (cfg: any) => cfg.openapi?.baseUrl,
        baseConfig: { openapi: { specPath: './spec.yaml' } },
    },
    {
        envVar: 'PW_DB_USERNAME',
        configPath: 'database.username',
        getFromConfig: (cfg: any) => cfg.database?.username,
        baseConfig: { database: { type: 'postgresql', database: 'testdb' } },
    },
    {
        envVar: 'PW_DB_PASSWORD',
        configPath: 'database.password',
        getFromConfig: (cfg: any) => cfg.database?.password,
        baseConfig: { database: { type: 'postgresql', database: 'testdb' } },
    },
    {
        envVar: 'PW_REDIS_PASSWORD',
        configPath: 'redis.password',
        getFromConfig: (cfg: any) => cfg.redis?.password,
        baseConfig: { redis: { host: 'localhost', port: 6379 } },
    },
] as const;

const arbMapping = fc.constantFrom(...stringMappings);

test.describe('Property 8: Environment variable precedence over config file', () => {
    test('env var value always wins over environments.json value', () => {
        fc.assert(
            fc.property(
                arbMapping,
                arbConfigValue,
                arbConfigValue,
                (mapping, fileValue, envVarValue) => {
                    // Ensure the two values are different so we can verify precedence
                    fc.pre(fileValue !== envVarValue);

                    const dir = createTempDir();
                    const originalEnv = process.env[mapping.envVar];

                    try {
                        // Set up environments.json with the file value
                        const envConfig: any = { ...mapping.baseConfig };
                        const pathParts = mapping.configPath.split('.');
                        if (pathParts.length === 2) {
                            if (!envConfig[pathParts[0]]) envConfig[pathParts[0]] = {};
                            envConfig[pathParts[0]][pathParts[1]] = fileValue;
                        }

                        writeEnvironmentsJson(dir, {
                            environments: { local: envConfig },
                        });

                        // Set the environment variable (tier 1 — highest precedence)
                        process.env[mapping.envVar] = envVarValue;

                        const loader = new ConfigLoader(dir);
                        const config = loader.load('local');

                        // The env var value must win
                        const actual = mapping.getFromConfig(config);
                        expect(actual).toBe(envVarValue);
                    } finally {
                        if (originalEnv === undefined) {
                            delete process.env[mapping.envVar];
                        } else {
                            process.env[mapping.envVar] = originalEnv;
                        }
                        cleanup(dir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('env var value always wins over .env file value', () => {
        fc.assert(
            fc.property(
                arbMapping,
                arbConfigValue,
                arbConfigValue,
                (mapping, envFileValue, envVarValue) => {
                    // Ensure the two values are different so we can verify precedence
                    fc.pre(envFileValue !== envVarValue);

                    const dir = createTempDir();
                    const originalEnv = process.env[mapping.envVar];

                    try {
                        // Set up minimal environments.json
                        writeEnvironmentsJson(dir, {
                            environments: { local: mapping.baseConfig },
                        });

                        // Write .env.local with the env file value (tier 2)
                        fs.writeFileSync(
                            path.join(dir, '.env.local'),
                            `${mapping.envVar}=${envFileValue}\n`
                        );

                        // Set the environment variable (tier 1 — highest precedence)
                        process.env[mapping.envVar] = envVarValue;

                        const loader = new ConfigLoader(dir);
                        const config = loader.load('local');

                        // The env var value must win
                        const actual = mapping.getFromConfig(config);
                        expect(actual).toBe(envVarValue);
                    } finally {
                        if (originalEnv === undefined) {
                            delete process.env[mapping.envVar];
                        } else {
                            process.env[mapping.envVar] = originalEnv;
                        }
                        cleanup(dir);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});
