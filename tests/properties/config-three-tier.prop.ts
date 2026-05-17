/**
 * Property 13: Three-tier config precedence
 *
 * For any config key with values in all three sources (env var, .env file,
 * environments.json), the loaded value SHALL be the env var value; if absent
 * from env vars, the .env file value; if absent from both, the environments.json value.
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
    return fs.mkdtempSync(path.join(os.tmpdir(), 'prop13-'));
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeEnvironmentsJson(dir: string, content: object): void {
    fs.writeFileSync(path.join(dir, 'environments.json'), JSON.stringify(content, null, 2));
}

/**
 * Generates non-empty alphanumeric strings suitable for config values.
 */
const arbConfigValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-./:_'.split('')),
    { minLength: 1, maxLength: 50 }
);

/**
 * String-valued PW_* env var mappings and their corresponding config accessors.
 */
const stringMappings = [
    {
        envVar: 'PW_DB_HOST',
        configPath: 'database.host',
        getFromConfig: (cfg: any) => cfg.database?.host,
        baseConfig: { database: { type: 'postgresql', database: 'testdb' } },
        setInConfig: (envConfig: any, value: string) => {
            if (!envConfig.database) envConfig.database = { type: 'postgresql', database: 'testdb' };
            envConfig.database.host = value;
        },
    },
    {
        envVar: 'PW_REDIS_HOST',
        configPath: 'redis.host',
        getFromConfig: (cfg: any) => cfg.redis?.host,
        baseConfig: { redis: { host: 'placeholder', port: 6379 } },
        setInConfig: (envConfig: any, value: string) => {
            if (!envConfig.redis) envConfig.redis = { host: 'placeholder', port: 6379 };
            envConfig.redis.host = value;
        },
    },
    {
        envVar: 'PW_OPENAPI_BASE_URL',
        configPath: 'openapi.baseUrl',
        getFromConfig: (cfg: any) => cfg.openapi?.baseUrl,
        baseConfig: { openapi: { specPath: './spec.yaml' } },
        setInConfig: (envConfig: any, value: string) => {
            if (!envConfig.openapi) envConfig.openapi = { specPath: './spec.yaml' };
            envConfig.openapi.baseUrl = value;
        },
    },
    {
        envVar: 'PW_DB_USERNAME',
        configPath: 'database.username',
        getFromConfig: (cfg: any) => cfg.database?.username,
        baseConfig: { database: { type: 'postgresql', database: 'testdb' } },
        setInConfig: (envConfig: any, value: string) => {
            if (!envConfig.database) envConfig.database = { type: 'postgresql', database: 'testdb' };
            envConfig.database.username = value;
        },
    },
    {
        envVar: 'PW_REDIS_PASSWORD',
        configPath: 'redis.password',
        getFromConfig: (cfg: any) => cfg.redis?.password,
        baseConfig: { redis: { host: 'localhost', port: 6379 } },
        setInConfig: (envConfig: any, value: string) => {
            if (!envConfig.redis) envConfig.redis = { host: 'localhost', port: 6379 };
            envConfig.redis.password = value;
        },
    },
] as const;

const arbMapping = fc.constantFrom(...stringMappings);

/**
 * Represents which tiers have a value defined.
 * true = value present in that tier, false = absent.
 */
interface TierPresence {
    envVar: boolean;
    envFile: boolean;
    jsonFile: boolean;
}

/**
 * All possible combinations where at least one tier has a value.
 */
const arbTierPresence: fc.Arbitrary<TierPresence> = fc.record({
    envVar: fc.boolean(),
    envFile: fc.boolean(),
    jsonFile: fc.boolean(),
}).filter(p => p.envVar || p.envFile || p.jsonFile);

test.describe('Property 13: Three-tier config precedence', () => {
    test('value from highest-precedence tier always wins', () => {
        fc.assert(
            fc.property(
                arbMapping,
                arbConfigValue,
                arbConfigValue,
                arbConfigValue,
                arbTierPresence,
                (mapping, jsonValue, envFileValue, envVarValue, presence) => {
                    // Ensure all values are distinct so we can verify which tier won
                    fc.pre(jsonValue !== envFileValue && envFileValue !== envVarValue && jsonValue !== envVarValue);
                    // At least one tier must be present
                    fc.pre(presence.envVar || presence.envFile || presence.jsonFile);

                    const dir = createTempDir();
                    const originalEnv = process.env[mapping.envVar];

                    try {
                        // Tier 3: environments.json
                        const envConfig: any = { ...JSON.parse(JSON.stringify(mapping.baseConfig)) };
                        if (presence.jsonFile) {
                            mapping.setInConfig(envConfig, jsonValue);
                        }
                        writeEnvironmentsJson(dir, {
                            environments: { local: envConfig },
                        });

                        // Tier 2: .env.local file
                        if (presence.envFile) {
                            fs.writeFileSync(
                                path.join(dir, '.env.local'),
                                `${mapping.envVar}=${envFileValue}\n`
                            );
                        }

                        // Tier 1: environment variable
                        if (presence.envVar) {
                            process.env[mapping.envVar] = envVarValue;
                        } else {
                            delete process.env[mapping.envVar];
                        }

                        const loader = new ConfigLoader(dir);
                        const config = loader.load('local');
                        const actual = mapping.getFromConfig(config);

                        // Determine expected value based on precedence
                        let expected: string;
                        if (presence.envVar) {
                            expected = envVarValue;
                        } else if (presence.envFile) {
                            expected = envFileValue;
                        } else {
                            expected = jsonValue;
                        }

                        expect(actual).toBe(expected);
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

    test('env file wins over json file when env var is absent', () => {
        fc.assert(
            fc.property(
                arbMapping,
                arbConfigValue,
                arbConfigValue,
                (mapping, jsonValue, envFileValue) => {
                    // Ensure values are different
                    fc.pre(jsonValue !== envFileValue);

                    const dir = createTempDir();
                    const originalEnv = process.env[mapping.envVar];

                    try {
                        // Ensure env var is not set
                        delete process.env[mapping.envVar];

                        // Tier 3: environments.json with jsonValue
                        const envConfig: any = { ...JSON.parse(JSON.stringify(mapping.baseConfig)) };
                        mapping.setInConfig(envConfig, jsonValue);
                        writeEnvironmentsJson(dir, {
                            environments: { local: envConfig },
                        });

                        // Tier 2: .env.local with envFileValue
                        fs.writeFileSync(
                            path.join(dir, '.env.local'),
                            `${mapping.envVar}=${envFileValue}\n`
                        );

                        const loader = new ConfigLoader(dir);
                        const config = loader.load('local');
                        const actual = mapping.getFromConfig(config);

                        // .env file value should win over json file
                        expect(actual).toBe(envFileValue);
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

    test('json file value used when env var and env file are both absent', () => {
        fc.assert(
            fc.property(
                arbMapping,
                arbConfigValue,
                (mapping, jsonValue) => {
                    const dir = createTempDir();
                    const originalEnv = process.env[mapping.envVar];

                    try {
                        // Ensure env var is not set
                        delete process.env[mapping.envVar];

                        // Tier 3: environments.json with jsonValue
                        const envConfig: any = { ...JSON.parse(JSON.stringify(mapping.baseConfig)) };
                        mapping.setInConfig(envConfig, jsonValue);
                        writeEnvironmentsJson(dir, {
                            environments: { local: envConfig },
                        });

                        // No .env.local file (tier 2 absent)

                        const loader = new ConfigLoader(dir);
                        const config = loader.load('local');
                        const actual = mapping.getFromConfig(config);

                        // json file value should be used
                        expect(actual).toBe(jsonValue);
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
