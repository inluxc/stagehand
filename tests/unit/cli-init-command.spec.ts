/**
 * Unit tests for the InitCommand class.
 *
 * Tests cover:
 * - validateTargetDir aborts when package.json exists (Requirement 1.13)
 * - resolveFixtures aborts with zero fixtures selected (Requirement 1.15)
 * - --yes selects all fixtures (Requirement 4.5)
 * - --fixtures flag bypasses prompt (Requirement 4.2)
 * - --secrets-provider flag bypasses prompt (Requirement 5.4)
 * - Rollback on file write failure (Requirement 1.16)
 * - Summary output lists all generated files (Requirement 1.14)
 *
 * @requirements 1.13, 1.14, 1.15, 1.16, 4.2, 4.5, 5.4
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { InitCommand } from '../../src/cli/commands/init';
import { FileWriter } from '../../src/cli/file-writer';
import { FIXTURE_METADATA } from '../../src/cli/fixtures-metadata';
import { SECRETS_PROVIDERS } from '../../src/cli/secrets-metadata';
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

let tmpDir: string;
let fileWriter: FileWriter;
let consoleOutput: string[];
let consoleErrorOutput: string[];
let originalLog: typeof console.log;
let originalError: typeof console.error;
let originalExitCode: typeof process.exitCode;

test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'init-cmd-test-'));
    fileWriter = new FileWriter();

    originalLog = console.log;
    originalError = console.error;
    originalExitCode = process.exitCode;
    consoleOutput = [];
    consoleErrorOutput = [];
    console.log = (...args: unknown[]) => { consoleOutput.push(args.join(' ')); };
    console.error = (...args: unknown[]) => { consoleErrorOutput.push(args.join(' ')); };
    process.exitCode = undefined;
});

test.afterEach(() => {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test.describe('InitCommand', () => {
    test.describe('validateTargetDir — abort when package.json exists (Requirement 1.13)', () => {
        test('throws error when package.json already exists in target directory', async () => {
            // Create a package.json in the temp directory
            fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');

            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await expect(cmd.execute({ targetDir: tmpDir, yes: true })).rejects.toThrow(
                'A project already exists in this directory (package.json found).'
            );
            expect(process.exitCode).toBe(1);
            expect(consoleErrorOutput.join(' ')).toContain('package.json found');
        });

        test('does not generate any files when package.json exists', async () => {
            fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}', 'utf-8');

            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            try {
                await cmd.execute({ targetDir: tmpDir, yes: true });
            } catch {
                // Expected to throw
            }

            // Only the pre-existing package.json should be in the directory
            const files = fs.readdirSync(tmpDir);
            expect(files).toEqual(['package.json']);
        });
    });

    test.describe('resolveFixtures — abort with zero fixtures selected (Requirement 1.15)', () => {
        test('throws error when prompt returns empty selection', async () => {
            const mockPrompt = createMockPromptManager({
                selectFixtures: async () => [],
            });
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await expect(cmd.execute({ targetDir: tmpDir })).rejects.toThrow(
                'At least one fixture must be selected.'
            );
            expect(process.exitCode).toBe(1);
            expect(consoleErrorOutput.join(' ')).toContain('At least one fixture');
        });

        test('does not generate any files when zero fixtures selected', async () => {
            const mockPrompt = createMockPromptManager({
                selectFixtures: async () => [],
            });
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            try {
                await cmd.execute({ targetDir: tmpDir });
            } catch {
                // Expected to throw
            }

            const files = fs.readdirSync(tmpDir);
            expect(files).toHaveLength(0);
        });
    });

    test.describe('--yes selects all fixtures (Requirement 4.5)', () => {
        test('selects all 5 fixtures when --yes is provided', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, yes: true });

            // All 5 fixture files should be generated
            const fixtureNames = Object.keys(FIXTURE_METADATA);
            expect(fixtureNames).toHaveLength(5);

            for (const name of fixtureNames) {
                const fixturePath = path.join(tmpDir, 'src', 'fixtures', `${name}.fixture.ts`);
                expect(fs.existsSync(fixturePath)).toBe(true);
            }
        });

        test('--yes uses env-file as default secrets provider', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, yes: true });

            const envJson = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8')
            );
            expect(envJson.environments.local.secrets.provider).toBe('env-file');
        });

        test('--yes does not call prompt methods', async () => {
            let promptCalled = false;
            const mockPrompt = createMockPromptManager({
                selectFixtures: async () => {
                    promptCalled = true;
                    return ['openapi'];
                },
                selectSecretsProvider: async () => {
                    promptCalled = true;
                    return 'aws';
                },
            });
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, yes: true });

            expect(promptCalled).toBe(false);
        });
    });

    test.describe('--fixtures flag bypasses prompt (Requirement 4.2)', () => {
        test('parses comma-separated fixture names from --fixtures flag', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,kafka', yes: true });

            // Only openapi and kafka fixture files should be generated
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'openapi.fixture.ts'))).toBe(true);
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'kafka.fixture.ts'))).toBe(true);
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'database.fixture.ts'))).toBe(false);
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'redis.fixture.ts'))).toBe(false);
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'mobilewright.fixture.ts'))).toBe(false);
        });

        test('handles whitespace in --fixtures flag', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: ' redis , database ', yes: true });

            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'redis.fixture.ts'))).toBe(true);
            expect(fs.existsSync(path.join(tmpDir, 'src', 'fixtures', 'database.fixture.ts'))).toBe(true);
        });

        test('rejects invalid fixture name in --fixtures flag', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await expect(
                cmd.execute({ targetDir: tmpDir, fixtures: 'openapi,invalid', yes: true })
            ).rejects.toThrow('Invalid fixture name "invalid"');
            expect(process.exitCode).toBe(1);
        });

        test('--fixtures flag does not call selectFixtures prompt', async () => {
            let promptCalled = false;
            const mockPrompt = createMockPromptManager({
                selectFixtures: async () => {
                    promptCalled = true;
                    return ['openapi'];
                },
            });
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'kafka', yes: true });

            expect(promptCalled).toBe(false);
        });
    });

    test.describe('--secrets-provider flag bypasses prompt (Requirement 5.4)', () => {
        test('uses provided secrets provider value', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', secretsProvider: 'aws' });

            const envJson = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8')
            );
            expect(envJson.environments.local.secrets.provider).toBe('aws');
        });

        test('rejects invalid secrets provider value', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await expect(
                cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', secretsProvider: 'invalid' })
            ).rejects.toThrow('Invalid secrets provider "invalid"');
            expect(process.exitCode).toBe(1);
        });

        test('--secrets-provider flag does not call selectSecretsProvider prompt', async () => {
            let promptCalled = false;
            const mockPrompt = createMockPromptManager({
                selectSecretsProvider: async () => {
                    promptCalled = true;
                    return 'vault';
                },
            });
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', secretsProvider: 'gitlab' });

            expect(promptCalled).toBe(false);
        });

        test('accepts case-insensitive provider names', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', secretsProvider: 'AWS' });

            const envJson = JSON.parse(
                fs.readFileSync(path.join(tmpDir, 'environments.json'), 'utf-8')
            );
            expect(envJson.environments.local.secrets.provider).toBe('aws');
        });
    });

    test.describe('Rollback on file write failure (Requirement 1.16)', () => {
        test('removes all generated files when a write fails mid-generation', async () => {
            // Use a custom FileWriter that throws on a specific file
            const failingWriter = new FileWriter();
            const originalWrite = failingWriter.write.bind(failingWriter);
            let writeCount = 0;

            failingWriter.write = (filePath: string, content: string) => {
                writeCount++;
                // Fail on the 4th file write to simulate mid-generation failure
                if (writeCount === 4) {
                    throw new Error('Disk full: cannot write file');
                }
                originalWrite(filePath, content);
            };

            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, failingWriter);

            await expect(
                cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true })
            ).rejects.toThrow('Disk full: cannot write file');

            // After rollback, the first 3 files that were written should be removed
            const writtenFiles = failingWriter.getWrittenFiles();
            for (const file of writtenFiles) {
                expect(fs.existsSync(file)).toBe(false);
            }
        });

        test('rollback cleans up files written before the failure', async () => {
            const failingWriter = new FileWriter();
            const originalWrite = failingWriter.write.bind(failingWriter);
            let writeCount = 0;
            const writtenPaths: string[] = [];

            failingWriter.write = (filePath: string, content: string) => {
                writeCount++;
                // Fail on the 3rd file write
                if (writeCount === 3) {
                    throw new Error('Permission denied');
                }
                originalWrite(filePath, content);
                writtenPaths.push(filePath);
            };

            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, failingWriter);

            await expect(
                cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true })
            ).rejects.toThrow('Permission denied');

            // All files that were successfully written before the failure should be removed
            for (const filePath of writtenPaths) {
                expect(fs.existsSync(filePath)).toBe(false);
            }
        });
    });

    test.describe('Summary output lists all generated files (Requirement 1.14)', () => {
        test('prints all generated file paths in summary', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'openapi', yes: true });

            const output = consoleOutput.join('\n');
            expect(output).toContain('package.json');
            expect(output).toContain('tsconfig.json');
            expect(output).toContain('playwright.config.ts');
            expect(output).toContain('environments.json');
            expect(output).toContain('.env.local.example');
            expect(output).toContain('src/fixtures/index.ts');
            expect(output).toContain('src/fixtures/openapi.fixture.ts');
            expect(output).toContain('src/index.ts');
            expect(output).toContain('src/errors.ts');
            expect(output).toContain('tests/examples/openapi.spec.ts');
        });

        test('prints success message', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'kafka', yes: true });

            const output = consoleOutput.join('\n');
            expect(output).toContain('Project scaffolded successfully');
        });

        test('prints next steps instructions', async () => {
            const mockPrompt = createMockPromptManager();
            const cmd = new InitCommand(FIXTURE_METADATA, SECRETS_PROVIDERS, mockPrompt, fileWriter);

            await cmd.execute({ targetDir: tmpDir, fixtures: 'kafka', yes: true });

            const output = consoleOutput.join('\n');
            expect(output).toContain('Next steps');
            expect(output).toContain('npm install');
        });

        test('full execute with --yes generates all expected files', async () => {
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
                expect(fs.existsSync(path.join(tmpDir, file))).toBe(true);
            }
        });
    });
});
