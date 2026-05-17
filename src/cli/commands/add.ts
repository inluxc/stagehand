/**
 * Add Command Handler — orchestrates adding a fixture to an existing project.
 *
 * Validates project structure, resolves the fixture name (via argument or prompt),
 * generates fixture file and example test, updates the registry, package.json,
 * and environments.json, then prints a summary.
 *
 * @requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 2.11, 3.1, 3.2, 3.4, 3.5, 3.6
 */

import * as path from 'node:path';
import type { FixtureMetadata } from '../fixtures-metadata';
import type { IPromptManager } from '../prompts';
import type { FileWriter } from '../file-writer';
import type { RegistryUpdater } from '../registry-updater';
import {
    generateFixtureFile,
    generateExampleTest,
} from '../templates/index';

export interface AddOptions {
    fixtureName?: string;
    yes?: boolean;
    targetDir: string;
}

export class AddCommand {
    constructor(
        private readonly metadata: Record<string, FixtureMetadata>,
        private readonly promptManager: IPromptManager,
        private readonly fileWriter: FileWriter,
        private readonly registryUpdater: RegistryUpdater,
    ) { }

    /**
     * Execute the full add flow: validate, resolve fixture, generate/update files, print summary.
     */
    async execute(options: AddOptions): Promise<void> {
        this.validateProjectStructure(options.targetDir);

        const fixtureName = await this.resolveFixtureName(options);
        const normalizedName = this.validateFixtureName(fixtureName);
        const fixture = this.metadata[normalizedName];

        const created: string[] = [];
        const modified: string[] = [];
        const skipped: string[] = [];

        // Generate fixture file
        const fixtureResult = this.generateFixtureFile(fixture, options.targetDir);
        if (fixtureResult === 'created') {
            created.push(`src/fixtures/${fixture.name}.fixture.ts`);
        } else {
            skipped.push(`src/fixtures/${fixture.name}.fixture.ts`);
        }

        // Generate example test
        const testResult = this.generateExampleTest(fixture, options.targetDir);
        if (testResult === 'created') {
            created.push(`tests/examples/${fixture.name}.spec.ts`);
        } else {
            skipped.push(`tests/examples/${fixture.name}.spec.ts`);
        }

        // Update registry
        const registryResult = this.updateRegistry(fixture, options.targetDir);
        if (registryResult === 'updated') {
            modified.push('src/fixtures/index.ts');
        } else {
            skipped.push('src/fixtures/index.ts');
        }

        // Update package.json
        this.updatePackageJson(fixture, options.targetDir);
        modified.push('package.json');

        // Update environments.json
        this.updateEnvironmentsJson(fixture, options.targetDir);
        modified.push('environments.json');

        this.printSummary(created, modified, skipped);
    }

    /**
     * Validate that the project structure exists: src/fixtures/, package.json, environments.json.
     * @requirements 2.3
     */
    private validateProjectStructure(dir: string): void {
        const required = [
            { path: path.join(dir, 'src', 'fixtures'), label: 'src/fixtures/' },
            { path: path.join(dir, 'package.json'), label: 'package.json' },
            { path: path.join(dir, 'environments.json'), label: 'environments.json' },
        ];

        const missing = required.filter((r) => !this.fileWriter.exists(r.path));

        if (missing.length > 0) {
            const missingList = missing.map((m) => m.label).join(', ');
            console.error(`Error: Missing project structure. Expected: ${missingList}`);
            process.exitCode = 1;
            throw new Error(`Missing project structure. Expected: ${missingList}`);
        }
    }

    /**
     * Resolve fixture name from positional argument or interactive prompt.
     * @requirements 4.4
     */
    private async resolveFixtureName(options: AddOptions): Promise<string> {
        if (options.fixtureName) {
            return options.fixtureName;
        }

        const supportedNames = Object.keys(this.metadata);
        return this.promptManager.selectFixture(supportedNames);
    }

    /**
     * Validate fixture name against supported set (case-insensitive).
     * Returns the normalized lowercase name.
     * @requirements 2.1, 2.2
     */
    private validateFixtureName(name: string): string {
        const normalized = name.toLowerCase();
        const supportedNames = Object.keys(this.metadata);

        if (!this.metadata[normalized]) {
            const validNames = supportedNames.join(', ');
            console.error(`Error: Invalid fixture name "${name}". Valid fixtures: ${validNames}`);
            process.exitCode = 1;
            throw new Error(`Invalid fixture name "${name}". Valid fixtures: ${validNames}`);
        }

        return normalized;
    }

