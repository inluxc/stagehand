/**
 * Provider registry for secrets provider backends.
 *
 * Exports all built-in provider classes and a factory function
 * that creates default provider instances from configuration options.
 */

export { AwsSecretsProvider, type AwsProviderOptions } from './aws.provider';
export { GitLabSecretsProvider, type GitLabProviderOptions } from './gitlab.provider';
export { VaultSecretsProvider, type VaultProviderOptions } from './vault.provider';
export { AzureSecretsProvider, type AzureProviderOptions } from './azure.provider';
export { EnvFileSecretsProvider, type EnvFileProviderOptions } from './env-file.provider';

import { SecretsProvider } from '../provider.interface';
import { AwsSecretsProvider, AwsProviderOptions } from './aws.provider';
import { GitLabSecretsProvider, GitLabProviderOptions } from './gitlab.provider';
import { VaultSecretsProvider, VaultProviderOptions } from './vault.provider';
import { AzureSecretsProvider, AzureProviderOptions } from './azure.provider';
import { EnvFileSecretsProvider, EnvFileProviderOptions } from './env-file.provider';

/**
 * Options for creating provider instances.
 * Each key corresponds to a provider name, and the value is the provider-specific options.
 */
export interface ProviderRegistryOptions {
    aws?: AwsProviderOptions;
    gitlab?: GitLabProviderOptions;
    vault?: VaultProviderOptions;
    azure?: AzureProviderOptions;
    'env-file'?: EnvFileProviderOptions;
}

/**
 * Creates an array of built-in provider instances based on the provided options.
 * Only providers with configuration options supplied will be instantiated.
 *
 * If no options are provided, creates a default env-file provider.
 *
 * @param options - Provider-specific configuration options
 * @returns Array of instantiated SecretsProvider instances
 */
export function createDefaultProviders(options?: ProviderRegistryOptions): SecretsProvider[] {
    const providers: SecretsProvider[] = [];

    if (options?.aws) {
        providers.push(new AwsSecretsProvider(options.aws));
    }

    if (options?.gitlab) {
        providers.push(new GitLabSecretsProvider(options.gitlab));
    }

    if (options?.vault) {
        providers.push(new VaultSecretsProvider(options.vault));
    }

    if (options?.azure) {
        providers.push(new AzureSecretsProvider(options.azure));
    }

    if (options?.['env-file']) {
        providers.push(new EnvFileSecretsProvider(options['env-file']));
    }

    // If no providers were configured, add a default env-file provider
    if (providers.length === 0) {
        providers.push(new EnvFileSecretsProvider());
    }

    return providers;
}

/**
 * Creates a single provider instance by name with the given options.
 *
 * @param name - Provider name ('aws', 'gitlab', 'vault', 'azure', 'env-file')
 * @param options - Provider-specific configuration options
 * @returns A SecretsProvider instance
 * @throws Error if the provider name is not recognized
 */
export function createProvider(name: string, options: Record<string, unknown>): SecretsProvider {
    switch (name) {
        case 'aws':
            return new AwsSecretsProvider(options as unknown as AwsProviderOptions);
        case 'gitlab':
            return new GitLabSecretsProvider(options as unknown as GitLabProviderOptions);
        case 'vault':
            return new VaultSecretsProvider(options as unknown as VaultProviderOptions);
        case 'azure':
            return new AzureSecretsProvider(options as unknown as AzureProviderOptions);
        case 'env-file':
            return new EnvFileSecretsProvider(options as unknown as EnvFileProviderOptions);
        default:
            throw new Error(`Unknown secrets provider: "${name}". Available providers: aws, gitlab, vault, azure, env-file`);
    }
}
