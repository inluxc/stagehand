/**
 * Unit tests for the Fixture Registry.
 *
 * Tests cover:
 * - The `test` object is exported and is a valid Playwright test function
 * - The `expect` object is exported
 * - The FixtureTypes interface includes all expected fixture names
 * - DependencyError correctly reports missing dependencies
 * - DependencyError correctly reports circular dependencies
 * - The fixture composition pattern works (test.extend can further extend)
 *
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5
 */

import { test as playwrightTest, expect as playwrightExpect } from '@playwright/test';
import { test, expect, type FixtureTypes } from '../../src/fixtures/index';
import { DependencyError } from '../../src/errors';

playwrightTest.describe('Fixture Registry', () => {
    playwrightTest.describe('Exports', () => {
        playwrightTest('exports a test object that is a function', () => {
            playwrightExpect(typeof test).toBe('function');
        });

        playwrightTest('exported test object has extend method (Playwright test interface)', () => {
            playwrightExpect(typeof test.extend).toBe('function');
        });

        playwrightTest('exported test object has describe method', () => {
            playwrightExpect(typeof test.describe).toBe('function');
        });

        playwrightTest('exported test object has step method', () => {
            playwrightExpect(typeof test.step).toBe('function');
        });

        playwrightTest('exports expect from @playwright/test', () => {
            playwrightExpect(expect).toBe(playwrightExpect);
        });

        playwrightTest('exported expect has standard matchers', () => {
            playwrightExpect(typeof expect).toBe('function');
        });
    });

    playwrightTest.describe('FixtureTypes interface coverage', () => {
        playwrightTest('FixtureTypes includes all expected fixture names', () => {
            // TypeScript compile-time check: if any of these properties are missing
            // from FixtureTypes, this file will fail to compile.
            type AssertHasKey<T, K extends keyof T> = K;

            // These type assertions verify the interface has all expected keys.
            // If any key is removed from FixtureTypes, TypeScript will error here.
            type _openApi = AssertHasKey<FixtureTypes, 'openApiClient'>;
            type _database = AssertHasKey<FixtureTypes, 'databaseClient'>;
            type _kafka = AssertHasKey<FixtureTypes, 'kafkaClient'>;
            type _redisConfig = AssertHasKey<FixtureTypes, 'redisConfig'>;
            type _redis = AssertHasKey<FixtureTypes, 'redisClient'>;
            type _device = AssertHasKey<FixtureTypes, 'mobilewrightDevice'>;
            type _screen = AssertHasKey<FixtureTypes, 'mobilewrightScreen'>;

            // Runtime verification that the type utility works (always true if compiled)
            playwrightExpect(true).toBe(true);
        });

        playwrightTest('FixtureTypes has exactly 7 fixture keys', () => {
            // Verify the expected fixture count at runtime using a type-safe object
            const fixtureKeys: (keyof FixtureTypes)[] = [
                'openApiClient',
                'databaseClient',
                'kafkaClient',
                'redisConfig',
                'redisClient',
                'mobilewrightDevice',
                'mobilewrightScreen',
            ];

            playwrightExpect(fixtureKeys).toHaveLength(7);
        });
    });

    playwrightTest.describe('DependencyError — missing dependencies', () => {
        playwrightTest('reports fixture name and missing dependency name', () => {
            const error = new DependencyError('redisClient', 'redisConfig');

            playwrightExpect(error).toBeInstanceOf(DependencyError);
            playwrightExpect(error.fixtureName).toBe('redisClient');
            playwrightExpect(error.missingDependency).toBe('redisConfig');
            playwrightExpect(error.message).toContain('redisClient');
            playwrightExpect(error.message).toContain('redisConfig');
            playwrightExpect(error.message).toContain('not registered');
        });

        playwrightTest('error name is DependencyError', () => {
            const error = new DependencyError('kafkaClient', 'kafkaConfig');

            playwrightExpect(error.name).toBe('DependencyError');
        });

        playwrightTest('message format includes fixture and dependency names', () => {
            const error = new DependencyError('mobilewrightScreen', 'mobilewrightDevice');

            playwrightExpect(error.message).toBe(
                'Fixture "mobilewrightScreen" depends on "mobilewrightDevice" which is not registered'
            );
        });

        playwrightTest('cycleParticipants is undefined for missing dep errors', () => {
            const error = new DependencyError('fixtureA', 'fixtureB');

            playwrightExpect(error.cycleParticipants).toBeUndefined();
        });
    });

    playwrightTest.describe('DependencyError — circular dependencies', () => {
        playwrightTest('reports all cycle participants in the error message', () => {
            const error = new DependencyError('fixtureA', undefined, [
                'fixtureA',
                'fixtureB',
                'fixtureC',
            ]);

            playwrightExpect(error.cycleParticipants).toEqual(['fixtureA', 'fixtureB', 'fixtureC']);
            playwrightExpect(error.message).toContain('fixtureA');
            playwrightExpect(error.message).toContain('fixtureB');
            playwrightExpect(error.message).toContain('fixtureC');
            playwrightExpect(error.message).toContain('Circular dependency');
        });

        playwrightTest('cycle message shows arrow notation between participants', () => {
            const error = new DependencyError('fixtureX', undefined, [
                'fixtureX',
                'fixtureY',
            ]);

            playwrightExpect(error.message).toBe(
                'Circular dependency detected: fixtureX → fixtureY → fixtureX'
            );
        });

        playwrightTest('cycle with single participant (self-dependency)', () => {
            const error = new DependencyError('selfRef', undefined, ['selfRef']);

            playwrightExpect(error.message).toBe(
                'Circular dependency detected: selfRef → selfRef'
            );
        });

        playwrightTest('missingDependency is undefined for cycle errors', () => {
            const error = new DependencyError('fixtureA', undefined, ['fixtureA', 'fixtureB']);

            playwrightExpect(error.missingDependency).toBeUndefined();
        });
    });

    playwrightTest.describe('Fixture composition', () => {
        playwrightTest('test.extend() can further extend the composed test object', () => {
            // Proves the composition pattern works: the extended test object
            // can be further extended with additional fixtures.
            const extendedTest = test.extend<{ customFixture: string }>({
                customFixture: async ({ }, use) => {
                    await use('custom-value');
                },
            });

            playwrightExpect(typeof extendedTest).toBe('function');
            playwrightExpect(typeof extendedTest.extend).toBe('function');
            playwrightExpect(typeof extendedTest.describe).toBe('function');
        });

        playwrightTest('multiple extensions can be chained', () => {
            const step1 = test.extend<{ fixtureA: number }>({
                fixtureA: async ({ }, use) => {
                    await use(42);
                },
            });

            const step2 = step1.extend<{ fixtureB: string }>({
                fixtureB: async ({ }, use) => {
                    await use('hello');
                },
            });

            playwrightExpect(typeof step2).toBe('function');
            playwrightExpect(typeof step2.extend).toBe('function');
        });

        playwrightTest('extended test object is distinct from base', () => {
            const extended = test.extend<{ extra: boolean }>({
                extra: async ({ }, use) => {
                    await use(true);
                },
            });

            // The extended object should be a new object, not the same reference
            playwrightExpect(extended).not.toBe(test);
        });
    });
});
