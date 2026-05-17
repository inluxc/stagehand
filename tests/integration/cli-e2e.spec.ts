/**
 * Integration tests for full CLI flows.
 *
 * Exercises the complete init and add command flows by:
 * - Using a temporary directory as the working directory
 * - Directly importing and calling parseArgs/run from the CLI entry point
 * - Instantiating InitCommand and AddCommand with real dependencies
 *
 * @requirements 1.1–1.16, 2.1–2.11, 6.1–6.6
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parseArgs, run } from '../../src/cli/index';
import { InitCommand } from '../../src/cli/commands/init';
import { AddCommand } from '../../src/cli/commands/add';
import { FileWriter } from '../../src/cli/file-writer';
import { RegistryUpdater } from '../../src/cli/registry-updater';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';
import { SECRETS_PROVIDERS } from '../../src/cli/secrets-metadata';
import type { IPromptManager } from '../../src/cli/prompts';

/**
 * Creates a non-interactive prompt manager that returns preconfigured values.
 */
function createMockPromptManager(overrides?: {
    selectFixtures?: (available: string[]) => Promise<string[]>;
    selectFixture?: (available: string[]) => Promise<string>;
    selectSecretsProvider?: (available: string[], defaultValue: string) => Promise<string>;
    isInteractive?: () => boolean;
}): IPromptManager {
    return {
        selectFixtures: overrides?.selectFixtures ?? (async (available) => available),
        selectFixture: overrides?.selectFixture ?? (async (available) => available[0]),
        selectSecretsProvider: overrides?.selectSecretsProvider ?? (async (_available, defaultValue) => defaultValue),
        isInteractive: overrides?.isInteractive ?? (() => true),
    };
}

let tmpDir: string;
let consoleOutput: string[];
let consoleErrorOutput: string[];
let consoleWarnOutput: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let originalExitCode: typeof process.exitCode;

test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-e2e-test-'));

    originalLog = console.log;
    originalError = console.error;
    originalWarn = console.warn;
    originalExitCode = process.exitCode;
    consoleOutput = [];
    consoleErrorOutput = [];
    consoleWarnOutput = [];
    console.log = (...args: unknown[]) => { consoleOutput.push(args.join(' ')); };
    console.error = (...args: unknown[]) => { consoleErrorOutput.push(args.join(' ')); };
    console.warn = (...args: unknown[]) => { consoleWarnOutput.push(args.join(' ')); };
    process.exitCode = undefined;
});