    /**
     * Generate the fixture file. Skip with warning if it already exists.
     * @requirements 2.4, 2.9
     */
    private generateFixtureFile(fixture: FixtureMetadata, dir: string): 'created' | 'skipped' {
        const filePath = path.join(dir, 'src', 'fixtures', `${fixture.name}.fixture.ts`);

        if (this.fileWriter.exists(filePath)) {
            console.warn(`Warning: Skipped ${fixture.name}.fixture.ts (already exists)`);
            return 'skipped';
        }

        const content = generateFixtureFile(fixture.name);
        this.fileWriter.write(filePath, content);
        return 'created';
    }

    /**
     * Generate the example test file. Skip with warning if it already exists.
     * @requirements 2.8, 2.9
     */
    private generateExampleTest(fixture: FixtureMetadata, dir: string): 'created' | 'skipped' {
        const filePath = path.join(dir, 'tests', 'examples', `${fixture.name}.spec.ts`);

        if (this.fileWriter.exists(filePath)) {
            console.warn(`Warning: Skipped ${fixture.name}.spec.ts (already exists)`);
            return 'skipped';
        }

        const content = generateExampleTest(fixture.name);
        this.fileWriter.write(filePath, content);
        return 'created';
    }

    /**
     * Update the fixture registry. Skip with warning if already registered.
     * @requirements 2.5, 2.10, 3.1, 3.2, 3.5
     */
    private updateRegistry(fixture: FixtureMetadata, dir: string): 'updated' | 'skipped' {
        const registryPath = path.join(dir, 'src', 'fixtures', 'index.ts');
        const registryContent = this.fileWriter.read(registryPath);

        if (this.registryUpdater.isRegistered(registryContent, fixture)) {
            console.warn(`Warning: Skipped registry update (${fixture.name} already registered)`);
            return 'skipped';
        }

        const updatedContent = this.registryUpdater.addFixture(registryContent, fixture);
        this.fileWriter.update(registryPath, () => updatedContent);
        return 'updated';
    }

    /**
     * Update package.json with fixture dependencies. Skips duplicates (keeps existing versions).
     * @requirements 2.6, 3.4, 3.5, 3.6
     */
    private updatePackageJson(fixture: FixtureMetadata, dir: string): void {
        const packageJsonPath = path.join(dir, 'package.json');

        this.fileWriter.update(packageJsonPath, (content) => {
            const pkg = JSON.parse(content);

            if (!pkg.dependencies) {
                pkg.dependencies = {};
            }

            for (const [name, version] of Object.entries(fixture.dependencies)) {
                // Only add if not already present (skip duplicates, keep existing versions)
                if (!pkg.dependencies[name]) {
                    pkg.dependencies[name] = version;
                }
            }

            return JSON.stringify(pkg, null, 4) + '\n';
        });
    }

    /**
     * Update environments.json with fixture config entry in the local environment.
     * @requirements 2.7
     */
    private updateEnvironmentsJson(fixture: FixtureMetadata, dir: string): void {
        const envJsonPath = path.join(dir, 'environments.json');

        this.fileWriter.update(envJsonPath, (content) => {
            const envFile = JSON.parse(content);

            if (!envFile.environments) {
                envFile.environments = {};
            }
            if (!envFile.environments.local) {
                envFile.environments.local = {};
            }

            // Add fixture config to local environment (skip if already present)
            if (!envFile.environments.local[fixture.name]) {
                envFile.environments.local[fixture.name] = fixture.configTemplate;
            }

            return JSON.stringify(envFile, null, 4) + '\n';
        });
    }

    /**
     * Print a summary of created, modified, and skipped files with install reminder.
     * @requirements 2.11
     */
    private printSummary(created: string[], modified: string[], skipped: string[]): void {
        console.log('');
        console.log('✓ Fixture added successfully!');
        console.log('');

        if (created.length > 0) {
            console.log('Created:');
            for (const file of created) {
                console.log(`  ${file}`);
            }
        }

        if (modified.length > 0) {
            console.log('Modified:');
            for (const file of modified) {
                console.log(`  ${file}`);
            }
        }

        if (skipped.length > 0) {
            console.log('Skipped (already exist):');
            for (const file of skipped) {
                console.log(`  ${file}`);
            }
        }

        console.log('');
        console.log('Next steps:');
        console.log('  Run npm install to fetch newly added dependencies.');
        console.log('');
    }
}
