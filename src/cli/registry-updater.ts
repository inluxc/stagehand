/**
 * Registry Updater — handles parsing and modifying the fixture registry file
 * (`src/fixtures/index.ts`) to add new fixture imports and compositions.
 *
 * Uses string manipulation with marker comments rather than AST parsing.
 * The generated registry file includes:
 * - `// CLI:IMPORTS` at the top (where imports go)
 * - `// CLI:FIXTURES` inside the allFixtures object (where spreads go)
 *
 * @requirements 2.5, 2.10, 3.1, 3.2, 3.5
 */

import type { FixtureMetadata, InternalDependency } from './fixtures-metadata';

/** Marker comment where new import statements are inserted */
const IMPORTS_MARKER = '// CLI:IMPORTS';

/** Marker comment where new fixture spreads are inserted */
const FIXTURES_MARKER = '// CLI:FIXTURES';

/**
 * Handles registry file modifications for the `add` command.
 * Inserts imports and fixture spreads at known marker positions,
 * ensuring idempotent operations (no duplicates).
 */
export class RegistryUpdater {
    /**
     * Check if a fixture is already registered in the registry content.
     * Looks for the fixture's import path in the existing imports.
     *
     * @param registryContent - Current content of the registry file
     * @param fixture - Fixture metadata to check
     * @returns true if the fixture is already imported/registered
     */
    isRegistered(registryContent: string, fixture: FixtureMetadata): boolean {
        // Check if the import path already exists in the file
        return registryContent.includes(`from '${fixture.importPath}'`);
    }

    /**
     * Add a fixture import and spread to the registry content.
     * Inserts the import statement at the CLI:IMPORTS marker and
     * the spread expression at the CLI:FIXTURES marker.
     *
     * If the fixture is already registered, returns the content unchanged (idempotent).
     *
     * @param registryContent - Current content of the registry file
     * @param fixture - Fixture metadata to add
     * @returns Updated registry content with the fixture added
     */
    addFixture(registryContent: string, fixture: FixtureMetadata): string {
        if (this.isRegistered(registryContent, fixture)) {
            return registryContent;
        }

        // Build the import statement
        const importStatement = `import { ${fixture.exportedObject} } from '${fixture.importPath}';`;

        // Build the spread expression
        const spreadExpression = `    ...${fixture.exportedObject},`;

        // Insert import at the CLI:IMPORTS marker
        let updated = registryContent.replace(
            IMPORTS_MARKER,
            `${IMPORTS_MARKER}\n${importStatement}`,
        );

        // Insert spread at the CLI:FIXTURES marker
        updated = updated.replace(
            FIXTURES_MARKER,
            `${FIXTURES_MARKER}\n${spreadExpression}`,
        );

        // Add internal dependencies if any
        if (fixture.internalDependencies) {
            for (const dep of fixture.internalDependencies) {
                updated = this.addInternalDependency(updated, dep);
            }
        }

        return updated;
    }

    /**
     * Add an internal dependency to the registry content.
     * Internal dependencies are fixture definitions that other fixtures depend on
     * (e.g., `redisConfig` is needed by `redisClient`).
     *
     * If the dependency is already present, returns the content unchanged (idempotent).
     *
     * @param registryContent - Current content of the registry file
     * @param dep - Internal dependency to add
     * @returns Updated registry content with the dependency added
     */
    addInternalDependency(registryContent: string, dep: InternalDependency): string {
        // Check if this internal dependency is already present
        if (registryContent.includes(`...${dep.name}`) || registryContent.includes(`${dep.name}:`)) {
            return registryContent;
        }

        // Build the internal dependency definition block
        const depDefinition = `const ${dep.name} = {\n    ${dep.definition}\n};`;

        // Build the spread for the allFixtures object
        const spreadExpression = `    ...${dep.name},`;

        // Insert the definition before the CLI:FIXTURES marker (above allFixtures)
        // We place it just before the allFixtures declaration
        const allFixturesPattern = /^const allFixtures/m;
        if (allFixturesPattern.test(registryContent)) {
            registryContent = registryContent.replace(
                allFixturesPattern,
                `${depDefinition}\n\nconst allFixtures`,
            );
        }

        // Insert the spread at the CLI:FIXTURES marker
        registryContent = registryContent.replace(
            FIXTURES_MARKER,
            `${FIXTURES_MARKER}\n${spreadExpression}`,
        );

        return registryContent;
    }
}
