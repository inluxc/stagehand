/**
 * Init Command Handler — orchestrates the full project scaffolding flow.
 *
 * Validates the target directory, resolves fixture and secrets provider selections
 * (via flags, prompts, or --yes defaults), generates all scaffold files using the
 * template engine, and handles rollback on failure.
 *
 * @requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12, 1.13, 1.14, 1.15, 1.16, 5.1, 5.2, 5.3, 5.6
 */

import * as path from 'node:path';
import type { FixtureMetadata } from '../fixtures-metadata';
import type { SecretsProviderMetadata } from '../secrets-metadata';
import type { IPromptManager } from '../prompts';
import type { FileWriter } from '../file-writer';
import {
    generatePackageJson,
    generateTsConfig,
    generatePlaywrightConfig,
    generateEnvironmentsJson,
    generateEnvExample,
    generateFixtureRegistry,
    generateBarrelFile,
    generateErrorsFile,
    generateConfigModules,
    generateFixtureFile,
    generateExampleTest,
} from '../templates/index';

export interface InitOptions {
    fixtures?: string;
    secretsProvider?: string;
    yes?: boolean;
    targetDir: string;
}

export class InitCommand {
    constructor(
        private readonly metadata: Record<string, FixtureMetadata>,
        private readonly secretsMetadata: Record<string, SecretsProviderMetadata>,
        private readonly promptManager: IPromptManager,
        private readonly fileWriter: FileWriter,
    ) { }

    /**
     * Execute the full init flow: validate, resolve selections, generate files, print summary.
     */
    async execute(options: InitOptions): Promise<void> {
        this.validateTargetDir(options.targetDir);

        const fixtureNames = await this.resolveFixtures(options);
        const secretsProviderName = await this.resolveSecretsProvider(options);

        const fixtures = fixtureNames.map((name) => this.metadata[name]);
        const secretsProvider = this.secretsMetadata[secretsProviderName];

        let generatedFiles: string[] = [];
        try {
            generatedFiles = this.generateFiles(fixtures, secretsProvider, options.targetDir);
            this.printSummary(generatedFiles);
        } catch (error) {
            this.rollback();
            throw error;
        }
    }

    /**
     * Abort if package.json already exists in the target directory.
     * @requirements 1.13
     */
    private validateTargetDir(dir: string): void {
        const packageJsonPath = path.join(dir, 'package.json');
        if (this.fileWriter.exists(packageJsonPath)) {
            console.error('Error: A project already exists in this directory (package.json found).');
            process.exitCode = 1;
            throw new Error('A project already exists in this directory (package.json found).');
        }
    }

    /**
     * Resolve fixture selection from --fixtures flag, --yes default, or interactive prompt.
     * Validates that at least one fixture is selected.
     * @requirements 1.1, 1.15, 4.2, 4.5
     */
    private async resolveFixtures(options: InitOptions): Promise<string[]> {
        const supportedNames = Object.keys(this.metadata);
        let selected: string[];

        if (options.fixtures) {
            // --fixtures flag: split, trim, lowercase, validate
            selected = options.fixtures
                .split(',')
                .map((s) => s.trim().toLowerCase())
                .filter((s) => s.length > 0);

            // Validate each fixture name
            for (const name of selected) {
                if (!this.metadata[name]) {
                    const validNames = supportedNames.join(', ');
                    console.error(`Error: Invalid fixture name "${name}". Valid fixtures: ${validNames}`);
                    process.exitCode = 1;
                    throw new Error(`Invalid fixture name "${name}". Valid fixtures: ${validNames}`);
                }
            }
        } else if (options.yes) {
            // --yes flag: select all fixtures
            selected = supportedNames;
        } else {
            // Interactive prompt
            selected = await this.promptManager.selectFixtures(supportedNames);
        }

        // Validate at least one fixture selected
        if (selected.length === 0) {
            console.error('Error: At least one fixture must be selected.');
            process.exitCode = 1;
            throw new Error('At least one fixture must be selected.');
        }

        return selected;
    }

