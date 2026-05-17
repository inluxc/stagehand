/**
 * Configuration schema types for the Playwright Framework Template.
 *
 * Defines all configuration interfaces used across the framework,
 * including fixture-specific configs, secrets config, and the
 * top-level FrameworkConfig that composes them.
 */

/**
 * SASL authentication options for Kafka connections.
 */
export interface SASLOptions {
    mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
    username: string;
    password: string;
}

/**
 * Configuration for the OpenAPI client fixture.
 */
export interface OpenApiFixtureConfig {
    /** Local file path or remote URL to the OpenAPI specification. */
    specPath: string;
    /** Override base URL for API calls (takes precedence over spec server URLs). */
    baseUrl?: string;
    /** Timeout in ms for remote spec retrieval (default: 10000). */
    specTimeout?: number;
    /** Timeout in ms for client initialization (default: 30000). */
    initTimeout?: number;
}

/**
 * Configuration for the database connection fixture.
 */
export interface DatabaseFixtureConfig {
    /** Database engine type. */
    type: 'postgresql' | 'mysql' | 'mssql' | 'sqlite';
    /** Database server host. */
    host?: string;
    /** Database server port. */
    port?: number;
    /** Database name. */
    database: string;
    /** Database username. */
    username?: string;
    /** Database password. */
    password?: string;
    /** Connection timeout in ms (default: 10000). */
    connectionTimeout?: number;
    /** Query execution timeout in ms (default: 30000). */
    queryTimeout?: number;
    /** Whether to encrypt the connection (MSSQL: default true). */
    encrypt?: boolean;
    /** Whether to trust the server certificate (MSSQL: useful for local dev). */
    trustServerCertificate?: boolean;
}

/**
 * Configuration for the Kafka integration fixture.
 */
export interface KafkaFixtureConfig {
    /** List of Kafka broker addresses (host:port). */
    brokers: string[];
    /** Kafka client identifier. */
    clientId?: string;
    /** Whether to use SSL for broker connections. */
    ssl?: boolean;
    /** SASL authentication options. */
    sasl?: SASLOptions;
    /** Timeout in ms for disconnect operations (default: 5000). */
    disconnectTimeout?: number;
}

/**
 * Configuration for the Redis integration fixture.
 */
export interface RedisFixtureConfig {
    /** Redis server host. */
    host: string;
    /** Redis server port. */
    port: number;
    /** Redis authentication password. */
    password?: string;
    /** Redis database index. */
    db?: number;
    /** Test-scoped key prefix for isolation. */
    keyPrefix?: string;
    /** Connection timeout in ms (default: 5000). */
    connectionTimeout?: number;
}

/**
 * Configuration for the Mobilewright mobile testing fixture.
 */
export interface MobilewrightFixtureConfig {
    /** Target mobile platform. */
    platform: 'ios' | 'android';
    /** Application bundle identifier. */
    bundleId: string;
    /** Target device or simulator name. */
    deviceName: string;
    /** Path to the application binary. */
    appPath: string;
    /** Initialization timeout in ms (default: 60000). */
    timeout?: number;
}

/**
 * Configuration for the secrets provider.
 */
export interface SecretsConfig {
    /** Provider backend name (e.g., 'aws', 'vault', 'gitlab', 'azure', 'env-file'). */
    provider: string;
    /** Provider-specific options (region, vault URL, etc.). */
    options?: Record<string, unknown>;
    /** Maps secret key → Connection_Config field path. */
    keyMappings?: Record<string, string>;
    /** Fetch timeout in ms (default: 10000). */
    timeout?: number;
}

/**
 * Top-level framework configuration combining all fixture configs.
 */
export interface FrameworkConfig {
    /** Active environment name (local, dev, test, stg, prod). */
    environment: string;
    /** OpenAPI client fixture configuration. */
    openapi?: OpenApiFixtureConfig;
    /** Database fixture configuration. */
    database?: DatabaseFixtureConfig;
    /** Kafka fixture configuration. */
    kafka?: KafkaFixtureConfig;
    /** Redis fixture configuration. */
    redis?: RedisFixtureConfig;
    /** Mobilewright fixture configuration. */
    mobilewright?: MobilewrightFixtureConfig;
    /** Secrets provider configuration. */
    secrets?: SecretsConfig;
}

/**
 * Structure of the environments.json configuration file.
 */
export interface EnvironmentsFile {
    /** Map of environment name to its partial configuration. */
    environments: Record<string, Partial<FrameworkConfig>>;
}
