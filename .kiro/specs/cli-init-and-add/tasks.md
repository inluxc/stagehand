# Implementation Plan: CLI Init and Add Commands

## Overview

Implement two CLI commands (`init` and `add`) for the Playwright Framework Template. The CLI is structured as a Node.js binary entry point with a hand-rolled argument parser, fixture metadata registry, secrets provider metadata, prompt manager, template engine, registry updater, and file writer with rollback support. All components are implemented in TypeScript under `src/cli/`.

## Tasks

- [x] 1. Set up CLI project structure and core types
  - [x] 1.1 Create CLI directory structure and configure bin entry point
    - Create `src/cli/` directory with subdirectories `commands/` and `templates/`
    - Add `"bin": { "playwright-framework": "./src/cli/index.ts" }` to `package.json`
    - Add `@inquirer/prompts` to dependencies in `package.json`
    - Add shebang `#!/usr/bin/env node` support (via ts-node or tsx for development)
    - _Requirements: 6.1_

  - [x] 1.2 Implement fixture metadata registry at `src/cli/fixtures-metadata.ts`
    - Define `FixtureMetadata` and `InternalDependency` interfaces
    - Implement `FIXTURE_METADATA` constant with entries for: openapi, database, kafka, redis, mobilewright
    - Include `dependencies`, `registryEntries`, `importPath`, `exportedObject`, `configTemplate`, `envVars`, and `internalDependencies` for each fixture
    - Export helper functions: `getFixtureNames()`, `getFixtureMetadata(name)`
    - _Requirements: 3.3, 3.1, 3.2_

  - [x] 1.3 Implement secrets provider metadata at `src/cli/secrets-metadata.ts`
    - Define `SecretsProviderMetadata` interface
    - Implement `SECRETS_PROVIDERS` constant with entries for: aws, azure, env-file, gitlab, vault
    - Include `envVars` and `optionsTemplate` for each provider
    - Export helper functions: `getProviderNames()`, `getProviderMetadata(name)`
    - _Requirements: 5.1, 5.3_

- [x] 2. Implement CLI entry point and argument parser
  - [x] 2.1 Implement argument parser and command router at `src/cli/index.ts`
    - Implement `parseArgs(argv: string[]): ParsedArgs` function to parse command, positional args, and flags
    - Support flags: `--help`, `--version`, `--yes`, `--fixtures <list>`, `--secrets-provider <name>`
    - Implement `run(options)` function that routes to init/add handlers or prints help/version
    - Handle unrecognized commands with non-zero exit code and help text
    - Read version from `package.json` for `--version` output
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 2.2 Write property test for command routing (Property 10)
    - **Property 10: Unrecognized command rejection**
    - For any string not in {init, add, --help, --version}, the router rejects with non-zero exit and help text
    - **Validates: Requirements 6.5**

  - [x] 2.3 Write property test for flag parsing (Property 9)
    - **Property 9: --fixtures flag parsing produces correct fixture set**
    - For any comma-separated string of valid fixture names with arbitrary whitespace/casing, parser produces normalized lowercase array
    - **Validates: Requirements 4.2**

- [x] 3. Implement prompt manager
  - [x] 3.1 Implement prompt manager at `src/cli/prompts.ts`
    - Implement `selectFixtures(available: string[]): Promise<string[]>` using `@inquirer/prompts` checkbox
    - Implement `selectFixture(available: string[]): Promise<string>` using `@inquirer/prompts` select
    - Implement `selectSecretsProvider(available: string[], defaultValue: string): Promise<string>` using select with default
    - Implement `isInteractive(): boolean` checking `process.stdin.isTTY`
    - Handle non-TTY + no `--yes` flag by throwing error with guidance message
    - _Requirements: 4.1, 4.4, 4.5, 4.6_

  - [x] 3.2 Write unit tests for prompt manager
    - Test TTY detection logic
    - Test non-TTY without --yes throws appropriate error
    - Test --yes flag bypasses prompts and selects all fixtures
    - _Requirements: 4.5, 4.6_

