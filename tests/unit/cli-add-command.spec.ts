/**
 * Unit tests for the AddCommand class.
 *
 * Tests cover:
 * - Validation rejects unsupported fixture name with valid names list (Requirement 2.2)
 * - Validation rejects missing project structure (Requirement 2.3)
 * - Skips existing fixture file with warning (Requirement 2.9)
 * - Skips already-registered fixture with warning (Requirement 2.10)
 * - Adds redis with redisConfig internal dependency (Requirement 3.1)
 * - Adds mobilewright with both device and screen entries (Requirement 3.2)
 * - Summary includes install reminder (Requirement 2.11)
 *
 * @requirements 2.2, 2.3, 2.9, 2.10, 3.1, 3.2, 2.11
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AddCommand } from '../../src/cli/commands/add';
import { FileWriter } from '../../src/cli/file-writer';
import { RegistryUpdater } from '../../src/cli/registry-updater';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';
import type { IPromptManager } from '../../src/cli/prompts';

/**
 * Creates a mock IPromptManager that returns preconfigured values.
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

/**
 * Creates a valid project structure in the given directory with CLI markers.
 */
function createProjectStructure(dir: string): void {
    // package.json
    fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'test-project', version: '1.0.0', dependencies: {} }, null, 4) + '\n',
        'utf-8',
    );

    // environments.json
    fs.writeFileSync(
        path.join(dir, 'environments.json'),
        JSON.stringify({ environments: { local: {} } }, null, 4) + '\n',
        'utf-8',
    );

    // src/fixtures/ directory with index.ts containing CLI markers
    fs.mkdirSync(path.join(dir, 'src', 'fixtures'), { recursive: true });
    fs.writeFileSync(
        path.join(dir, 'src', 'fixtures', 'index.ts'),
        [
            '// CLI:IMPORTS',
            '',
            'const allFixtures = {',
            '    // CLI:FIXTURES',
            '};',
            '',
            'export default allFixtures;',
        ].join('\n'),
        'utf-8',
    );

    // tests/examples/ directory
    fs.mkdirSync(path.join(dir, 'tests', 'examples'), { recursive: true });
}

let tmpDir: string;
let fileWriter: FileWriter;
let registryUpdater: RegistryUpdater;
let consoleOutput: string[];
let consoleErrorOutput: string[];
let consoleWarnOutput: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalWarn: typeof console.warn;
let originalExitCode: typeof process.exitCode;

test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'add-cmd-test-'));
    fileWriter = new FileWriter();
    registryUpdater = new RegistryUpdater();

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

