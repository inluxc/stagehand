/**
 * Property 10: Unrecognized command rejection
 *
 * For any string that is not "init", "add", "--help", "--version", "-h", or "-v",
 * the CLI command router SHALL reject it with a non-zero exit code and include
 * help text in the error output.
 *
 * **Validates: Requirements 6.5**
 *
 * Feature: cli-init-and-add, Property 10: Unrecognized command rejection
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { parseArgs, run } from '../../src/cli/index';

/** Known valid commands and flags that the router accepts without error */
const RECOGNIZED_INPUTS = new Set(['init', 'add', '--help', '--version', '-h', '-v']);

/**
 * Generates arbitrary strings that are NOT recognized CLI commands or flags.
 * Filters out empty strings and strings starting with '--' (treated as unknown flags, not commands).
 */
const arbUnrecognizedCommand = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => !RECOGNIZED_INPUTS.has(s) && !s.startsWith('--'));

test.describe('Property 10: Unrecognized command rejection', {
    tag: '@Feature: cli-init-and-add, Property 10: Unrecognized command rejection',
}, () => {
    test('any unrecognized command results in non-zero exit and help text', async () => {
        await fc.assert(
            fc.asyncProperty(arbUnrecognizedCommand, async (unknownCmd) => {
                const originalExitCode = process.exitCode;
                const errorOutput: string[] = [];
                const originalConsoleError = console.error;
                const originalConsoleLog = console.log;

                // Capture console.error output
                console.error = (...args: unknown[]) => {
                    errorOutput.push(args.map(String).join(' '));
                };
                // Suppress console.log to avoid noise
                console.log = () => { };

                try {
                    // Reset exitCode before test
                    process.exitCode = undefined;

                    const parsed = parseArgs([unknownCmd]);

                    // The string should not be recognized as a valid command
                    expect(parsed.command).toBeNull();
                    // It should appear in positional args
                    expect(parsed.positional).toContain(unknownCmd);

                    // Run the router
                    await run(parsed);

                    // Verify non-zero exit code
                    expect(process.exitCode).toBe(1);

                    // Verify error output contains help text
                    const fullOutput = errorOutput.join('\n');
                    expect(fullOutput).toContain('Unrecognized command');
                    expect(fullOutput).toContain('Usage:');
                } finally {
                    console.error = originalConsoleError;
                    console.log = originalConsoleLog;
                    process.exitCode = originalExitCode;
                }
            }),
            { numRuns: 100 }
        );
    });
});