- [x] 4. Implement template engine
  - [x] 4.1 Implement template functions at `src/cli/templates/index.ts`
    - Implement `generatePackageJson(fixtures, projectName?)` — produces package.json with only selected fixture dependencies
    - Implement `generateTsConfig()` — produces tsconfig.json matching framework conventions
    - Implement `generatePlaywrightConfig()` — produces default playwright.config.ts
    - Implement `generateEnvironmentsJson(fixtures, secretsProvider)` — produces environments.json with local env config
    - Implement `generateEnvExample(fixtures, secretsProvider)` — produces .env.local.example with relevant env vars
    - Implement `generateFixtureRegistry(fixtures)` — produces src/fixtures/index.ts with imports and allFixtures composition
    - Implement `generateBarrelFile(fixtures)` — produces src/index.ts re-exporting selected modules
    - Implement `generateErrorsFile()` — produces src/errors.ts with framework error classes
    - Implement `generateConfigModules()` — produces env-loader.ts, schema.ts, loader.ts, and config/index.ts
    - Implement `generateFixtureFile(fixtureName)` — produces individual fixture file content
    - Implement `generateExampleTest(fixtureName)` — produces example test file content
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12_

  - [x] 4.2 Write property test for template generation — dependencies consistency (Property 1)
    - **Property 1: Init scaffolding produces dependencies consistent with fixture selection**
    - For any non-empty subset of fixtures, generated package.json contains exactly the union of npm dependencies from metadata
    - **Validates: Requirements 1.2, 3.3, 3.4**

  - [x] 4.3 Write property test for template generation — environment config consistency (Property 2)
    - **Property 2: Init scaffolding produces environment config consistent with fixture selection**
    - For any non-empty subset of fixtures and valid secrets provider, generated environments.json has correct structure
    - **Validates: Requirements 1.5, 5.2**

  - [x] 4.4 Write property test for template generation — env vars consistency (Property 3)
    - **Property 3: Init scaffolding produces env vars consistent with fixture and provider selection**
    - For any non-empty subset of fixtures and valid secrets provider, generated .env.local.example has exactly the correct env vars
    - **Validates: Requirements 1.6, 5.3**

  - [x] 4.5 Write property test for template generation — fixture registry consistency (Property 4)
    - **Property 4: Init scaffolding produces a fixture registry consistent with selection**
    - For any non-empty subset of fixtures, generated registry imports and spreads exactly the selected fixtures
    - **Validates: Requirements 1.7, 1.8, 3.1, 3.2**

  - [x] 4.6 Write property test for template generation — barrel file consistency (Property 5)
    - **Property 5: Init scaffolding produces a barrel file consistent with selection**
    - For any non-empty subset of fixtures, generated barrel file re-exports exactly the selected modules
    - **Validates: Requirements 1.11**

- [x] 5. Implement file writer and registry updater
  - [x] 5.1 Implement file writer at `src/cli/file-writer.ts`
    - Implement `write(filePath, content)` with tracking for rollback
    - Implement `ensureDir(dirPath)` for directory creation
    - Implement `exists(filePath)` for existence checks
    - Implement `read(filePath)` for reading existing files
    - Implement `update(filePath, modifier)` for read-modify-write operations
    - Implement `rollback()` to remove all files written in current session
    - _Requirements: 1.16, 3.6_

  - [x] 5.2 Implement registry updater at `src/cli/registry-updater.ts`
    - Implement `isRegistered(registryContent, fixture)` to check if fixture already exists
    - Implement `addFixture(registryContent, fixture)` to insert import and spread into allFixtures
    - Implement `addInternalDependency(registryContent, dep)` for internal deps like redisConfig
    - Use marker comments (`// CLI:IMPORTS`, `// CLI:FIXTURES`) for insertion points
    - _Requirements: 2.5, 2.10, 3.1, 3.2, 3.5_

  - [x] 5.3 Write property test for registry updater idempotence (Property 7)
    - **Property 7: Add command registry update is idempotent**
    - For any valid fixture and existing registry content, applying update when already registered produces same content
    - **Validates: Requirements 2.5, 2.10, 3.5**

  - [x] 5.4 Write property test for dependency update — no duplicates (Property 8)
    - **Property 8: Add command dependency update produces no duplicates**
    - For any valid fixture and existing package.json, dependency update results in all packages present exactly once
    - **Validates: Requirements 2.6, 3.4, 3.5**

  - [x] 5.5 Write unit tests for file writer
    - Test write tracks files for rollback
    - Test rollback removes all written files
    - Test update preserves original on failure
    - _Requirements: 1.16, 3.6_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement init command handler
  - [x] 7.1 Implement init command at `src/cli/commands/init.ts`
    - Implement `InitCommand` class with constructor accepting metadata, secrets metadata, prompt manager, and file writer
    - Implement `validateTargetDir(dir)` — abort if package.json exists
    - Implement `resolveFixtures(options)` — use flag, prompt, or --yes default (all fixtures)
    - Implement `resolveSecretsProvider(options)` — use flag, prompt, or default (env-file)
    - Implement `generateFiles(fixtures, secrets, dir)` — orchestrate template engine to write all scaffold files
    - Implement `printSummary(generatedFiles)` — list generated files and next steps
    - Implement `rollback(generatedFiles)` — delegate to file writer on failure
    - Validate at least one fixture selected, abort with error if zero
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 5.1, 5.2, 5.3, 5.6_

  - [x] 7.2 Write unit tests for init command
    - Test abort when package.json exists (Requirement 1.13)
    - Test abort with zero fixtures selected (Requirement 1.15)
    - Test --yes selects all fixtures (Requirement 4.5)
    - Test --fixtures flag bypasses prompt (Requirement 4.2)
    - Test --secrets-provider flag bypasses prompt (Requirement 5.4)
    - Test rollback on file write failure (Requirement 1.16)
    - Test summary output lists all generated files (Requirement 1.14)
    - _Requirements: 1.13, 1.14, 1.15, 1.16, 4.2, 4.5, 5.4_

