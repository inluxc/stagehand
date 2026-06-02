/**
 * Azure Key Vault provider.
 *
 * Retrieves secrets from Azure Key Vault using the Azure SDK.
 * Note: Requires `@azure/keyvault-secrets` and `@azure/identity` to be installed for production use.
 * This implementation uses a stub that throws if the SDK is not available.
 */

import type { SecretsProvider } from '../provider.interface';
import { SecretsError } from '../../errors';

export interface AzureProviderOptions {
    /** Azure Key Vault URL (e.g., 'https://my-vault.vault.azure.net') */
    vaultUrl: string;
}

export class AzureSecretsProvider implements SecretsProvider {
    readonly name = 'azure';
    private readonly vaultUrl: string;
    private client: unknown | null = null;

    constructor(options: AzureProviderOptions) {
        this.vaultUrl = options.vaultUrl.replace(/\/$/, ''); // Remove trailing slash
    }

    async getSecret(key: string): Promise<string> {
        const client = await this.getClient();

        try {
            const secret = await (client as { getSecret: (name: string) => Promise<{ value?: string }> }).getSecret(key);

            if (!secret.value) {
                throw new SecretsError(this.name, 'fetch', key, {
                    reason: 'Secret value is empty or not set',
                    vaultUrl: this.vaultUrl,
                });
            }

            return secret.value;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                this.name,
                'fetch',
                key,
                { reason: (error as Error).message, vaultUrl: this.vaultUrl },
                error as Error
            );
        }
    }

    async getSecrets(keys: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        const fetchPromises = keys.map(async (key) => {
            const value = await this.getSecret(key);
            results.set(key, value);
        });

        await Promise.all(fetchPromises);
        return results;
    }

    /**
     * Lazily initializes the Azure Key Vault SecretClient.
     * Throws SecretsError if the Azure SDK packages are not installed.
     */
    private async getClient(): Promise<unknown> {
        if (this.client) {
            return this.client;
        }

        try {
            // Dynamic imports to avoid hard dependency on Azure SDK.
            // Module names are constructed to prevent TypeScript from resolving them at compile time.
            const kvModuleName = '@azure/keyvault-secrets';
            const identityModuleName = '@azure/identity';

            const kvSdk = await (Function('m', 'return import(m)')(kvModuleName) as Promise<{
                SecretClient: new (url: string, credential: unknown) => unknown;
            }>);
            const identitySdk = await (Function('m', 'return import(m)')(identityModuleName) as Promise<{
                DefaultAzureCredential: new () => unknown;
            }>);

            const credential = new identitySdk.DefaultAzureCredential();
            this.client = new kvSdk.SecretClient(this.vaultUrl, credential);
            return this.client;
        } catch {
            throw new SecretsError(this.name, 'fetch', undefined, {
                reason:
                    'Azure SDK not available. Install @azure/keyvault-secrets and @azure/identity to use the Azure provider.',
                vaultUrl: this.vaultUrl,
            });
        }
    }
}
