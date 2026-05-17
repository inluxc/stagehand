import { test, expect } from '@playwright/test';
import { parseArgs } from '../../src/cli/index';

test.describe('parseArgs', () => {
    test('parses init command', () => {
        const result = parseArgs(['init']);
        expect(result.command).toBe('init');
        expect(result.positional).toEqual([]);
        expect(result.flags.help).toBe(false);
    });

    test('parses add command with positional argument', () => {
        const result = parseArgs(['add', 'kafka']);
        expect(result.command).toBe('add');
        expect(result.positional).toEqual(['kafka']);
    });

    test('parses --help flag', () => {
        const result = parseArgs(['--help']);
        expect(result.flags.help).toBe(true);
        expect(result.command).toBeNull();
    });

    test('parses -h shorthand', () => {
        const result = parseArgs(['-h']);
        expect(result.flags.help).toBe(true);
    });

    test('parses --version flag', () => {
        const result = parseArgs(['--version']);
        expect(result.flags.version).toBe(true);
        expect(result.command).toBeNull();
    });

    test('parses -v shorthand', () => {
        const result = parseArgs(['-v']);
        expect(result.flags.version).toBe(true);
    });

    test('parses --yes flag', () => {
        const result = parseArgs(['init', '--yes']);
        expect(result.command).toBe('init');
        expect(result.flags.yes).toBe(true);
    });

    test('parses -y shorthand', () => {
        const result = parseArgs(['init', '-y']);
        expect(result.flags.yes).toBe(true);
    });

    test('parses --fixtures flag with value', () => {
        const result = parseArgs(['init', '--fixtures', 'openapi,database']);
        expect(result.command).toBe('init');
        expect(result.flags.fixtures).toBe('openapi,database');
    });

    test('parses --secrets-provider flag with value', () => {
        const result = parseArgs(['init', '--secrets-provider', 'aws']);
        expect(result.command).toBe('init');
        expect(result.flags.secretsProvider).toBe('aws');
    });

    test('parses combined flags', () => {
        const result = parseArgs(['init', '--yes', '--fixtures', 'kafka,redis', '--secrets-provider', 'vault']);
        expect(result.command).toBe('init');
        expect(result.flags.yes).toBe(true);
        expect(result.flags.fixtures).toBe('kafka,redis');
        expect(result.flags.secretsProvider).toBe('vault');
    });

    test('parses command-specific help', () => {
        const result = parseArgs(['init', '--help']);
        expect(result.command).toBe('init');
        expect(result.flags.help).toBe(true);
    });

    test('treats unknown string as positional when no command matches', () => {
        const result = parseArgs(['unknown']);
        expect(result.command).toBeNull();
        expect(result.positional).toEqual(['unknown']);
    });

    test('returns null command and empty positional for empty argv', () => {
        const result = parseArgs([]);
        expect(result.command).toBeNull();
        expect(result.positional).toEqual([]);
        expect(result.flags.help).toBe(false);
        expect(result.flags.version).toBe(false);
        expect(result.flags.yes).toBe(false);
    });

    test('fixtures flag without value does not set fixtures', () => {
        const result = parseArgs(['init', '--fixtures']);
        expect(result.flags.fixtures).toBeUndefined();
    });

    test('secrets-provider flag without value does not set secretsProvider', () => {
        const result = parseArgs(['init', '--secrets-provider']);
        expect(result.flags.secretsProvider).toBeUndefined();
    });

    test('add command with multiple positional args', () => {
        const result = parseArgs(['add', 'kafka', 'extra']);
        expect(result.command).toBe('add');
        expect(result.positional).toEqual(['kafka', 'extra']);
    });
});

test.describe('run - routing', () => {
    // These tests verify the routing logic by capturing console output
    let consoleOutput: string[] = [];
    let consoleErrorOutput: string[] = [];
    let originalLog: typeof console.log;
    let originalError: typeof console.error;
    let originalExitCode: typeof process.exitCode;

    test.beforeEach(() => {
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
    });

    test('--version outputs version from package.json', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs(['--version']));
        expect(consoleOutput[0]).toBe('1.0.0');
        expect(process.exitCode).toBe(0);
    });

    test('--help outputs help text', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs(['--help']));
        expect(consoleOutput[0]).toContain('Usage: playwright-framework');
        expect(consoleOutput[0]).toContain('init');
        expect(consoleOutput[0]).toContain('add');
        expect(process.exitCode).toBe(0);
    });

    test('init --help outputs init-specific help', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs(['init', '--help']));
        expect(consoleOutput[0]).toContain('--fixtures');
        expect(consoleOutput[0]).toContain('--secrets-provider');
        expect(process.exitCode).toBe(0);
    });

    test('add --help outputs add-specific help', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs(['add', '--help']));
        expect(consoleOutput[0]).toContain('fixture');
        expect(consoleOutput[0]).toContain('--yes');
        expect(process.exitCode).toBe(0);
    });

    test('unrecognized command exits with non-zero code and shows help', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs(['deploy']));
        expect(consoleErrorOutput[0]).toContain('Unrecognized command');
        expect(consoleErrorOutput[0]).toContain('deploy');
        // Help text should be in the error output
        const allError = consoleErrorOutput.join('\n');
        expect(allError).toContain('Usage: playwright-framework');
        expect(process.exitCode).toBe(1);
    });

    test('no command shows help with exit code 0', async () => {
        const { run } = await import('../../src/cli/index');
        await run(parseArgs([]));
        expect(consoleOutput[0]).toContain('Usage: playwright-framework');
        expect(process.exitCode).toBe(0);
    });
});
