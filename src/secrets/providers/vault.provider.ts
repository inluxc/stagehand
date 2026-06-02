/**
 * HashiCorp Vault provider.
 *
 * Retrieves secrets from HashiCorp Vault via the HTTP API (KV v2 secrets engine).
 * Uses the native `fetch` API for HTTP requests (available in Node.js 18+).
 *
 * Supported authentication methods:
 *   - Token-based (VAULT_TOKEN env var or explicit token option)
 *   - AppRole (role_id + secret_id for CI/CD pipelines)
 *
 * Supports Vault Enterprise namespaces via the `namespace` option.
 */

import type { SecretsProvider } from '../provider.interface';
import { SecretsError } from '../../errors';

export interface VaultProviderOptions {
    /** Vault server URL (e.g., 'https://vault.example.com') */
    url: string;
    /** Mount path for the KV v2 secrets engine (e.g., 'secret/data/playwright') */
    mountPath: string;
    /** Vault token for authentication. Falls back to VAULT_TOKEN env var if not provided. */
    token?: string;
    /** AppRole authentication: role_id. Falls back to VAULT_ROLE_ID env var. */
    roleId?: string;
    /** AppRole authentication: secret_id. Falls back to VAULT_SECRET_ID env var. */
    secretId?: string;
    /** Vault Enterprise namespace (e.g., 'admin/team-qa'). Falls back to VAULT_NAMESPACE env var. */
    namespace?: string;
    /** KV secrets engine version: 1 or 2 (default: 2). */
    kvVersion?: 1 | 2;
}

interface VaultKV2Response {
    data: {
        data: Record<string, string>;
        metadata: {
            created_time: string;
            version: number;
        };
    };
}

interface VaultKV1Response {
    data: Record<string, string>;
}

interface VaultAuthResponse {
    auth: {
        client_token: string;
        lease_duration: number;
        renewable: boolean;
    };
}

export class VaultSecretsProvider implements SecretsProvider {
    readonly name = 'vault';
    private readonly url: string;
    private readonly mountPath: string;
    private readonly namespace: string | undefined;
    private readonly kvVersion: 1 | 2;
    private readonly roleId: string | undefined;
    private readonly secretId: string | undefined;
    private token: string;

    constructor(options: VaultProviderOptions) {
        this.url = options.url.replace(/\/$/, ''); // Remove trailing slash
        this.mountPath = options.mountPath.replace(/^\/|\/$/g, ''); // Trim slashes
        this.token = options.token ?? process.env.VAULT_TOKEN ?? '';
        this.roleId = options.roleId ?? process.env.VAULT_ROLE_ID;
        this.secretId = options.secretId ?? process.env.VAULT_SECRET_ID;
        this.namespace = options.namespace ?? process.env.VAULT_NAMESPACE;
        this.kvVersion = options.kvVersion ?? 2;
    }

    async getSecret(key: string): Promise<string> {
        await this.ensureAuthenticated();

        // In Vault KV v2, secrets are stored as key-value pairs within a path.
        // We treat the key as the path and return the 'value' field, or if the
        // secret is a single-value secret, we return the first value found.
        const secretData = await this.fetchSecretData(key);

        // If the secret data has a 'value' field, return it directly
        if ('value' in secretData) {
            return secretData['value'];
        }

        // If the key itself exists as a field in the data, return it
        if (key in secretData) {
            return secretData[key];
        }

        // Otherwise return the first value in the data object
        const values = Object.values(secretData);
        if (values.length === 0) {
            throw new SecretsError(this.name, 'fetch', key, {
                reason: 'Secret path exists but contains no data',
                vaultUrl: this.url,
                mountPath: this.mountPath,
            });
        }

        return values[0];
    }

    async getSecrets(keys: string[]): Promise<Map<string, string>> {
        await this.ensureAuthenticated();

        const results = new Map<string, string>();

        const fetchPromises = keys.map(async (key) => {
            const value = await this.getSecret(key);
            results.set(key, value);
        });

        await Promise.all(fetchPromises);
        return results;
    }