test.afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
    process.exitCode = originalExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test.describe('CLI Integration: Full init flow', () => {
    test('init with --yes generates all scaffold files with correct content', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await cmd.execute({ targetDir: tmpDir, yes: true });

        // Verify all expected files exist
        const expectedFiles = [
            'package.json',
            'tsconfig.json',
            'playwright.config.ts',
            'environments.json',
            '.env.local.example',
            'src/fixtures/index.ts',
            'src/fixtures/openapi.fixture.ts',
            'src/fixtures/database.fixture.ts',
            'src/fixtures/kafka.fixture.ts',
            'src/fixtures/redis.fixture.ts',
            'src/fixtures/mobilewright.fixture.ts',
            'src/config/env-loader.ts',
            'src/config/schema.ts',
            'src/config/loader.ts',
            'src/config/index.ts',
            'src/errors.ts',
            'src/index.ts',
            'tests/examples/openapi.spec.ts',
            'tests/examples/database.spec.ts',
            'tests/examples/kafka.spec.ts',
            'tests/examples/redis.spec.ts',
            'tests/examples/mobilewright.spec.ts',
        ];

        for (const file of expectedFiles) {
            const filePath = path.join(tmpDir, file);
            expect(fs.existsSync(filePath), `Expected file to exist: ${file}`).toBe(true);
        }
    });

    test('init generates package.json with correct dependencies for selected fixtures', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,kafka', yes: true });

        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));

        // Should have base dependencies
        expect(pkg.dependencies['@playwright/test']).toBeDefined();
        expect(pkg.dependencies['dotenv']).toBeDefined();
        expect(pkg.dependencies['fast-check']).toBeDefined();

        // Should have openapi dependency
        expect(pkg.dependencies['openapi-client-axios']).toBe('^7.5.5');

        // Should have kafka dependency
        expect(pkg.dependencies['kafkajs']).toBe('^2.2.4');

        // Should NOT have database, redis, or mobilewright dependencies
        expect(pkg.dependencies['pg']).toBeUndefined();
        expect(pkg.dependencies['ioredis']).toBeUndefined();
        expect(pkg.dependencies['mobilewright']).toBeUndefined();
    });

    test('init generates environments.json with correct structure', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,database', secretsProvider: 'aws' });

        const envJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8'));

        // Should have environments.local structure
        expect(envJson.environments).toBeDefined();
        expect(envJson.environments.local).toBeDefined();

        // Should have openapi config
        expect(envJson.environments.local.openapi).toEqual({
            specPath: './specs/api.yaml',
            baseUrl: 'http://localhost:3000',
        });

        // Should have database config
        expect(envJson.environments.local.database).toEqual({
            type: 'postgresql',
            host: 'localhost',
            port: 5432,
            database: 'testdb',
            username: '',
            password: '',
        });

        // Should have secrets config with aws provider
        expect(envJson.environments.local.secrets).toEqual({
            provider: 'aws',
            options: { region: '', secretPrefix: '' },
            keyMappings: {},
        });
    });

    test('init generates fixture registry with correct imports and composition', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,redis', yes: true });

        const registry = fs.readFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), 'utf-8');

        // Should import selected fixtures
        expect(registry).toContain("import { openApiFixture } from './openapi.fixture'");
        expect(registry).toContain("import { redisFixture } from './redis.fixture'");

        // Should spread fixtures into allFixtures
        expect(registry).toContain('...openApiFixture');
        expect(registry).toContain('...redisFixture');

        // Should include CLI markers for future add operations
        expect(registry).toContain('// CLI:IMPORTS');
        expect(registry).toContain('// CLI:FIXTURES');
    });

    test('init generates .env.local.example with correct env vars', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await cmd.execute({ targetDir: tmpDir, fixtures: 'kafka', secretsProvider: 'vault' });

        const envExample = fs.readFileSync(path.join(tmpDir, '.env.local.example'), 'utf-8');

        // Should have kafka env vars
        expect(envExample).toContain('PW_KAFKA_BROKERS');

        // Should have vault provider env vars
        expect(envExample).toContain('VAULT_URL');
        expect(envExample).toContain('VAULT_MOUNT_PATH');

        // Should have general PW_ENVIRONMENT
        expect(envExample).toContain('PW_ENVIRONMENT=local');
    });
});

test.describe('CLI Integration: Full add flow', () => {
    test('add fixture to existing project creates fixture file and updates registry', async () => {
        // First, init a project with openapi
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const initCmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);
        await initCmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true });

        // Now add kafka fixture
        const addFileWriter = new FileWriter();
        const registryUpdater = new RegistryUpdater();
        const addCmd = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter, registryUpdater);
        await addCmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });

        // Verify kafka fixture file was created
        const kafkaFixturePath = path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts');
        expect(fs.existsSync(kafkaFixturePath)).toBe(true);
        const kafkaContent = fs.readFileSync(kafkaFixturePath, 'utf-8');
        expect(kafkaContent).toContain('kafkaFixture');

        // Verify kafka example test was created
        const kafkaTestPath = path.join(tmpDir, 'tests', 'examples', 'kafka.spec.ts');
        expect(fs.existsSync(kafkaTestPath)).toBe(true);

        // Verify package.json now includes kafkajs
        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
        expect(pkg.dependencies['kafkajs']).toBe('^2.2.4');

        // Verify environments.json now includes kafka config
        const envJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8'));
        expect(envJson.environments.local.kafka).toEqual({ brokers: ['localhost:9092'] });

        // Verify src/fixtures/index.ts now imports kafka
        const registry = fs.readFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), 'utf-8');
        expect(registry).toContain("import { kafkaFixture } from './kafka.fixture'");
        expect(registry).toContain('...kafkaFixture');
    });

    test('add fixture preserves existing dependencies in package.json', async () => {
        // Init with openapi
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const initCmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);
        await initCmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true });

        // Add database
        const addFileWriter = new FileWriter();
        const registryUpdater = new RegistryUpdater();
        const addCmd = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter, registryUpdater);
        await addCmd.execute({ fixtureName: 'database', targetDir: tmpDir });

        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));

        // Original openapi dependency should still be present
        expect(pkg.dependencies['openapi-client-axios']).toBe('^7.5.5');

        // New database dependencies should be added
        expect(pkg.dependencies['pg']).toBe('^8.13.0');
        expect(pkg.dependencies['mysql2']).toBe('^3.11.0');
        expect(pkg.dependencies['better-sqlite3']).toBe('^11.6.0');
    });
});

