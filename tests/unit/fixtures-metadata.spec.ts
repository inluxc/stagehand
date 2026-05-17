/**
 * Unit tests for the Fixture Metadata Registry.
 *
 * Tests cover:
 * - All supported fixtures are present in the registry
 * - Each fixture has the required metadata fields
 * - Helper functions return correct values
 * - Internal dependencies are correctly defined for redis
 * - Mobilewright has multiple registry entries
 *
 * @requirements 3.1, 3.2, 3.3
 */

import { test, expect } from '@playwright/test';
import {
    FIXTURE_METADATA,
    getFixtureNames,
    getFixtureMetadata,
    type FixtureMetadata,
    type InternalDependency,
} from '../../src/cli/fixtures-metadata';

test.describe('Fixture Metadata Registry', () => {
    test.describe('FIXTURE_METADATA constant', () => {
        test('contains all 5 supported fixtures', () => {
            const names = Object.keys(FIXTURE_METADATA);
            expect(names).toHaveLength(5);
            expect(names).toContain('openapi');
            expect(names).toContain('database');
            expect(names).toContain('kafka');
            expect(names).toContain('redis');
            expect(names).toContain('mobilewright');
        });

        test('each fixture has required metadata fields', () => {
            for (const [key, metadata] of Object.entries(FIXTURE_METADATA)) {
                expect(metadata.name).toBe(key);
                expect(metadata.dependencies).toBeDefined();
                expect(Object.keys(metadata.dependencies).length).toBeGreaterThan(0);
                expect(metadata.registryEntries).toBeDefined();
                expect(metadata.registryEntries.length).toBeGreaterThan(0);
                expect(metadata.importPath).toBeDefined();
                expect(metadata.exportedObject).toBeDefined();
                expect(metadata.configTemplate).toBeDefined();
                expect(metadata.envVars).toBeDefined();
                expect(metadata.envVars.length).toBeGreaterThan(0);
            }
        });
    });

    test.describe('openapi fixture metadata', () => {
        test('has correct dependencies', () => {
            const meta = FIXTURE_METADATA['openapi'];
            expect(meta.dependencies).toEqual({ 'openapi-client-axios': '^7.5.5' });
        });

        test('has correct registry entries', () => {
            const meta = FIXTURE_METADATA['openapi'];
            expect(meta.registryEntries).toEqual(['openApiClient']);
        });

        test('has correct import path and exported object', () => {
            const meta = FIXTURE_METADATA['openapi'];
            expect(meta.importPath).toBe('./openapi.fixture');
            expect(meta.exportedObject).toBe('openApiFixture');
        });

        test('has correct env vars', () => {
            const meta = FIXTURE_METADATA['openapi'];
            expect(meta.envVars).toEqual(['PW_OPENAPI_SPEC_PATH', 'PW_OPENAPI_BASE_URL']);
        });
    });

    test.describe('database fixture metadata', () => {
        test('has correct dependencies', () => {
            const meta = FIXTURE_METADATA['database'];
            expect(meta.dependencies).toEqual({
                'pg': '^8.13.0',
                'mysql2': '^3.11.0',
                'better-sqlite3': '^11.6.0',
            });
        });

        test('has correct registry entries', () => {
            const meta = FIXTURE_METADATA['database'];
            expect(meta.registryEntries).toEqual(['databaseClient']);
        });

        test('has correct env vars', () => {
            const meta = FIXTURE_METADATA['database'];
            expect(meta.envVars).toEqual([
                'PW_DB_TYPE', 'PW_DB_HOST', 'PW_DB_PORT',
                'PW_DB_NAME', 'PW_DB_USERNAME', 'PW_DB_PASSWORD',
            ]);
        });
    });

    test.describe('kafka fixture metadata', () => {
        test('has correct dependencies', () => {
            const meta = FIXTURE_METADATA['kafka'];
            expect(meta.dependencies).toEqual({ 'kafkajs': '^2.2.4' });
        });

        test('has correct registry entries', () => {
            const meta = FIXTURE_METADATA['kafka'];
            expect(meta.registryEntries).toEqual(['kafkaClient']);
        });

        test('has correct env vars', () => {
            const meta = FIXTURE_METADATA['kafka'];
            expect(meta.envVars).toEqual(['PW_KAFKA_BROKERS']);
        });
    });

    test.describe('redis fixture metadata', () => {
        test('has correct dependencies', () => {
            const meta = FIXTURE_METADATA['redis'];
            expect(meta.dependencies).toEqual({ 'ioredis': '^5.4.1' });
        });

        test('has correct registry entries including redisConfig', () => {
            const meta = FIXTURE_METADATA['redis'];
            expect(meta.registryEntries).toEqual(['redisConfig', 'redisClient']);
        });

        test('has internalDependencies with redisConfig', () => {
            const meta = FIXTURE_METADATA['redis'];
            expect(meta.internalDependencies).toBeDefined();
            expect(meta.internalDependencies).toHaveLength(1);
            expect(meta.internalDependencies![0].name).toBe('redisConfig');
            expect(meta.internalDependencies![0].definition).toBeDefined();
        });

        test('has correct env vars', () => {
            const meta = FIXTURE_METADATA['redis'];
            expect(meta.envVars).toEqual(['PW_REDIS_HOST', 'PW_REDIS_PORT', 'PW_REDIS_PASSWORD']);
        });
    });

    test.describe('mobilewright fixture metadata', () => {
        test('has correct dependencies', () => {
            const meta = FIXTURE_METADATA['mobilewright'];
            expect(meta.dependencies).toEqual({
                'mobilewright': '^0.0.35',
                '@mobilewright/test': '^0.0.35',
            });
        });

        test('has both device and screen registry entries', () => {
            const meta = FIXTURE_METADATA['mobilewright'];
            expect(meta.registryEntries).toEqual(['mobilewrightDevice', 'mobilewrightScreen']);
        });

        test('has correct env vars', () => {
            const meta = FIXTURE_METADATA['mobilewright'];
            expect(meta.envVars).toEqual([
                'PW_MOBILE_PLATFORM', 'PW_MOBILE_BUNDLE_ID',
                'PW_MOBILE_DEVICE_NAME', 'PW_MOBILE_APP_PATH',
            ]);
        });

        test('has no internalDependencies', () => {
            const meta = FIXTURE_METADATA['mobilewright'];
            expect(meta.internalDependencies).toBeUndefined();
        });
    });

    test.describe('getFixtureNames()', () => {
        test('returns all 5 fixture names', () => {
            const names = getFixtureNames();
            expect(names).toHaveLength(5);
            expect(names).toContain('openapi');
            expect(names).toContain('database');
            expect(names).toContain('kafka');
            expect(names).toContain('redis');
            expect(names).toContain('mobilewright');
        });
    });

    test.describe('getFixtureMetadata()', () => {
        test('returns metadata for a valid fixture name', () => {
            const meta = getFixtureMetadata('openapi');
            expect(meta).toBeDefined();
            expect(meta!.name).toBe('openapi');
        });

        test('returns undefined for an invalid fixture name', () => {
            const meta = getFixtureMetadata('nonexistent');
            expect(meta).toBeUndefined();
        });

        test('is case-sensitive (returns undefined for uppercase)', () => {
            const meta = getFixtureMetadata('OpenApi');
            expect(meta).toBeUndefined();
        });
    });
});
