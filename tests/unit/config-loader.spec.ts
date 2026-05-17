/**
 * Unit tests for ConfigLoader — three-tier configuration loading.
 *
 * Tests cover:
 * - Loading from environments.json (tier 3)
 * - Loading from .env file (tier 2)
 * - Loading from environment variables (tier 1)
 * - Three-tier precedence merge
 * - Environment selection (explicit, PW_ENVIRONMENT, --environment, default)
 * - Error handling for missing/invalid environments.json
 */

import { test, expect } from '@playwright/test';
import { ConfigLoader } from '../../src/config/loader';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'config-loader-test-'));
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

function writeEnvironmentsJson(dir: string, content: object): void {
    fs.writeFileSync(path.join(dir, 'environments.json'), JSON.stringify(content, null, 2));
}

function writeEnvFile(dir: string, environment: string, content: string): void {
    fs.writeFileSync(path.join(dir, `.env.${environment}`), content);
}

test.describe('ConfigLoader', () => {
    test.describe('environments.json loading (tier 3)', () => {
        test('loads config from environments.json for specified environment', () => {
            const dir = createTempDir();
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: {
                            database: {
                                type: 'postgresql',
                                host: 'localhost',
                                port: 5432,
                                database: 'testdb',
                            },
                        },
                    },
                });

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.environment).toBe('local');
                expect(config.database?.type).toBe('postgresql');
                expect(config.database?.host).toBe('localhost');
                expect(config.database?.port).toBe(5432);
                expect(config.database?.database).toBe('testdb');
            } finally {
                cleanup(dir);
            }
        });

        test('throws ConfigurationError when environments.json is missing', () => {
            const dir = createTempDir();
            try {
                const loader = new ConfigLoader(dir);
                expect(() => loader.load('local')).toThrow(/File not found/);
            } finally {
                cleanup(dir);
            }
        });

        test('throws ConfigurationError when environments.json has invalid JSON', () => {
            const dir = createTempDir();
            try {
                fs.writeFileSync(path.join(dir, 'environments.json'), '{ invalid json }');
                const loader = new ConfigLoader(dir);
                expect(() => loader.load('local')).toThrow(/Invalid JSON/);
            } finally {
                cleanup(dir);
            }
        });

        test('returns minimal config when environment is not in environments.json', () => {
            const dir = createTempDir();
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: { database: { type: 'postgresql', database: 'testdb' } },
                    },
                });

                const loader = new ConfigLoader(dir);
                const config = loader.load('dev');

                expect(config.environment).toBe('dev');
                expect(config.database).toBeUndefined();
            } finally {
                cleanup(dir);
            }
        });
    });

    test.describe('.env file loading (tier 2)', () => {
        test('overrides environments.json values with .env file values', () => {
            const dir = createTempDir();
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: {
                            database: {
                                type: 'postgresql',
                                host: 'file-host',
                                port: 5432,
                                database: 'testdb',
                            },
                        },
                    },
                });
                writeEnvFile(dir, 'local', 'PW_DB_HOST=env-file-host\n');

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.database?.host).toBe('env-file-host');
                // Other values from environments.json should remain
                expect(config.database?.port).toBe(5432);
            } finally {
                cleanup(dir);
            }
        });

        test('gracefully handles missing .env file', () => {
            const dir = createTempDir();
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: {
                            redis: { host: 'localhost', port: 6379 },
                        },
                    },
                });

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.redis?.host).toBe('localhost');
                expect(config.redis?.port).toBe(6379);
            } finally {
                cleanup(dir);
            }
        });
    });

    test.describe('environment variables (tier 1)', () => {
        test('overrides both .env file and environments.json values', () => {
            const dir = createTempDir();
            const originalEnv = process.env['PW_DB_HOST'];
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: {
                            database: {
                                type: 'postgresql',
                                host: 'file-host',
                                port: 5432,
                                database: 'testdb',
                            },
                        },
                    },
                });
                writeEnvFile(dir, 'local', 'PW_DB_HOST=env-file-host\n');

                process.env['PW_DB_HOST'] = 'env-var-host';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.database?.host).toBe('env-var-host');
            } finally {
                if (originalEnv === undefined) {
                    delete process.env['PW_DB_HOST'];
                } else {
                    process.env['PW_DB_HOST'] = originalEnv;
                }
                cleanup(dir);
            }
        });
    });

    test.describe('environment variable mapping', () => {
        test('maps PW_OPENAPI_SPEC_PATH to openapi.specPath', () => {
            const dir = createTempDir();
            const original = process.env['PW_OPENAPI_SPEC_PATH'];
            try {
                writeEnvironmentsJson(dir, { environments: { local: {} } });
                process.env['PW_OPENAPI_SPEC_PATH'] = './my-spec.yaml';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.openapi?.specPath).toBe('./my-spec.yaml');
            } finally {
                if (original === undefined) delete process.env['PW_OPENAPI_SPEC_PATH'];
                else process.env['PW_OPENAPI_SPEC_PATH'] = original;
                cleanup(dir);
            }
        });

        test('maps PW_KAFKA_BROKERS as comma-separated list', () => {
            const dir = createTempDir();
            const original = process.env['PW_KAFKA_BROKERS'];
            try {
                writeEnvironmentsJson(dir, { environments: { local: {} } });
                process.env['PW_KAFKA_BROKERS'] = 'broker1:9092,broker2:9092,broker3:9092';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.kafka?.brokers).toEqual(['broker1:9092', 'broker2:9092', 'broker3:9092']);
            } finally {
                if (original === undefined) delete process.env['PW_KAFKA_BROKERS'];
                else process.env['PW_KAFKA_BROKERS'] = original;
                cleanup(dir);
            }
        });

        test('maps PW_DB_PORT as number', () => {
            const dir = createTempDir();
            const original = process.env['PW_DB_PORT'];
            try {
                writeEnvironmentsJson(dir, {
                    environments: { local: { database: { type: 'postgresql', database: 'db' } } },
                });
                process.env['PW_DB_PORT'] = '3306';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.database?.port).toBe(3306);
            } finally {
                if (original === undefined) delete process.env['PW_DB_PORT'];
                else process.env['PW_DB_PORT'] = original;
                cleanup(dir);
            }
        });

        test('maps PW_MOBILE_PLATFORM to mobilewright.platform', () => {
            const dir = createTempDir();
            const original = process.env['PW_MOBILE_PLATFORM'];
            try {
                writeEnvironmentsJson(dir, { environments: { local: {} } });
                process.env['PW_MOBILE_PLATFORM'] = 'android';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.mobilewright?.platform).toBe('android');
            } finally {
                if (original === undefined) delete process.env['PW_MOBILE_PLATFORM'];
                else process.env['PW_MOBILE_PLATFORM'] = original;
                cleanup(dir);
            }
        });
    });

    test.describe('environment selection', () => {
        test('uses explicit parameter over everything', () => {
            const dir = createTempDir();
            const originalEnv = process.env['PW_ENVIRONMENT'];
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        dev: { redis: { host: 'dev-redis', port: 6379 } },
                        local: { redis: { host: 'local-redis', port: 6379 } },
                    },
                });
                process.env['PW_ENVIRONMENT'] = 'local';

                const loader = new ConfigLoader(dir);
                const config = loader.load('dev');

                expect(config.environment).toBe('dev');
                expect(config.redis?.host).toBe('dev-redis');
            } finally {
                if (originalEnv === undefined) delete process.env['PW_ENVIRONMENT'];
                else process.env['PW_ENVIRONMENT'] = originalEnv;
                cleanup(dir);
            }
        });

        test('uses PW_ENVIRONMENT env var when no explicit param', () => {
            const dir = createTempDir();
            const originalEnv = process.env['PW_ENVIRONMENT'];
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        stg: { redis: { host: 'stg-redis', port: 6379 } },
                    },
                });
                process.env['PW_ENVIRONMENT'] = 'stg';

                const loader = new ConfigLoader(dir);
                const config = loader.load();

                expect(config.environment).toBe('stg');
                expect(config.redis?.host).toBe('stg-redis');
            } finally {
                if (originalEnv === undefined) delete process.env['PW_ENVIRONMENT'];
                else process.env['PW_ENVIRONMENT'] = originalEnv;
                cleanup(dir);
            }
        });

        test('defaults to local when no environment specified', () => {
            const dir = createTempDir();
            const originalEnv = process.env['PW_ENVIRONMENT'];
            try {
                delete process.env['PW_ENVIRONMENT'];
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: { redis: { host: 'local-redis', port: 6379 } },
                    },
                });

                const loader = new ConfigLoader(dir);
                const config = loader.load();

                expect(config.environment).toBe('local');
            } finally {
                if (originalEnv === undefined) delete process.env['PW_ENVIRONMENT'];
                else process.env['PW_ENVIRONMENT'] = originalEnv;
                cleanup(dir);
            }
        });
    });

    test.describe('three-tier precedence', () => {
        test('env var > .env file > environments.json for same key', () => {
            const dir = createTempDir();
            const originalHost = process.env['PW_REDIS_HOST'];
            try {
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: { redis: { host: 'json-host', port: 6379 } },
                    },
                });
                writeEnvFile(dir, 'local', 'PW_REDIS_HOST=envfile-host\n');
                process.env['PW_REDIS_HOST'] = 'envvar-host';

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.redis?.host).toBe('envvar-host');
            } finally {
                if (originalHost === undefined) delete process.env['PW_REDIS_HOST'];
                else process.env['PW_REDIS_HOST'] = originalHost;
                cleanup(dir);
            }
        });

        test('.env file > environments.json when no env var', () => {
            const dir = createTempDir();
            const originalHost = process.env['PW_REDIS_HOST'];
            try {
                delete process.env['PW_REDIS_HOST'];
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: { redis: { host: 'json-host', port: 6379 } },
                    },
                });
                writeEnvFile(dir, 'local', 'PW_REDIS_HOST=envfile-host\n');

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.redis?.host).toBe('envfile-host');
            } finally {
                if (originalHost === undefined) delete process.env['PW_REDIS_HOST'];
                else process.env['PW_REDIS_HOST'] = originalHost;
                cleanup(dir);
            }
        });

        test('environments.json used when no env var or .env file value', () => {
            const dir = createTempDir();
            const originalHost = process.env['PW_REDIS_HOST'];
            try {
                delete process.env['PW_REDIS_HOST'];
                writeEnvironmentsJson(dir, {
                    environments: {
                        local: { redis: { host: 'json-host', port: 6379 } },
                    },
                });
                // No .env.local file

                const loader = new ConfigLoader(dir);
                const config = loader.load('local');

                expect(config.redis?.host).toBe('json-host');
            } finally {
                if (originalHost === undefined) delete process.env['PW_REDIS_HOST'];
                else process.env['PW_REDIS_HOST'] = originalHost;
                cleanup(dir);
            }
        });
    });
});
