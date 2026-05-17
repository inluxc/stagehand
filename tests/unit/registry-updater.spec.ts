/**
 * Unit tests for the RegistryUpdater class.
 *
 * Tests cover:
 * - isRegistered correctly detects existing fixtures
 * - addFixture inserts imports and spreads at marker positions
 * - addFixture is idempotent (no duplicates)
 * - addInternalDependency adds definitions and spreads
 * - Redis fixture includes redisConfig internal dependency
 * - Multiple fixtures can be added sequentially
 *
 * @requirements 2.5, 2.10, 3.1, 3.2, 3.5
 */

import { test, expect } from '@playwright/test';
import { RegistryUpdater } from '../../src/cli/registry-updater';
import type { FixtureMetadata, InternalDependency } from '../../src/cli/fixtures-metadata';

const SAMPLE_REGISTRY = `import { test as base } from '@playwright/test';
// CLI:IMPORTS

const allFixtures = {
    // CLI:FIXTURES
};

export const test = base.extend(allFixtures);
`;

const kafkaFixture: FixtureMetadata = {
    name: 'kafka',
    dependencies: { 'kafkajs': '^2.2.4' },
    registryEntries: ['kafkaClient'],
    importPath: './kafka.fixture',
    exportedObject: 'kafkaFixture',
    configTemplate: { brokers: ['localhost:9092'] },
    envVars: ['PW_KAFKA_BROKERS'],
};

const redisFixture: FixtureMetadata = {
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
};

const mobilewrightFixture: FixtureMetadata = {
    name: 'mobilewright',
    dependencies: { 'mobilewright': '^0.0.35', '@mobilewright/test': '^0.0.35' },
    registryEntries: ['mobilewrightDevice', 'mobilewrightScreen'],
    importPath: './mobilewright.fixture',
    exportedObject: 'mobilewrightFixture',
    configTemplate: { platform: 'ios', bundleId: '', deviceName: '', appPath: '' },
    envVars: ['PW_MOBILE_PLATFORM', 'PW_MOBILE_BUNDLE_ID', 'PW_MOBILE_DEVICE_NAME', 'PW_MOBILE_APP_PATH'],
};

test.describe('RegistryUpdater', () => {
    let updater: RegistryUpdater;

    test.beforeEach(() => {
        updater = new RegistryUpdater();
    });

    test.describe('isRegistered', () => {
        test('returns false when fixture is not in registry', () => {
            expect(updater.isRegistered(SAMPLE_REGISTRY, kafkaFixture)).toBe(false);
        });

        test('returns true when fixture import path is present', () => {
            const content = SAMPLE_REGISTRY.replace(
                '// CLI:IMPORTS',
                "// CLI:IMPORTS\nimport { kafkaFixture } from './kafka.fixture';",
            );
            expect(updater.isRegistered(content, kafkaFixture)).toBe(true);
        });

        test('returns false for a different fixture import path', () => {
            const content = SAMPLE_REGISTRY.replace(
                '// CLI:IMPORTS',
                "// CLI:IMPORTS\nimport { kafkaFixture } from './kafka.fixture';",
            );
            expect(updater.isRegistered(content, redisFixture)).toBe(false);
        });
    });

    test.describe('addFixture', () => {
        test('adds import statement at CLI:IMPORTS marker', () => {
            const result = updater.addFixture(SAMPLE_REGISTRY, kafkaFixture);
            expect(result).toContain("import { kafkaFixture } from './kafka.fixture';");
        });

        test('adds spread expression at CLI:FIXTURES marker', () => {
            const result = updater.addFixture(SAMPLE_REGISTRY, kafkaFixture);
            expect(result).toContain('    ...kafkaFixture,');
        });

        test('is idempotent — does not duplicate if already registered (Req 2.10, 3.5)', () => {
            const firstAdd = updater.addFixture(SAMPLE_REGISTRY, kafkaFixture);
            const secondAdd = updater.addFixture(firstAdd, kafkaFixture);
            expect(secondAdd).toBe(firstAdd);
        });

        test('adds redis fixture with internal dependency redisConfig (Req 3.1)', () => {
            const result = updater.addFixture(SAMPLE_REGISTRY, redisFixture);
            // Should have the redis import
            expect(result).toContain("import { redisFixture } from './redis.fixture';");
            // Should have the redisFixture spread
            expect(result).toContain('    ...redisFixture,');
            // Should have the redisConfig internal dependency definition
            expect(result).toContain('const redisConfig = {');
            // Should have the redisConfig spread
            expect(result).toContain('    ...redisConfig,');
        });

        test('adds mobilewright fixture with both entries (Req 3.2)', () => {
            const result = updater.addFixture(SAMPLE_REGISTRY, mobilewrightFixture);
            expect(result).toContain("import { mobilewrightFixture } from './mobilewright.fixture';");
            expect(result).toContain('    ...mobilewrightFixture,');
        });

        test('can add multiple fixtures sequentially', () => {
            let result = updater.addFixture(SAMPLE_REGISTRY, kafkaFixture);
            result = updater.addFixture(result, redisFixture);
            expect(result).toContain("import { kafkaFixture } from './kafka.fixture';");
            expect(result).toContain("import { redisFixture } from './redis.fixture';");
            expect(result).toContain('    ...kafkaFixture,');
            expect(result).toContain('    ...redisFixture,');
        });
    });

    test.describe('addInternalDependency', () => {
        test('adds dependency definition before allFixtures', () => {
            const dep: InternalDependency = {
                name: 'redisConfig',
                definition: '/* redisConfig fixture loaded from ConfigLoader */',
            };
            const result = updater.addInternalDependency(SAMPLE_REGISTRY, dep);
            expect(result).toContain('const redisConfig = {');
            expect(result).toContain('/* redisConfig fixture loaded from ConfigLoader */');
        });

        test('adds dependency spread at CLI:FIXTURES marker', () => {
            const dep: InternalDependency = {
                name: 'redisConfig',
                definition: '/* redisConfig fixture loaded from ConfigLoader */',
            };
            const result = updater.addInternalDependency(SAMPLE_REGISTRY, dep);
            expect(result).toContain('    ...redisConfig,');
        });

        test('is idempotent — does not duplicate existing dependency (Req 3.5)', () => {
            const dep: InternalDependency = {
                name: 'redisConfig',
                definition: '/* redisConfig fixture loaded from ConfigLoader */',
            };
            const firstAdd = updater.addInternalDependency(SAMPLE_REGISTRY, dep);
            const secondAdd = updater.addInternalDependency(firstAdd, dep);
            expect(secondAdd).toBe(firstAdd);
        });
    });
});
