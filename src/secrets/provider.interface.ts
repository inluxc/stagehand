/**
 * Extensible interface for secrets provider backends.
 *
 * Implementors must provide methods to fetch individual secrets
 * and batch-fetch multiple secrets from their backend service.
 *
 * Built-in providers: AWS Secrets Manager, GitLab CI/CD Variables,
 * HashiCorp Vault, Azure Key Vault, and local env-file fallback.
 */
export interface SecretsProvider {
    /** Unique name identifying this provider backend (e.g., 'aws', 'vault', 'gitlab'). */
    readonly name: string;

    /**
     * Fetch a single secret value by key.
     *
     * @param key - The secret key to retrieve
     * @returns The secret value as a string
     * @throws If the secret cannot be fetched from the backend
     */
    getSecret(key: string): Promise<string>;

    /**
     * Fetch multiple secret values by keys.
     *
     * @param keys - Array of secret keys to retrieve
     * @returns A map of key → secret value pairs
     * @throws If any secret cannot be fetched from the backend
     */
    getSecrets(keys: string[]): Promise<Map<string, string>>;
}
