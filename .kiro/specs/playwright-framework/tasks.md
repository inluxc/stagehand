# Implementation Plan: Playwright Framework Template

## Overview

Implement a reusable Playwright test framework template with an extensible fixture architecture. The implementation follows a bottom-up approach: configuration layer first, then secrets, then individual fixtures, then the registry that composes them, and finally example tests and documentation. TypeScript strict mode is used throughout.

## Tasks

- [x] 1. Set up project structure and core types
  - [x] 1.1 Initialize project with package.json, tsconfig.json, and playwright.config.ts
    - Create `package.json` with dependencies: `@playwright/test`, `openapi-client-axios`, `pg`, `mysql2`, `better-sqlite3`, `kafkajs`, `ioredis`, `mobilewright`, `@mobilewright/test`, `fast-check`, `dotenv`
    - Add dev dependencies: `typescript`, `@types/pg`, `@types/better-sqlite3`, `@types/node`
    - Define scripts: `test` (run all tests), `test:tag` (run by tag), `typecheck` (tsc --noEmit)
    - Create `tsconfig.json` with strict mode enabled and module resolution compatible with Playwright
    - Create `playwright.config.ts` with 30s timeout, 0 retries, list reporter, and an API/integration project without a browser
    - _Requirements: 7.1, 7.2, 7.5_

  - [x] 1.2 Define core error types and configuration schema
    - Create `src/config/schema.ts` with `FrameworkConfig`, `OpenApiFixtureConfig`, `DatabaseFixtureConfig`, `KafkaFixtureConfig`, `RedisFixtureConfig`, `MobilewrightFixtureConfig`, `SecretsConfig`, and `EnvironmentsFile` interfaces
    - Create `src/errors.ts` with `FrameworkError`, `ConfigurationError`, `FixtureError` (split into `FixtureInitError` and `FixtureOperationError`), `SecretsError`, and `DependencyError` classes
    - Each error class must include all contextual fields specified in the design (host, port, SQL statement, topic, file path, platform, deviceName, etc.)
    - _Requirements: 2.4, 3.5, 3.6, 4.5, 4.7, 5.5, 6.3, 6.4, 8.7, 9.7_

  - [x] 1.3 Create environments.json with placeholder values and example .env files
    - Create `environments.json` with `local`, `dev`, `test`, `stg`, and `prod` environment entries containing placeholder values and descriptions
    - Create `.env.example`, `.env.local.example`, `.env.dev.example` with all supported `PW_*` environment variable keys and descriptions
    - _Requirements: 6.8, 6.9_

- [x] 2. Implement configuration layer
  - [x] 2.1 Implement EnvLoader for dotenv file parsing
    - Create `src/config/env-loader.ts` implementing the `EnvLoader` interface
    - Support parsing key-value pairs, comments (lines starting with `#`), empty lines, and quoted values (single/double quotes)
    - Return empty map if the `.env.{environment}` file does not exist (graceful fallback)
    - Do not set values into `process.env` — return parsed map only
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 2.2 Implement ConfigLoader with three-tier precedence
    - Create `src/config/loader.ts` implementing the `ConfigLoader` interface
    - Load `environments.json` from project root (tier 3 — lowest precedence)
    - Call `EnvLoader.load(environment)` for `.env.{environment}` file (tier 2 — medium precedence)
    - Read environment variables with `PW_` prefix (tier 1 — highest precedence)
    - Apply three-tier merge: env vars > .env file > environments.json
    - Select environment via `PW_ENVIRONMENT` env var or `--environment` CLI param
    - Throw `ConfigurationError` with missing keys if validation fails
    - Throw `ConfigurationError` with file path and parse error if environments.json is missing or invalid
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

  - [x] 2.3 Create config index re-exports
    - Create `src/config/index.ts` re-exporting `ConfigLoader`, `EnvLoader`, `FrameworkConfig`, and all config interfaces
    - _Requirements: 6.1_

  - [x] 2.4 Write property tests for config precedence (Properties 8 and 13)
    - **Property 8: Environment variable precedence over config file**
    - **Property 13: Three-tier config precedence**
    - Create `tests/properties/config-precedence.prop.ts` and `tests/properties/config-three-tier.prop.ts`
    - Use fast-check to generate arbitrary config keys and values across all three tiers
    - Verify env vars always win over .env file and config file; .env file wins over config file
    - **Validates: Requirements 6.1, 8.8**

  - [x] 2.5 Write unit tests for EnvLoader and ConfigLoader
    - Create `tests/unit/env-loader.spec.ts` testing: parse key-value pairs, handle comments, handle empty lines, handle quoted values, graceful fallback for missing file
    - Create `tests/unit/config-loader.spec.ts` testing: load from file, three-tier precedence, missing keys error, invalid JSON error, environment selection
    - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7_

