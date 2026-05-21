/**
 * Main entry point for the Playwright Framework Template.
 *
 * Re-exports the extended test object, fixture client types, configuration types,
 * error classes, and secrets interfaces for consumer use.
 *
 * Usage:
 *   import { test, expect } from './src';
 *   import type { OpenApiClient, FrameworkConfig } from './src';
 *
 * @requirements 1.1, 1.2
 */

// Extended Playwright test object and expect
export { test, expect } from './fixtures';

// Fixture client types
export type {
    OpenApiClient,
    DatabaseClient,
    KafkaClient,
    RedisClient,
    MongoDbClient,
    MobilewrightScreen,
    MobilewrightDevice,
    OtpClient,
    FixtureTypes,
    ConfigOptions,
} from './fixtures';

// Configuration types and loaders
export type {
    FrameworkConfig,
    OpenApiFixtureConfig,
    DatabaseFixtureConfig,
    MongoDbFixtureConfig,
    KafkaFixtureConfig,
    RedisFixtureConfig,
    MobilewrightFixtureConfig,
    OtpFixtureConfig,
    SecretsConfig,
    EnvironmentsFile,
} from './config';
export { ConfigLoader } from './config';
export { EnvLoader } from './config';

// Error types
export {
    FrameworkError,
    ConfigurationError,
    FixtureInitError,
    FixtureOperationError,
    SecretsError,
    DependencyError,
} from './errors';

// Secrets interfaces
export type { SecretsProvider } from './secrets';
export { SecretsManager } from './secrets';
