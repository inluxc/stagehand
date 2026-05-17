import { checkbox, select } from '@inquirer/prompts';

/**
 * Interface for the prompt manager that handles all interactive CLI prompts.
 */
export interface IPromptManager {
    /** Multi-select fixtures for init command */
    selectFixtures(available: string[]): Promise<string[]>;
    /** Single-select fixture for add command */
    selectFixture(available: string[]): Promise<string>;
    /** Single-select secrets provider with a default value */
    selectSecretsProvider(available: string[], defaultValue: string): Promise<string>;
    /** Check if interactive mode is available */
    isInteractive(): boolean;
}

/**
 * Prompt manager that handles all interactive CLI prompts.
 * Uses @inquirer/prompts for checkbox and select interactions.
 * Checks TTY availability before displaying prompts.
 */
export class PromptManager implements IPromptManager {
    /**
     * Check if stdin is a TTY (interactive terminal).
     */
    isInteractive(): boolean {
        return !!process.stdin.isTTY;
    }

    /**
     * Ensure the environment supports interactive prompts.
     * Throws if stdin is not a TTY and no --yes flag was used.
     */
    ensureInteractive(): void {
        if (!this.isInteractive()) {
            throw new Error(
                'Error: Interactive mode requires a terminal.\n\n' +
                'Run in a terminal with TTY support, or use the --yes flag to skip prompts.'
            );
        }
    }

    /**
     * Display a multi-select prompt for fixture selection (init command).
     * All fixtures are deselected by default.
     */
    async selectFixtures(available: string[]): Promise<string[]> {
        this.ensureInteractive();

        const selected = await checkbox({
            message: 'Select fixtures to include:',
            choices: available.map((name) => ({
                name,
                value: name,
            })),
        });

        return selected;
    }

    /**
     * Display a single-select prompt for fixture selection (add command).
     */
    async selectFixture(available: string[]): Promise<string> {
        this.ensureInteractive();

        const selected = await select({
            message: 'Select a fixture to add:',
            choices: available.map((name) => ({
                name,
                value: name,
            })),
        });

        return selected;
    }

    /**
     * Display a single-select prompt for secrets provider selection.
     * The defaultValue is pre-selected.
     */
    async selectSecretsProvider(available: string[], defaultValue: string): Promise<string> {
        this.ensureInteractive();

        const selected = await select({
            message: 'Select a secrets provider:',
            choices: available.map((name) => ({
                name,
                value: name,
            })),
            default: defaultValue,
        });

        return selected;
    }
}
