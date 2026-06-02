/**
 * GitLab CI/CD Variables provider.
 *
 * Retrieves secrets from GitLab CI/CD Variables via the GitLab API.
 * Uses the native `fetch` API for HTTP requests (available in Node.js 18+).
 */

import type { SecretsProvider } from '../provider.interface';
import { SecretsError } from '../../errors';

export interface GitLabProviderOptions {
    /** GitLab project ID (numeric or URL-encoded path) */
    projectId: string;
    /** GitLab API base URL (e.g., 'https://gitlab.com/api/v4') */
    apiUrl: string;
    /** Private token for authentication. Falls back to CI_JOB_TOKEN env var if not provided. */
    token?: string;
}

interface GitLabVariableResponse {
    key: string;
    value: string;
    variable_type: string;
    protected: boolean;
    masked: boolean;
    environment_scope: string;
}

export class GitLabSecretsProvider implements SecretsProvider {
    readonly name = 'gitlab';
    private readonly projectId: string;
    private readonly apiUrl: string;
    private readonly token: string;

    constructor(options: GitLabProviderOptions) {
        this.projectId = options.projectId;
        this.apiUrl = options.apiUrl.replace(/\/$/, ''); // Remove trailing slash
        this.token = options.token ?? process.env.CI_JOB_TOKEN ?? '';
    }

    async getSecret(key: string): Promise<string> {
        const url = `${this.apiUrl}/projects/${encodeURIComponent(this.projectId)}/variables/${encodeURIComponent(key)}`;

        try {
            const response = await fetch(url, {
                headers: this.buildHeaders(),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'Unknown error');
                throw new SecretsError(this.name, 'fetch', key, {
                    reason: `GitLab API returned ${response.status}: ${errorBody}`,
                    projectId: this.projectId,
                    apiUrl: this.apiUrl,
                });
            }

            const variable = (await response.json()) as GitLabVariableResponse;
            return variable.value;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                this.name,
                'fetch',
                key,
                {
                    reason: (error as Error).message,
                    projectId: this.projectId,
                    apiUrl: this.apiUrl,
                },
                error as Error
            );
        }
    }

    async getSecrets(keys: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        // GitLab API supports fetching individual variables, so we batch them with Promise.all
        const fetchPromises = keys.map(async (key) => {
            const value = await this.getSecret(key);
            results.set(key, value);
        });

        await Promise.all(fetchPromises);
        return results;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.token) {
            headers['PRIVATE-TOKEN'] = this.token;
        }

        return headers;
    }
}
