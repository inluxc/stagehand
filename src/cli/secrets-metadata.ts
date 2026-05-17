/**
 * Secrets Provider Metadata Registry
 *
 * Single source of truth for secrets provider configuration used by the CLI
 * to generate environment files and configuration templates.
 */

export interface SecretsProviderMetadata {
    /** Provider identifier (lowercase) */
    name: string;
    /** Environment variables required by this provider */
    envVars: string[];
    /** Options template for environments.json secrets configuration */
    optionsTemplate: Record<string, unknown>;
}

export const SECRETS_PROVIDERS: Record<string, SecretsProviderMetadata> = {
    aws: {
        name: 'aws',
        envVars: ['AWS_REGION', 'AWS_SECRET_PREFIX'],
        optionsTemplate: { region: '', secretPrefix: '' },
    },
    azure: {
        name: 'azure',
        envVars: ['AZURE_KEY_VAULT_URL'],
        optionsTemplate: { keyVaultUrl: '' },
    },
    'env-file': {
        name: 'env-file',
        envVars: [],
        optionsTemplate: {},
    },
    gitlab: {
        name: 'gitlab',
        envVars: ['GITLAB_PROJECT_ID', 'GITLAB_API_URL'],
        optionsTemplate: { projectId: '', apiUrl: '' },
    },
    vault: {
        name: 'vault',
        envVars: ['VAULT_URL', 'VAULT_MOUNT_PATH'],
        optionsTemplate: { url: '', mountPath: '' },
    },
};

/**
 * Returns an array of all supported secrets provider names.
 */
export function getProviderNames(): string[] {
    return Object.keys(SECRETS_PROVIDERS);
}

/**
 * Returns the metadata for a specific secrets provider.
 * @param name - The provider name (case-sensitive, must be lowercase)
 * @returns The provider metadata, or undefined if not found
 */
export function getProviderMetadata(name: string): SecretsProviderMetadata | undefined {
    return SECRETS_PROVIDERS[name];
}