- [x] 3. Checkpoint - Configuration layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement secrets provider library
  - [x] 4.1 Define SecretsProvider interface and SecretsManager
    - Create `src/secrets/provider.interface.ts` with `SecretsProvider` interface (name, getSecret, getSecrets methods)
    - Create `src/secrets/secrets-manager.ts` with `SecretsManager` class implementing resolve, getSecret, getSecrets, registerProvider
    - Implement caching: all fetched secrets cached for entire test runner invocation, subsequent requests return cached values without additional API calls
    - Apply configurable timeout (default 10s) to all provider API calls
    - Throw `SecretsError` for unrecognized provider, fetch failure/timeout, or invalid key mapping
    - _Requirements: 9.1, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10_

  - [x] 4.2 Implement secrets provider backends
    - Create `src/secrets/providers/aws.provider.ts` — AWS Secrets Manager via AWS SDK
    - Create `src/secrets/providers/gitlab.provider.ts` — GitLab CI/CD Variables via GitLab API
    - Create `src/secrets/providers/vault.provider.ts` — HashiCorp Vault via HTTP API
    - Create `src/secrets/providers/azure.provider.ts` — Azure Key Vault via Azure SDK
    - Create `src/secrets/providers/env-file.provider.ts` — Local .env file fallback for local development
    - Create `src/secrets/providers/index.ts` — Provider registry with built-in providers registered by default
    - _Requirements: 9.2, 9.3_

  - [x] 4.3 Create secrets index re-exports
    - Create `src/secrets/index.ts` re-exporting `SecretsProvider`, `SecretsManager`, and all provider classes
    - _Requirements: 9.5_

  - [x] 4.4 Write property tests for secrets caching and extensibility (Properties 11 and 12)
    - **Property 11: Secrets caching**
    - **Property 12: Secrets provider extensibility**
    - Create `tests/properties/secrets-caching.prop.ts` — verify subsequent requests for same key return cached value without additional provider calls
    - Create `tests/properties/secrets-extensibility.prop.ts` — verify custom providers implementing the interface are used when configured
    - **Validates: Requirements 9.5, 9.6**

  - [x] 4.5 Write unit tests for SecretsManager
    - Create `tests/unit/secrets-manager.spec.ts` testing: provider selection per environment, secret caching across requests, timeout handling, key mapping resolution, unrecognized provider error, invalid mapping error
    - _Requirements: 9.1, 9.4, 9.6, 9.7, 9.8, 9.9, 9.10_

