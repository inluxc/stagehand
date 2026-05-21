/**
 * Fixture Registry — composes all fixture definitions into a single extended Playwright test object.
 *
 * This module is the central composition point for the framework's fixture architecture.
 * It uses Playwright's native `test.extend()` to combine all fixture definitions,
 * enabling tests to declaratively request any fixture by name.
 *
 * Configuration can be provided in two ways:
 *   1. Via project `use` block in playwright.config.ts (recommended)
 *   2. Via environment variables / ConfigLoader (fallback)
 *
 * Usage:
 *   import { test, expect } from '../src/fixtures';
 *
 *   test('my test', async ({ openApiClient, databaseClient }) => {
 *     // fixtures are automatically initialized and torn down
 *   });
 *
 * @requirements 1.1, 1.2, 1.3
 */

import { test as base } from '@playwright/test';
import type { Fixtures } from '@playwright/test';
import type {
    OpenApiFixtureConfig,
    DatabaseFixtureConfig,
    KafkaFixtureConfig,
    RedisFixtureConfig,
    MongoDbFixtureConfig,
    MobilewrightFixtureConfig,
    OtpFixtureConfig,
} from '../config/schema';
import { openApiFixture, type OpenApiClient } from './openapi.fixture';
import { databaseFixture, type DatabaseClient } from './database.fixture';
import { kafkaFixture, type KafkaClient } from './kafka.fixture';
import { redisFixture, type RedisClient } from './redis.fixture';
import { mobilewrightFixture, type MobilewrightScreen, type MobilewrightDevice } from './mobilewright.fixture';
import { mongoDbFixture, type MongoDbClient } from './mongodb.fixture';
import { otpFixture, type OtpClient } from './otp.fixture';

/**
 * Configuration options that can be passed via project `use` block.
 * These are fixture options with default values (undefined), meaning
 * they are optional and fall back to ConfigLoader when not provided.
 */
export interface ConfigOptions {
    openapi: OpenApiFixtureConfig | undefined;
    database: DatabaseFixtureConfig | undefined;
    kafka: KafkaFixtureConfig | undefined;
    redis: RedisFixtureConfig | undefined;
    mongodb: MongoDbFixtureConfig | undefined;
    mobilewright: MobilewrightFixtureConfig | undefined;
    otp: OtpFixtureConfig | undefined;
}

/**
 * Combined fixture types for the extended test object.
 * Each property corresponds to a fixture name available in test functions.
 */
export interface FixtureTypes {
    openApiClient: OpenApiClient;
    databaseClient: DatabaseClient;
    kafkaClient: KafkaClient;
    redisConfig: RedisFixtureConfig;
    redisClient: RedisClient;
    mongoDbClient: MongoDbClient;
    mobilewrightDevice: MobilewrightDevice;
    mobilewrightScreen: MobilewrightScreen;
    otpConfig: OtpFixtureConfig;
    otpClient: OtpClient;
}

/**
 * Config option fixtures — these are declared as Playwright fixture options
 * with [value, { option: true }] so they can be set from the project `use` block.
 *
 * When a config option is provided via the project, it takes precedence.
 * When undefined (default), fixtures fall back to ConfigLoader / env vars.
 */
const configOptionFixtures = {
    openapi: [undefined as OpenApiFixtureConfig | undefined, { option: true }],
    database: [undefined as DatabaseFixtureConfig | undefined, { option: true }],
    kafka: [undefined as KafkaFixtureConfig | undefined, { option: true }],
    redis: [undefined as RedisFixtureConfig | undefined, { option: true }],
    mongodb: [undefined as MongoDbFixtureConfig | undefined, { option: true }],
    mobilewright: [undefined as MobilewrightFixtureConfig | undefined, { option: true }],
    otp: [undefined as OtpFixtureConfig | undefined, { option: true }],
};

/**
 * The redisConfig fixture loads Redis configuration from the project config option
 * or falls back to ConfigLoader.
 */
const redisConfigFixture = {
    redisConfig: async (
        { redis }: { redis: RedisFixtureConfig | undefined },
        use: (config: RedisFixtureConfig) => Promise<void>,
    ) => {
        if (redis) {
            await use(redis);
            return;
        }

        // Fallback: load from ConfigLoader
        const { ConfigLoader } = await import('../config/loader');
        const loader = new ConfigLoader();
        const frameworkConfig = loader.load();

        if (!frameworkConfig.redis) {
            const { FixtureInitError } = await import('../errors');
            throw new FixtureInitError('redis', 'connect', {
                reason: 'Redis configuration is missing. Provide redis config in environments.json, environment variables, or project use block.',
            });
        }

        await use(frameworkConfig.redis);
    },
};

/**
 * The otpConfig fixture loads OTP configuration from the project config option
 * or falls back to ConfigLoader.
 */
const otpConfigFixture = {
    otpConfig: async (
        { otp }: { otp: OtpFixtureConfig | undefined },
        use: (config: OtpFixtureConfig) => Promise<void>,
    ) => {
        if (otp) {
            await use(otp);
            return;
        }

        // Fallback: load from ConfigLoader
        const { ConfigLoader } = await import('../config/loader');
        const loader = new ConfigLoader();
        const frameworkConfig = loader.load();

        // OTP config is optional — use empty config (no default secret) if not provided
        await use(frameworkConfig.otp ?? {});
    },
};

/**
 * All fixture definitions combined into a single object.
 *
 * Fixtures declare dependencies by listing other fixture names as parameters,
 * and Playwright's native fixture system handles dependency resolution:
 * - `redisClient` depends on `redisConfig`
 * - `mobilewrightScreen` depends on `mobilewrightDevice`
 *
 * Config options are declared with { option: true } so they can be set
 * from the project `use` block in playwright.config.ts.
 *
 * Note: We use a type assertion here because spreading fixture objects that mix
 * tuple-style definitions (e.g., [fn, { scope: 'test' }]) with plain function
 * definitions causes TypeScript to lose tuple type information. The runtime
 * behavior is correct — Playwright handles both formats natively.
 */
const allFixtures = {
    ...configOptionFixtures,
    ...openApiFixture,
    ...databaseFixture,
    ...kafkaFixture,
    ...redisConfigFixture,
    ...redisFixture,
    ...mongoDbFixture,
    ...mobilewrightFixture,
    ...otpConfigFixture,
    ...otpFixture,
};

/**
 * Extended Playwright test object with all framework fixtures composed.
 */
export const test = base.extend<FixtureTypes & ConfigOptions>(allFixtures as unknown as Fixtures<FixtureTypes & ConfigOptions>);

export { expect } from '@playwright/test';

// Re-export fixture client types for consumer convenience
export type { OpenApiClient } from './openapi.fixture';
export type { DatabaseClient } from './database.fixture';
export type { KafkaClient } from './kafka.fixture';
export type { RedisClient } from './redis.fixture';
export type { MongoDbClient } from './mongodb.fixture';
export type { MobilewrightScreen, MobilewrightDevice } from './mobilewright.fixture';
export type { OtpClient } from './otp.fixture';
