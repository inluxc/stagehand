/**
 * EnvLoader — loads and parses per-environment dotenv files.
 *
 * Looks for `.env.{environment}` in the project root, parses dotenv format
 * (key-value pairs, comments, empty lines, quoted values), and returns
 * a Record<string, string> without modifying process.env.
 *
 * If the file does not exist, returns an empty map (graceful fallback).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Factory function to create an EnvLoader instance.
 */
export function createEnvLoader(projectRoot?: string): EnvLoader {
    return new EnvLoader(projectRoot);
}

export class EnvLoader {
    private readonly projectRoot: string;

    constructor(projectRoot?: string) {
        this.projectRoot = projectRoot ?? process.cwd();
    }

    /**
     * Load and parse the `.env.{environment}` file.
     * Returns an empty map if the file does not exist.
     */
    load(environment: string): Record<string, string> {
        const filePath = path.resolve(this.projectRoot, `.env.${environment}`);

        if (!fs.existsSync(filePath)) {
            return {};
        }

        const content = fs.readFileSync(filePath, 'utf-8');
        return this.parse(content);
    }

    /**
     * Parse dotenv-format content into key-value pairs.
     * Supports:
     * - KEY=value
     * - Comments (lines starting with #)
     * - Empty lines
     * - Quoted values (single or double quotes)
     * - Inline comments after unquoted values
     */
    private parse(content: string): Record<string, string> {
        const result: Record<string, string> = {};
        const lines = content.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();

            // Skip empty lines and comments
            if (trimmed === '' || trimmed.startsWith('#')) {
                continue;
            }

            // Match KEY=VALUE pattern
            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex === -1) {
                continue;
            }

            const key = trimmed.substring(0, separatorIndex).trim();
            let value = trimmed.substring(separatorIndex + 1).trim();

            // Handle quoted values
            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            if (key) {
                result[key] = value;
            }
        }

        return result;
    }
}