- [x] 5. Checkpoint - Secrets layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement fixture modules
  - [x] 6.1 Implement OpenAPI client fixture
    - Create `src/fixtures/openapi.fixture.ts` implementing the OpenAPI fixture
    - Setup: Load OpenAPI spec (file or URL with 10s timeout) → Initialize `OpenAPIClientAxios` → Call `api.init()` → Return client with operation methods
    - Support base URL override from config (takes precedence over spec server URLs)
    - Teardown: Clear internal references
    - Throw `FixtureInitError` with spec path/URL and failure reason on load/parse failure
    - Init timeout of 30 seconds
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 6.2 Implement database connection fixture
    - Create `src/fixtures/database.fixture.ts` implementing the Database fixture
    - Setup: Read config → Create connection pool (pg/mysql2/better-sqlite3 based on type) → Verify connectivity with ping query
    - Expose `query<T>()` and `execute()` methods with configurable query timeout (default 30s)
    - Teardown: Drain connection pool → Close all connections
    - Throw `FixtureInitError` with host, port, timeout on connection failure
    - Throw `FixtureOperationError` with SQL statement on query failure
    - Connection timeout default: 10s
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 6.3 Implement Kafka integration fixture
    - Create `src/fixtures/kafka.fixture.ts` implementing the Kafka fixture
    - Setup: Create `Kafka` instance → Create producer (connect) → Create consumer with unique group ID (`test-{testId}-{timestamp}`) → Connect consumer
    - Expose `produce()` and `consume()` methods; consume returns empty array on timeout
    - Teardown: Disconnect producer → Disconnect consumer (within 5s timeout, force-close if exceeded)
    - Throw `FixtureInitError` with broker address on connection failure
    - Throw `FixtureOperationError` with topic on produce failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.4 Implement Redis integration fixture
    - Create `src/fixtures/redis.fixture.ts` implementing the Redis fixture
    - Setup: Create `ioredis` client → Verify connection with PING → If `keyPrefix` set, create separate subscriber client for pub/sub
    - Expose get, set, del, publish, subscribe methods; subscribe returns null after timeout (default 5s)
    - Teardown: If `keyPrefix` set, flush keys matching `{keyPrefix}*` → Disconnect subscriber → Quit main client
    - Connection timeout: 5s
    - Throw `FixtureInitError` with host, port on connection failure
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.5 Implement Mobilewright mobile testing fixture
    - Create `src/fixtures/mobilewright.fixture.ts` implementing the Mobilewright fixture
    - Setup: Read config → Boot device if not running → Install app → Create Mobilewright session → Provide `screen` and `device` objects
    - Expose screen object (getByText, getByLabel, getByTestId, getByRole, getByType, tap, doubleTap, longPress, fill, swipe, pressButton)
    - Expose device object (openUrl for deep links)
    - Teardown: Uninstall app → Release session (always attempt release even if uninstall fails)
    - Init timeout default: 60s
    - Throw `FixtureInitError` with platform, deviceName, appPath on boot/install failure
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [x] 6.6 Write property tests for fixtures (Properties 4, 5, 6, 7, 9, 10)
    - **Property 4: OperationId method mapping** — Create `tests/properties/operationid-mapping.prop.ts`
    - **Property 5: Base URL override precedence** — Create `tests/properties/base-url-override.prop.ts`
    - **Property 6: Unique consumer group ID generation** — Create `tests/properties/group-id-uniqueness.prop.ts`
    - **Property 7: Redis key prefix isolation on teardown** — Create `tests/properties/key-prefix-isolation.prop.ts`
    - **Property 9: Error descriptiveness** — Create `tests/properties/error-descriptiveness.prop.ts`
    - **Property 10: Mobilewright session isolation** — Create `tests/properties/mobilewright-session.prop.ts`
    - **Validates: Requirements 2.3, 2.6, 4.1, 5.4, 2.4, 3.5, 3.6, 4.5, 4.7, 5.5, 6.3, 6.4, 8.7, 8.5**

  - [x] 6.7 Write unit tests for all fixture modules
    - Create `tests/unit/openapi-fixture.spec.ts` — local file load, URL load, timeout, invalid spec, base URL override
    - Create `tests/unit/database-fixture.spec.ts` — driver selection (pg/mysql/sqlite), connection error formatting, query error formatting
    - Create `tests/unit/kafka-fixture.spec.ts` — group ID format, produce error formatting, consume timeout returns empty array
    - Create `tests/unit/redis-fixture.spec.ts` — key prefix matching, connection error formatting, subscribe timeout
    - Create `tests/unit/mobilewright-fixture.spec.ts` — session creation, device boot sequence, app install/uninstall, teardown on failure, error formatting
    - _Requirements: 2.1–2.6, 3.1–3.6, 4.1–4.7, 5.1–5.5, 8.1–8.7_