test.describe('CLI Integration: Init + add sequence', () => {
    test('init with openapi,database then add redis produces correct combined result', async () => {
        // Init with openapi and database
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const initCmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);
        await initCmd.execute({ targetDir: tmpDir, fixtures: 'openapi,database', yes: true });

        // Add redis
        const addFileWriter = new FileWriter();
        const registryUpdater = new RegistryUpdater();
        const addCmd = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter, registryUpdater);
        await addCmd.execute({ fixtureName: 'redis', targetDir: tmpDir });

        // Verify all 3 fixtures are present in the registry
        const registry = fs.readFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), 'utf-8');
        expect(registry).toContain("from './openapi.fixture'");
        expect(registry).toContain("from './database.fixture'");
        expect(registry).toContain("from './redis.fixture'");

        // Verify all fixture files exist
        expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'openapi.fixture.ts'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'database.fixture.ts'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'redis.fixture.ts'))).toBe(true);

        // Verify all dependencies are correct
        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
        expect(pkg.dependencies['openapi-client-axios']).toBe('^7.5.5');
        expect(pkg.dependencies['pg']).toBe('^8.13.0');
        expect(pkg.dependencies['mysql2']).toBe('^3.11.0');
        expect(pkg.dependencies['better-sqlite3']).toBe('^11.6.0');
        expect(pkg.dependencies['ioredis']).toBe('^5.4.1');

        // Verify environments.json has all 3 fixture configs
        const envJson = JSON.parse(fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8'));
        expect(envJson.environments.local.openapi).toBeDefined();
        expect(envJson.environments.local.database).toBeDefined();
        expect(envJson.environments.local.redis).toBeDefined();
    });

    test('adding multiple fixtures sequentially produces correct combined result', async () => {
        // Init with openapi only
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const initCmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);
        await initCmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true });

        // Add kafka
        const addFileWriter1 = new FileWriter();
        const registryUpdater1 = new RegistryUpdater();
        const addCmd1 = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter1, registryUpdater1);
        await addCmd1.execute({ fixtureName: 'kafka', targetDir: tmpDir });

        // Add mobilewright
        const addFileWriter2 = new FileWriter();
        const registryUpdater2 = new RegistryUpdater();
        const addCmd2 = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter2, registryUpdater2);
        await addCmd2.execute({ fixtureName: 'mobilewright', targetDir: tmpDir });

        // Verify all 3 fixtures in registry
        const registry = fs.readFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), 'utf-8');
        expect(registry).toContain("from './openapi.fixture'");
        expect(registry).toContain("from './kafka.fixture'");
        expect(registry).toContain("from './mobilewright.fixture'");

        // Verify mobilewright has both entries
        expect(registry).toContain('...mobilewrightFixture');

        // Verify all dependencies
        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
        expect(pkg.dependencies['openapi-client-axios']).toBeDefined();
        expect(pkg.dependencies['kafkajs']).toBeDefined();
        expect(pkg.dependencies['mobilewright']).toBeDefined();
        expect(pkg.dependencies['@mobilewright/test']).toBeDefined();
    });
});