    /**
     * Resolve secrets provider from --secrets-provider flag, --yes default, or interactive prompt.
     * @requirements 5.1, 5.4, 5.5, 5.6
     */
    private async resolveSecretsProvider(options: InitOptions): Promise<string> {
        const supportedProviders = Object.keys(this.secretsMetadata);

        if (options.secretsProvider) {
            // --secrets-provider flag: validate
            const normalized = options.secretsProvider.toLowerCase();
            if (!this.secretsMetadata[normalized]) {
                const validProviders = supportedProviders.join(', ');
                console.error(`Error: Invalid secrets provider "${options.secretsProvider}". Valid providers: ${validProviders}`);
                process.exitCode = 1;
                throw new Error(`Invalid secrets provider "${options.secretsProvider}". Valid providers: ${validProviders}`);
            }
            return normalized;
        }

        if (options.yes) {
            // --yes flag: use env-file as default
            return 'env-file';
        }

        // Interactive prompt
        return this.promptManager.selectSecretsProvider(supportedProviders, 'env-file');
    }

    /**
     * Generate all scaffold files using the template engine and file writer.
     * @requirements 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 1.11, 1.12
     */
    private generateFiles(
        fixtures: FixtureMetadata[],
        secretsProvider: SecretsProviderMetadata,
        dir: string,
    ): string[] {
        const files: Array<{ relativePath: string; content: string }> = [];

        // Root config files
        files.push({ relativePath: 'package.json', content: generatePackageJson(fixtures) });
        files.push({ relativePath: 'tsconfig.json', content: generateTsConfig() });
        files.push({ relativePath: 'playwright.config.ts', content: generatePlaywrightConfig() });
        files.push({ relativePath: 'environments.json', content: generateEnvironmentsJson(fixtures, secretsProvider) });
        files.push({ relativePath: '.env.local.example', content: generateEnvExample(fixtures, secretsProvider) });

        // src/fixtures/ files
        files.push({ relativePath: 'src/fixtures/index.ts', content: generateFixtureRegistry(fixtures) });
        for (const fixture of fixtures) {
            files.push({
                relativePath: `src/fixtures/${fixture.name}.fixture.ts`,
                content: generateFixtureFile(fixture.name),
            });
        }

        // src/config/ files
        const configModules = generateConfigModules();
        files.push({ relativePath: 'src/config/env-loader.ts', content: configModules.envLoader });
        files.push({ relativePath: 'src/config/schema.ts', content: configModules.schema });
        files.push({ relativePath: 'src/config/loader.ts', content: configModules.loader });
        files.push({ relativePath: 'src/config/index.ts', content: configModules.index });

        // src/errors.ts and src/index.ts
        files.push({ relativePath: 'src/errors.ts', content: generateErrorsFile() });
        files.push({ relativePath: 'src/index.ts', content: generateBarrelFile(fixtures) });

        // tests/examples/ files
        for (const fixture of fixtures) {
            files.push({
                relativePath: `tests/examples/${fixture.name}.spec.ts`,
                content: generateExampleTest(fixture.name),
            });
        }

        // Write all files
        for (const file of files) {
            const absolutePath = path.join(dir, file.relativePath);
            this.fileWriter.write(absolutePath, file.content);
        }

        return files.map((f) => f.relativePath);
    }

    /**
     * Print a summary of generated files and next steps.
     * @requirements 1.14
     */
    private printSummary(generatedFiles: string[]): void {
        console.log('');
        console.log('✓ Project scaffolded successfully!');
        console.log('');
        console.log('Generated files:');
        for (const file of generatedFiles) {
            console.log(`  ${file}`);
        }
        console.log('');
        console.log('Next steps:');
        console.log('  1. Install dependencies: npm install');
        console.log('  2. Copy .env.local.example to .env.local and fill in values');
        console.log('  3. Run tests: npx playwright test');
        console.log('');
    }

    /**
     * Delegate rollback to the file writer to remove all generated files.
     * @requirements 1.16
     */
    private rollback(): void {
        this.fileWriter.rollback();
    }
}
