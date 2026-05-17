/**
 * Fixture Metadata Registry — single source of truth for all fixture-related
 * information used by the CLI commands (init and add).
 *
 * This registry drives template generation, dependency resolution, and
 * registry updates. Adding a new fixture to the framework requires only
 * adding an entry here.
 *
 * @requirements 3.1, 3.2, 3.3
 */

/**
 * Represents an internal dependency that a fixture requires in the registry.
 * For example, the redis fixture needs a `redisConfig` fixture loaded from ConfigLoader.
 */
export interface InternalDependency {
    /** Name of the internal fixture (e.g., 'redisConfig') */
    name: string;
    /** Code snippet for the fixture definition */
    definition: string;
}

/**
 * Metadata describing everything the CLI needs to know about a fixture.
 */
export interface FixtureMetadata {
    /** Fixture identifier (lowercase) */
    name: string;
    /** npm packages required by this fixture */
    dependencies: Record<string, string>;
    /** Fixture entries exported (some fixtures export multiple, e.g., mobilewright) */
    registryEntries: string[];
    /** Import path relative to fixtures directory */
    importPath: string;
    /** Exported fixture object name */
    exportedObject: string;
    /** Config keys for environments.json */
    configTemplate: Record<string, unknown>;
    /** Environment variables for .env.local.example */
    envVars: string[];
    /** Additional registry fixtures needed (e.g., redisConfig for redis) */
    internalDependencies?: InternalDependency[];
}

/**
 * Complete fixture metadata registry.
 * Each entry defines the npm dependencies, registry entries, config shape,
 * environment variables, and internal dependencies for a supported fixture.
 */
export const FIXTURE_METADATA: Record<string, FixtureMetadata> = {
    openapi: {
        name: 'openapi',
        dependencies: { 'openapi-client-axios': '^7.5.5' },
        registryEntries: ['openApiClient'],
        importPath: './openapi.fixture',
        exportedObject: 'openApiFixture',
        configTemplate: { specPath: './specs/api.yaml', baseUrl: 'http://localhost:3000' },
        envVars: ['PW_OPENAPI_SPEC_PATH', 'PW_OPENAPI_BASE_URL'],
    },
    database: {
        name: 'database',
        dependencies: { 'pg': '^8.13.0', 'mysql2': '^3.11.0', 'better-sqlite3': '^11.6.0' },
        registryEntries: ['databaseClient'],
        importPath: './database.fixture',
        exportedObject: 'databaseFixture',
        configTemplate: { type: 'postgresql', host: 'localhost', port: 5432, database: 'testdb', username: '', password: '' },
        envVars: ['PW_DB_TYPE', 'PW_DB_HOST', 'PW_DB_PORT', 'PW_DB_NAME', 'PW_DB_USERNAME', 'PW_DB_PASSWORD'],
    },
    kafka: {
        name: 'kafka',
        dependencies: { 'kafkajs': '^2.2.4' },
        registryEntries: ['kafkaClient'],
        importPath: './kafka.fixture',
        exportedObject: 'kafkaFixture',
        configTemplate: { brokers: ['localhost:9092'] },
        envVars: ['PW_KAFKA_BROKERS'],
    },
    redis: {
        name: 'redis',
        dependencies: { 'ioredis': '^5.4.1' },
        registryEntries: ['redisConfig', 'redisClient'],
        importPath: './redis.fixture',
        exportedObject: 'redisFixture',
        configTemplate: { host: 'localhost', port: 6379 },
        envVars: ['PW_REDIS_HOST', 'PW_REDIS_PORT', 'PW_REDIS_PASSWORD'],
        internalDependencies: [{
            name: 'redisConfig',
            definition: '/* redisConfig fixture loaded from ConfigLoader */',
        }],
    },
    mobilewright: {
        name: 'mobilewright',
        dependencies: { 'mobilewright': '^0.0.35', '@mobilewright/test': '^0.0.35' },
        registryEntries: ['mobilewrightDevice', 'mobilewrightScreen'],
        importPath: './mobilewright.fixture',
        exportedObject: 'mobilewrightFixture',
        configTemplate: { platform: 'ios', bundleId: '', deviceName: '', appPath: '' },
        envVars: ['PW_MOBILE_PLATFORM', 'PW_MOBILE_BUNDLE_ID', 'PW_MOBILE_DEVICE_NAME', 'PW_MOBILE_APP_PATH'],
    },
};

/**
 * Returns an array of all supported fixture names.
 */
export function getFixtureNames(): string[] {
    return Object.keys(FIXTURE_METADATA);
}

/**
 * Returns the metadata for a specific fixture by name.
 * @param name - The fixture name (case-sensitive, should be lowercase)
 * @returns The fixture metadata, or undefined if not found
 */
export function getFixtureMetadata(name: string): FixtureMetadata | undefined {
    return FIXTURE_METADATA[name];
}