test.describe('CLI Integration: --help and --version output', () => {
    test('--help outputs usage text with exit code 0', async () => {
        const args = parseArgs(['--help']);
        await run(args);

        const output = consoleOutput.join('\n');
        expect(output).toContain('Usage: playwright-framework');
        expect(output).toContain('Commands:');
        expect(output).toContain('init');
        expect(output).toContain('add');
        expect(output).toContain('Options:');
        expect(process.exitCode).toBe(0);
    });

    test('--version outputs version number with exit code 0', async () => {
        const args = parseArgs(['--version']);
        await run(args);

        const output = consoleOutput.join('\n');
        expect(output).toContain('1.0.0');
        expect(process.exitCode).toBe(0);
    });

    test('init --help shows init-specific options', async () => {
        const args = parseArgs(['init', '--help']);
        await run(args);

        const output = consoleOutput.join('\n');
        expect(output).toContain('playwright-framework init');
        expect(output).toContain('--fixtures');
        expect(output).toContain('--secrets-provider');
        expect(output).toContain('--yes');
        expect(process.exitCode).toBe(0);
    });

    test('add --help shows add-specific options', async () => {
        const args = parseArgs(['add', '--help']);
        await run(args);

        const output = consoleOutput.join('\n');
        expect(output).toContain('playwright-framework add');
        expect(output).toContain('fixture');
        expect(output).toContain('--help');
        expect(process.exitCode).toBe(0);
    });
});

test.describe('CLI Integration: Error scenarios', () => {
    test('init in directory with existing package.json produces error', async () => {
        // Create a package.json to simulate existing project
        fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');

        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await expect(cmd.execute({ targetDir: tmpDir, yes: true })).rejects.toThrow(
            'A project already exists in this directory (package.json found).'
        );
        expect(process.exitCode).toBe(1);
        expect(consoleErrorOutput.join(' ')).toContain('package.json found');
    });

    test('add with invalid fixture name produces error with valid names', async () => {
        // First init a project
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const initCmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);
        await initCmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true });

        // Try to add an invalid fixture
        const addFileWriter = new FileWriter();
        const registryUpdater = new RegistryUpdater();
        const addCmd = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter, registryUpdater);

        await expect(
            addCmd.execute({ fixtureName: 'mongodb', targetDir: tmpDir })
        ).rejects.toThrow('Invalid fixture name "mongodb"');
        expect(process.exitCode).toBe(1);

        const errorOutput = consoleErrorOutput.join(' ');
        expect(errorOutput).toContain('mongodb');
        expect(errorOutput).toContain('database');
        expect(errorOutput).toContain('kafka');
        expect(errorOutput).toContain('openapi');
        expect(errorOutput).toContain('redis');
        expect(errorOutput).toContain('mobilewright');
    });

    test('add in directory without project structure produces error', async () => {
        // tmpDir is empty — no project structure
        const addFileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const registryUpdater = new RegistryUpdater();
        const addCmd = new AddCommand(FIXTURE_METADATA, mockPrompt, addFileWriter, registryUpdater);

        await expect(
            addCmd.execute({ fixtureName: 'kafka', targetDir: tmpDir })
        ).rejects.toThrow('Missing project structure');
        expect(process.exitCode).toBe(1);

        const errorOutput = consoleErrorOutput.join(' ');
        expect(errorOutput).toContain('Missing project structure');
    });

    test('unrecognized command produces error with help text', async () => {
        const args = parseArgs(['deploy']);
        await run(args);

        expect(process.exitCode).toBe(1);
        const errorOutput = consoleErrorOutput.join('\n');
        expect(errorOutput).toContain('Unrecognized command "deploy"');
        expect(errorOutput).toContain('Usage: playwright-framework');
    });

    test('init with invalid fixture in --fixtures flag produces error', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await expect(
            cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,invalid_fixture', yes: true })
        ).rejects.toThrow('Invalid fixture name "invalid_fixture"');
        expect(process.exitCode).toBe(1);
    });

    test('init with invalid secrets provider produces error', async () => {
        const fileWriter = new FileWriter();
        const mockPrompt = createMockPromptManager();
        const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

        await expect(
            cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', secretsProvider: 'nonexistent' })
        ).rejects.toThrow('Invalid secrets provider "nonexistent"');
        expect(process.exitCode).toBe(1);

        const errorOutput = consoleErrorOutput.join(' ');
        expect(errorOutput).toContain('aws');
        expect(errorOutput).toContain('azure');
        expect(errorOutput).toContain('env-file');
        expect(errorOutput).toContain('gitlab');
        expect(errorOutput).toContain('vault');
    });
});
