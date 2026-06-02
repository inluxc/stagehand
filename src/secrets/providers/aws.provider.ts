/**
 * AWS Secrets Manager provider.
 *
 * Retrieves secrets from AWS Secrets Manager using the AWS SDK.
 * Note: Requires `@aws-sdk/client-secrets-manager` to be installed for production use.
 * This implementation uses a stub that throws if the SDK is not available.
 */

import type { SecretsProvider } from '../provider.interface';
import { SecretsError } from '../../errors';

export interface AwsProviderOptions {
    /** AWS region (e.g., 'us-east-1') */
    region: string;
    /** Optional prefix prepended to secret keys when fetching from AWS */
    secretPrefix?: string;
}

export class AwsSecretsProvider implements SecretsProvider {
    readonly name = 'aws';
    private readonly region: string;
    private readonly secretPrefix: string;
    private client: unknown | null = null;

    constructor(options: AwsProviderOptions) {
        this.region = options.region;
        this.secretPrefix = options.secretPrefix ?? '';
    }

    async getSecret(key: string): Promise<string> {
        const client = await this.getClient();
        const secretId = `${this.secretPrefix}${key}`;

        try {
            const command = await this.createGetSecretValueCommand(secretId);
            const response = await (client as { send: (cmd: unknown) => Promise<{ SecretString?: string }> }).send(command);

            if (!response.SecretString) {
                throw new SecretsError(this.name, 'fetch', key, {
                    reason: 'Secret value is empty or binary (only string secrets are supported)',
                });
            }

            return response.SecretString;
        } catch (error) {
            if (error instanceof SecretsError) {
                throw error;
            }
            throw new SecretsError(
                this.name,
                'fetch',
                key,
                { reason: (error as Error).message, region: this.region },
                error as Error
            );
        }
    }

    async getSecrets(keys: string[]): Promise<Map<string, string>> {
        const results = new Map<string, string>();

        // AWS Secrets Manager doesn't have a native batch-get for arbitrary secret names,
        // so we fetch each secret individually.
        const fetchPromises = keys.map(async (key) => {
            const value = await this.getSecret(key);
            results.set(key, value);
        });

        await Promise.all(fetchPromises);
        return results;
    }

    /**
     * Lazily initializes the AWS Secrets Manager client.
     * Throws SecretsError if the AWS SDK is not installed.
     */
    private async getClient(): Promise<unknown> {
        if (this.client) {
            return this.client;
        }

        try {
            // Dynamic import to avoid hard dependency on AWS SDK.
            // The module name is constructed to prevent TypeScript from resolving it at compile time.
            const moduleName = '@aws-sdk/client-secrets-manager';
            const sdk = await (Function('m', 'return import(m)')(moduleName) as Promise<{
                SecretsManagerClient: new (config: { region: string }) => unknown;
            }>);
            this.client = new sdk.SecretsManagerClient({ region: this.region });
            return this.client;
        } catch {
            throw new SecretsError(this.name, 'fetch', undefined, {
                reason:
                    'AWS SDK not available. Install @aws-sdk/client-secrets-manager to use the AWS provider.',
                region: this.region,
            });
        }
    }

    /**
     * Creates a GetSecretValueCommand for the given secret ID.
     */
    private async createGetSecretValueCommand(secretId: string): Promise<unknown> {
        try {
            const moduleName = '@aws-sdk/client-secrets-manager';
            const sdk = await (Function('m', 'return import(m)')(moduleName) as Promise<{
                GetSecretValueCommand: new (input: { SecretId: string }) => unknown;
            }>);
            return new sdk.GetSecretValueCommand({ SecretId: secretId });
        } catch {
            throw new SecretsError(this.name, 'fetch', secretId, {
                reason: 'Failed to create AWS SDK command. Ensure @aws-sdk/client-secrets-manager is installed.',
            });
        }
    }
}