- [x] 7. Checkpoint - All fixtures implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Implement fixture registry and dependency resolution
  - [x] 8.1 Implement Fixture Registry composing all fixtures into extended test object
    - Create `src/fixtures/index.ts` using chained `test.extend<FixtureTypes>()` to compose all fixture definitions
    - Import and spread all fixture definitions (openapi, database, kafka, redis, mobilewright)
    - Export the extended `test` object and `expect` from `@playwright/test`
    - Fixtures declare dependencies by listing other fixture names as parameters (Playwright native resolution)
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 8.2 Create main entry point exporting the extended test object
    - Create `src/index.ts` re-exporting the extended `test` and `expect` from `src/fixtures/index.ts`
    - Also export config types, error types, and secrets interfaces for consumer use
    - _Requirements: 1.1, 1.2_

  - [x] 8.3 Write property tests for dependency resolution (Properties 1, 2, 3)
    - **Property 1: Fixture dependency resolution** — Create `tests/properties/dependency-resolution.prop.ts`
    - **Property 2: Circular dependency detection**
    - **Property 3: Unresolved dependency detection**
    - Use fast-check to generate arbitrary DAGs of fixture dependencies and verify resolution
    - Verify circular dependencies throw errors listing all cycle participants
    - Verify unresolved dependencies throw errors with fixture name and missing dep name
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5**

  - [x] 8.4 Write unit tests for fixture registry
    - Create `tests/unit/fixture-registry.spec.ts` testing: single fixture, multiple fixtures, dependencies, missing deps, cycles
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 9. Checkpoint - Registry and dependency resolution complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Create example tests and documentation
  - [x] 10.1 Create example test files for each fixture
    - Create `tests/examples/openapi.spec.ts` — demonstrate OpenAPI fixture initialization, calling an operation, and teardown
    - Create `tests/examples/database.spec.ts` — demonstrate Database fixture with query and execute
    - Create `tests/examples/kafka.spec.ts` — demonstrate Kafka produce and consume
    - Create `tests/examples/redis.spec.ts` — demonstrate Redis get/set/publish/subscribe
    - Create `tests/examples/mobilewright.spec.ts` — demonstrate Mobilewright screen and device usage
    - Create `tests/custom-fixture.example.ts` — demonstrate creating a custom fixture with the documented pattern
    - _Requirements: 7.3, 1.6_

  - [x] 10.2 Create README and custom fixtures documentation
    - Create `README.md` with sections: prerequisites, installation steps, environment configuration (table of all `PW_*` variables), how to run tests, and usage example for each fixture
    - Create `docs/custom-fixtures.md` with the documented pattern for creating custom fixtures including setup, teardown, dependency declaration, and a working example
    - _Requirements: 7.4, 1.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (13 properties total)
- Unit tests validate specific examples and edge cases
- Integration tests (requiring real infrastructure) are not included as tasks — they are run separately with Docker Compose
- The implementation uses TypeScript strict mode throughout as specified in the design
- All fixtures follow the Playwright `test.extend()` pattern for native dependency injection

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 3, "tasks": ["2.4", "2.5"] },
    { "id": 4, "tasks": ["4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] },
    { "id": 6, "tasks": ["4.4", "4.5"] },
    { "id": 7, "tasks": ["6.1", "6.2", "6.3", "6.4", "6.5"] },
    { "id": 8, "tasks": ["6.6", "6.7"] },
    { "id": 9, "tasks": ["8.1"] },
    { "id": 10, "tasks": ["8.2"] },
    { "id": 11, "tasks": ["8.3", "8.4"] },
    { "id": 12, "tasks": ["10.1", "10.2"] }
  ]
}
```