    /**
     * Ensures the provider has a valid token.
     * If no token is set but AppRole credentials are available, authenticates via AppRole.
     */
    private async ensureAuthenticated(): Promise<void> {
        if (this.token) {
            return;
        }

        if (this.roleId && this.secretId) {
            await this.authenticateAppRole();
            return;
        }

        throw new SecretsError(this.name, 'fetch', undefined, {
            reason: 'No authentication method available. Provide a token (VAULT_TOKEN), or AppRole credentials (VAULT_ROLE_ID + VAULT_SECRET_ID).',
            vaultUrl: this.url,
        });
    }

    /**
     * Authenticates using AppRole method and stores the resulting client token.
     */
    private async authenticateAppRole(): Promise<void> {
        const url = `${this.url}/v1/auth/approle/login`;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.buildHeaders(false),
                body: JSON.stringify({
                    role_id: this.roleId,
                    secret_id: this.secretId,
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'Unknown error');
                throw new SecretsError(this.name, 'fetch', undefined, {
                    reason: `AppRole authentication failed (${response.status}): ${errorBody}`,
                    vaultUrl: this.url,
                });
            }

            const body = (await response.json()) as VaultAuthResponse;

            if (!body.auth?.client_token) {
                throw new SecretsError(this.name, 'fetch', undefined, {
                    reason: 'AppRole authentication response missing client_token',
                    vaultUrl: this.url,
                });
            }

            this.token = body.auth.client_token;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                this.name,
                'fetch',
                undefined,
                {
                    reason: `AppRole authentication failed: ${(error as Error).message}`,
                    vaultUrl: this.url,
                },
                error as Error
            );
        }
    }

    /**
     * Fetches secret data from Vault at the given path.
     * Supports both KV v1 and KV v2 response formats.
     */
    private async fetchSecretData(secretPath: string): Promise<Record<string, string>> {
        const url = `${this.url}/v1/${this.mountPath}/${encodeURIComponent(secretPath)}`;

        try {
            const response = await fetch(url, {
                headers: this.buildHeaders(true),
            });

            if (!response.ok) {
                const errorBody = await response.text().catch(() => 'Unknown error');
                throw new SecretsError(this.name, 'fetch', secretPath, {
                    reason: `Vault API returned ${response.status}: ${errorBody}`,
                    vaultUrl: this.url,
                    mountPath: this.mountPath,
                });
            }

            const body = await response.json();

            if (this.kvVersion === 2) {
                const kv2Body = body as VaultKV2Response;
                if (!kv2Body.data?.data) {
                    throw new SecretsError(this.name, 'fetch', secretPath, {
                        reason: 'Unexpected Vault KV v2 response format (missing data.data)',
                        vaultUrl: this.url,
                        mountPath: this.mountPath,
                    });
                }
                return kv2Body.data.data;
            } else {
                const kv1Body = body as VaultKV1Response;
                if (!kv1Body.data) {
                    throw new SecretsError(this.name, 'fetch', secretPath, {
                        reason: 'Unexpected Vault KV v1 response format (missing data)',
                        vaultUrl: this.url,
                        mountPath: this.mountPath,
                    });
                }
                return kv1Body.data;
            }
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                this.name,
                'fetch',
                secretPath,
                {
                    reason: (error as Error).message,
                    vaultUrl: this.url,
                    mountPath: this.mountPath,
                },
                error as Error
            );
        }
    }

    /**
     * Builds request headers including token and optional namespace.
     */
    private buildHeaders(includeToken: boolean): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (includeToken && this.token) {
            headers['X-Vault-Token'] = this.token;
        }

        if (this.namespace) {
            headers['X-Vault-Namespace'] = this.namespace;
        }

        return headers;
    }
}