test.describe('AddCommand', () => {
    test.describe('Validation rejects unsupported fixture name with valid names list (Requirement 2.2)', () => {
        test('throws error for unsupported fixture name', async () => {
            createProjectStructure(tmpDir);
            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await expect(
                cmd.execute({ fixtureName: 'mongo', targetDir: tmpDir })
            ).rejects.toThrow('Invalid fixture name "mongo"');
            expect(process.exitCode).toBe(1);
        });

        test('error message lists all valid fixture names', async () => {
            createProjectStructure(tmpDir);
            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            try {
                await cmd.execute({ fixtureName: 'invalid', targetDir: tmpDir });
            } catch {
                // Expected to throw
            }

            const errorOutput = consoleErrorOutput.join(' ');
            expect(errorOutput).toContain('database');
            expect(errorOutput).toContain('kafka');
            expect(errorOutput).toContain('mobilewright');
            expect(errorOutput).toContain('openapi');
            expect(errorOutput).toContain('redis');
        });

        test('validates fixture name case-insensitively', async () => {
            createProjectStructure(tmpDir);
            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            // Should succeed with uppercase
            await cmd.execute({ fixtureName: 'KAFKA', targetDir: tmpDir });

            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts'))).toBe(true);
        });
    });

    test.describe('Validation rejects missing project structure (Requirement 2.3)', () => {
        test('throws error when package.json is missing', async () => {
            // Create partial structure without package.json
            fs.mkdirSync(path.join(tmpDir, 'src', 'fixtures'), { recursive: true });
            fs.writeFileSync(path.join(tmpDir, 'environments.json'), '{}', 'utf-8');
            fs.writeFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), '', 'utf-8');

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await expect(
                cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir })
            ).rejects.toThrow('Missing project structure');
            expect(process.exitCode).toBe(1);
        });

        test('throws error when environments.json is missing', async () => {
            // Create partial structure without environments.json
            fs.mkdirSync(path.join(tmpDir, 'src', 'fixtures'), { recursive: true });
            fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');
            fs.writeFileSync(path.join(tmpDir, 'src', 'fixtures', 'index.ts'), '', 'utf-8');

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await expect(
                cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir })
            ).rejects.toThrow('Missing project structure');
            expect(process.exitCode).toBe(1);
        });

        test('throws error when src/fixtures/ directory is missing', async () => {
            // Create partial structure without src/fixtures/
            fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');
            fs.writeFileSync(path.join(tmpDir, 'environments.json'), '{}', 'utf-8');

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await expect(
                cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir })
            ).rejects.toThrow('Missing project structure');
            expect(process.exitCode).toBe(1);
        });

        test('error message indicates which paths are missing', async () => {
            // Empty directory — all paths missing
            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            try {
                await cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });
            } catch {
                // Expected to throw
            }

            const errorOutput = consoleErrorOutput.join(' ');
            expect(errorOutput).toContain('src/fixtures/');
            expect(errorOutput).toContain('package.json');
            expect(errorOutput).toContain('environments.json');
        });
    });

    test.describe('Skips existing fixture file with warning (Requirement 2.9)', () => {
        test('skips fixture file generation when file already exists', async () => {
            createProjectStructure(tmpDir);

            // Pre-create the fixture file
            const existingContent = '// existing fixture content';
            fs.writeFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts'),
                existingContent,
                'utf-8',
            );

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });

            // File content should remain unchanged
            const content = fs.readFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts'),
                'utf-8',
            );
            expect(content).toBe(existingContent);
        });

        test('prints warning when fixture file is skipped', async () => {
            createProjectStructure(tmpDir);

            // Pre-create the fixture file
            fs.writeFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts'),
                '// existing',
                'utf-8',
            );

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });

            const warnOutput = consoleWarnOutput.join(' ');
            expect(warnOutput).toContain('kafka.fixture.ts');
            expect(warnOutput).toContain('already exists');
        });
    });

    test.describe('Skips already-registered fixture with warning (Requirement 2.10)', () => {
        test('skips registry update when fixture is already registered', async () => {
            createProjectStructure(tmpDir);

            // Pre-register kafka in the registry
            const registryContent = [
                '// CLI:IMPORTS',
                "import { kafkaFixture } from './kafka.fixture';",
                '',
                'const allFixtures = {',
                '    // CLI:FIXTURES',
                '    ...kafkaFixture,',
                '};',
                '',
                'export default allFixtures;',
            ].join('\n');
            fs.writeFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                registryContent,
                'utf-8',
            );

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });

            const warnOutput = consoleWarnOutput.join(' ');
            expect(warnOutput).toContain('already registered');
        });

        test('registry content remains unchanged when fixture is already registered', async () => {
            createProjectStructure(tmpDir);

            // Pre-register kafka in the registry
            const registryContent = [
                '// CLI:IMPORTS',
                "import { kafkaFixture } from './kafka.fixture';",
                '',
                'const allFixtures = {',
                '    // CLI:FIXTURES',
                '    ...kafkaFixture,',
                '};',
                '',
                'export default allFixtures;',
            ].join('\n');
            fs.writeFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                registryContent,
                'utf-8',
            );

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'kafka', targetDir: tmpDir });

            // Registry content should remain unchanged
            const updatedContent = fs.readFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                'utf-8',
            );
            expect(updatedContent).toBe(registryContent);
        });
    });

    test.describe('Adds redis with redisConfig internal dependency (Requirement 3.1)', () => {
        test('adds redisConfig definition to registry when adding redis fixture', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'redis', targetDir: tmpDir });

            const registryContent = fs.readFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                'utf-8',
            );

            // Should contain the redisConfig internal dependency
            expect(registryContent).toContain('redisConfig');
        });

        test('adds redis fixture import and spread to registry', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'redis', targetDir: tmpDir });

            const registryContent = fs.readFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                'utf-8',
            );

            // Should contain the redis fixture import
            expect(registryContent).toContain("from './redis.fixture'");
            expect(registryContent).toContain('redisFixture');
        });

        test('adds ioredis dependency to package.json', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'redis', targetDir: tmpDir });

            const pkg = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
            );
            expect(pkg.dependencies['ioredis']).toBe('^5.4.1');
        });
    });

    test.describe('Adds mobilewright with both device and screen entries (Requirement 3.2)', () => {
        test('adds mobilewright fixture import and spread to registry', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'mobilewright', targetDir: tmpDir });

            const registryContent = fs.readFileSync(
                path.join(tmpDir, 'src', 'fixtures', 'index.ts'),
                'utf-8',
            );

            // Should contain the mobilewright fixture import
            expect(registryContent).toContain("from './mobilewright.fixture'");
            expect(registryContent).toContain('mobilewrightFixture');
        });

        test('mobilewright metadata has both device and screen registry entries', () => {
            const metadata = FIXTURE_METADATA['mobilewright'];
            expect(metadata.registryEntries).toContain('mobilewrightDevice');
            expect(metadata.registryEntries).toContain('mobilewrightScreen');
        });

        test('adds both mobilewright dependencies to package.json', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'mobilewright', targetDir: tmpDir });

            const pkg = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'),
            );
            expect(pkg.dependencies['mobilewright']).toBe('^0.0.35');
            expect(pkg.dependencies['@mobilewright/test']).toBe('^0.0.35');
        });

        test('adds mobilewright config to environments.json', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'mobilewright', targetDir: tmpDir });

            const envJson = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8'),
            );
            expect(envJson.environments.local.mobilewright).toBeDefined();
            expect(envJson.environments.local.mobilewright.platform).toBe('ios');
            expect(envJson.environments.local.mobilewright.deviceName).toBe('');
        });
    });

    test.describe('Summary includes install reminder (Requirement 2.11)', () => {
        test('prints install reminder after successful add', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'openapi', targetDir: tmpDir });

            const output = consoleOutput.join('\n');
            expect(output).toContain('npm install');
        });

        test('prints success message', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'openapi', targetDir: tmpDir });

            const output = consoleOutput.join('\n');
            expect(output).toContain('Fixture added successfully');
        });

        test('summary lists created and modified files', async () => {
            createProjectStructure(tmpDir);

            const mockPrompt = createMockPromptManager();
            const cmd = new AddCommand(FIXTURE_METADATA, mockPrompt, fileWriter, registryUpdater);

            await cmd.execute({ fixtureName: 'database', targetDir: tmpDir });

            const output = consoleOutput.join('\n');
            expect(output).toContain('Created:');
            expect(output).toContain('Modified:');
            expect(output).toContain('package.json');
            expect(output).toContain('environments.json');
        });
    });
});
