#!/usr/bin/env npx tsx

/**
 * CLI entry point for the Playwright Framework Template.
 * Provides `init` and `add` commands for project scaffolding and fixture management.
 *
 * @requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { InitCommand } from './commands/init';
import { AddCommand } from './commands/add';
import { FIXTURE_METADATA } from './fixtures-metadata';
import { SECRETS_PROVIDERS } from './secrets-metadata';
import { PromptManager } from './prompts';
import { FileWriter } from './file-writer';
import { RegistryUpdater } from './registry-updater';

export interface ParsedArgs {
    command: 'init' | 'add' | null;
    positional: string[];
    flags: {
        help: boolean;
        version: boolean;
        yes: boolean;
        fixtures?: string;
        secretsProvider?: string;
    };
}

const HELP_TEXT = `
Usage: playwright-framework <command> [options]

Commands:
  init          Scaffold a new Playwright Framework project
  add <name>    Add a fixture to an existing project

Options:
  --help                Show help information
  --version             Show version number
  --yes                 Skip prompts and use defaults
  --fixtures <list>     Comma-separated list of fixtures (init only)
  --secrets-provider <name>  Secrets provider to use (init only)

Examples:
  npx playwright-framework init
  npx playwright-framework init --fixtures openapi,database --secrets-provider aws
  npx playwright-framework add kafka
`.trim();

const INIT_HELP_TEXT = `
Usage: playwright-framework init [options]

Scaffold a new Playwright Framework project with selected fixtures.

Options:
  --help                Show help information
  --yes                 Skip prompts and select all fixtures with env-file provider
  --fixtures <list>     Comma-separated list of fixtures to include
                        Valid: database, kafka, mobilewright, openapi, redis
  --secrets-provider <name>  Secrets provider to configure
                             Valid: aws, azure, env-file, gitlab, vault

Examples:
  npx playwright-framework init
  npx playwright-framework init --yes
  npx playwright-framework init --fixtures openapi,database --secrets-provider aws
`.trim();

const ADD_HELP_TEXT = `
Usage: playwright-framework add <fixture> [options]

Add a fixture to an existing Playwright Framework project.

Arguments:
  fixture       Name of the fixture to add
                Valid: database, kafka, mobilewright, openapi, redis

Options:
  --help        Show help information
  --yes         Skip confirmation prompts

Examples:
  npx playwright-framework add kafka
  npx playwright-framework add database --yes
`.trim();

/**
 * Parse command-line arguments into a structured format.
 */
export function parseArgs(argv: string[]): ParsedArgs {
    const result: ParsedArgs = {
        command: null,
        positional: [],
        flags: {
            help: false,
            version: false,
            yes: false,
        },
    };

    let i = 0;
    while (i < argv.length) {
        const arg = argv[i];

        if (arg === '--help' || arg === '-h') {
            result.flags.help = true;
        } else if (arg === '--version' || arg === '-v') {
            result.flags.version = true;
        } else if (arg === '--yes' || arg === '-y') {
            result.flags.yes = true;
        } else if (arg === '--fixtures') {
            i++;
            if (i < argv.length) {
                result.flags.fixtures = argv[i];
            }
        } else if (arg === '--secrets-provider') {
            i++;
            if (i < argv.length) {
                result.flags.secretsProvider = argv[i];
            }
        } else if (arg.startsWith('--')) {
            // Unknown flag — skip
        } else if (result.command === null && (arg === 'init' || arg === 'add')) {
            result.command = arg;
        } else {
            result.positional.push(arg);
        }

        i++;
    }

    return result;
}

/**
 * Read the package version from package.json.
 */
function getVersion(): string {
    try {
        const pkgPath = path.resolve(__dirname, '../../package.json');
        const content = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(content);
        return pkg.version ?? 'unknown';
    } catch {
        return 'unknown';
    }
}

/**
 * Main CLI runner. Routes parsed arguments to the appropriate handler.
 */
export async function run(args: ParsedArgs): Promise<void> {
    // --version takes precedence
    if (args.flags.version) {
        console.log(getVersion());
        process.exitCode = 0;
        return;
    }

    // Global --help (no command)
    if (args.flags.help && args.command === null) {
        console.log(HELP_TEXT);
        process.exitCode = 0;
        return;
    }

    // Command-specific --help
    if (args.flags.help && args.command === 'init') {
        console.log(INIT_HELP_TEXT);
        process.exitCode = 0;
        return;
    }

    if (args.flags.help && args.command === 'add') {
        console.log(ADD_HELP_TEXT);
        process.exitCode = 0;
        return;
    }

    // Route to command handlers
    if (args.command === 'init') {
        await handleInit(args);
        return;
    }

    if (args.command === 'add') {
        await handleAdd(args);
        return;
    }

    // No command or unrecognized — if there are positional args, it's an unrecognized command
    if (args.positional.length > 0) {
        const unknownCmd = args.positional[0];
        console.error(`Error: Unrecognized command "${unknownCmd}".`);
        console.error('');
        console.error(HELP_TEXT);
        process.exitCode = 1;
        return;
    }

    // No command at all — show help
    console.log(HELP_TEXT);
    process.exitCode = 0;
}

/**
 * Handler for the init command.
 * Instantiates InitCommand with all dependencies and delegates execution.
 */
async function handleInit(args: ParsedArgs): Promise<void> {
    const promptManager = new PromptManager();
    const fileWriter = new FileWriter();
    const initCommand = new InitCommand(
        FIXTURE_METADATA,
        SECRETS_PROVIDERS,
        promptManager,
        fileWriter,
    );

    await initCommand.execute({
        fixtures: args.flags.fixtures,
        secretsProvider: args.flags.secretsProvider,
        yes: args.flags.yes,
        targetDir: process.cwd(),
    });
}

/**
 * Handler for the add command.
 * Instantiates AddCommand with all dependencies and delegates execution.
 */
async function handleAdd(args: ParsedArgs): Promise<void> {
    const promptManager = new PromptManager();
    const fileWriter = new FileWriter();
    const registryUpdater = new RegistryUpdater();
    const addCommand = new AddCommand(
        FIXTURE_METADATA,
        promptManager,
        fileWriter,
        registryUpdater,
    );

    await addCommand.execute({
        fixtureName: args.positional[0],
        yes: args.flags.yes,
        targetDir: process.cwd(),
    });
}

// Handle unhandled promise rejections with non-zero exit code
process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason);
    console.error('Error:', message);
    process.exitCode = 1;
});

// Run when executed directly (via npx or direct invocation)
if (require.main === module) {
    const args = parseArgs(process.argv.slice(2));
    run(args).catch((err) => {
        console.error('Error:', err instanceof Error ? err.message : String(err));
        process.exitCode = 1;
    });
}