- [x] 8. Implement add command handler
  - [x] 8.1 Implement add command at `src/cli/commands/add.ts`
    - Implement `AddCommand` class with constructor accepting metadata, prompt manager, file writer, and registry updater
    - Implement `validateProjectStructure(dir)` — check for src/fixtures/, package.json, environments.json
    - Implement `resolveFixtureName(options)` — use argument or prompt
    - Implement `validateFixtureName(name)` — case-insensitive validation against supported set
    - Implement `generateFixtureFile(fixture, dir)` — write fixture file, skip if exists with warning
    - Implement `generateExampleTest(fixture, dir)` — write example test, skip if exists with warning
    - Implement `updateRegistry(fixture, dir)` — delegate to registry updater, skip if already registered
    - Implement `updatePackageJson(fixture, dir)` — add dependencies with pinned versions, skip duplicates
    - Implement `updateEnvironmentsJson(fixture, dir)` — add config entry to local environment
    - Implement `printSummary(created, modified, skipped)` — list changes and install reminder
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.4, 3.5, 3.6_

  - [x] 8.2 Write property test for fixture name validation (Property 6)
    - **Property 6: Fixture name validation accepts valid names case-insensitively and rejects invalid names**
    - For any string, validator accepts iff lowercase matches supported fixture name, rejects otherwise with valid names list
    - **Validates: Requirements 2.1, 2.2, 4.3**

  - [x] 8.3 Write property test for secrets provider validation (Property 11)
    - **Property 11: Secrets provider validation**
    - For any string, validator accepts iff lowercase matches supported provider, rejects otherwise with valid providers list
    - **Validates: Requirements 5.4, 5.5**

  - [x] 8.4 Write unit tests for add command
    - Test validation rejects unsupported fixture name with valid names list (Requirement 2.2)
    - Test validation rejects missing project structure (Requirement 2.3)
    - Test skips existing fixture file with warning (Requirement 2.9)
    - Test skips already-registered fixture with warning (Requirement 2.10)
    - Test adds redis with redisConfig internal dependency (Requirement 3.1)
    - Test adds mobilewright with both device and screen entries (Requirement 3.2)
    - Test summary includes install reminder (Requirement 2.11)
    - _Requirements: 2.2, 2.3, 2.9, 2.10, 3.1, 3.2, 2.11_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Wire CLI together and integration tests
  - [x] 10.1 Wire command handlers into CLI entry point
    - Import and instantiate `InitCommand` and `AddCommand` in `src/cli/index.ts`
    - Connect parsed args to appropriate command handler `execute()` method
    - Ensure proper error handling with exit codes for all error scenarios
    - Add process exit code handling for unhandled rejections
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 10.2 Write integration tests for full CLI flows
    - Test full init flow: run CLI → verify all scaffold files generated with correct content
    - Test full add flow: run CLI on existing project → verify file modifications
    - Test init + add sequence: init project then add fixture → verify combined result
    - Test --help and --version output
    - Test error scenarios: existing project, invalid fixture, missing structure
    - _Requirements: 1.1–1.16, 2.1–2.11, 6.1–6.6_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The template engine uses pure functions (no file-based templates) for testability
- The registry updater uses marker comments for reliable string-based insertion
- The file writer tracks all writes for rollback support during init

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1", "5.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.1", "5.3", "5.4", "5.5"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "7.1"] },
    { "id": 4, "tasks": ["7.2", "8.1"] },
    { "id": 5, "tasks": ["8.2", "8.3", "8.4", "10.1"] },
    { "id": 6, "tasks": ["10.2"] }
  ]
}
```
