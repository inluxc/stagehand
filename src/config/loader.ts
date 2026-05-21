/**
 * ConfigLoader — loads, merges, and validates configuration from three tiers.
 *
 * Precedence (highest to lowest):
 *   1. Environment variables (PW_* prefix)
 *   2. Environment file (.env.{environment}) via EnvLoader
 *   3. Configuration file (environments.json)
 *
 * Environment selection priority:
 *   1. Explicit `environmentName` parameter
 *   2. PW_ENVIRONMENT environment variable
 *   3. --environment CLI parameter
 *   4. Default: 'local'
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EnvLoader } from './env-loader';
import { ConfigurationError } from '../errors';
import type { FrameworkConfig, EnvironmentsFile } from './schema';

export class ConfigLoader {
    private readonly projectRoot: string;
    private readonly envLoader: EnvLoader;

    constructor(projectRoot?: string) {
        this.projectRoot = projectRoot ?? process.cwd();
        this.envLoader = new EnvLoader(this.projectRoot);
    }

    /**
     * Load configuration with three-tier precedence merge.
     * @param environmentName - Optional explicit environment name override
     */
    load(environmentName?: string): FrameworkConfig {
        // Determine the active environment
        const environment = this.resolveEnvironment(environmentName);

        // Tier 3 (lowest): Load environments.json
        const fileConfig = this.loadEnvironmentsFile(environment);

        // Tier 2 (medium): Load .env.{environment} file
        const envFileValues = this.envLoader.load(environment);

        // Tier 1 (highest): Read PW_* environment variables
        const envVarValues = this.readEnvironmentVariables();

        // Merge with precedence: env vars > .env file > environments.json
        const merged = this.merge(fileConfig, envFileValues, envVarValues, environment);

        return merged;
    }

    /**
     * Resolve the active environment name.
     * Priority: explicit param > PW_ENVIRONMENT env var > --environment CLI > 'local'
     */
    private resolveEnvironment(explicit?: string): string {
        if (explicit) {
            return explicit;
        }

        // Check PW_ENVIRONMENT env var
        const envVar = process.env['PW_ENVIRONMENT'];
        if (envVar) {
            return envVar;
        }

        // Check --environment CLI param
        const cliEnv = this.parseCliEnvironment();
        if (cliEnv) {
            return cliEnv;
        }

        return 'local';
    }

    /**
     * Parse --environment from process.argv.
     */
    private parseCliEnvironment(): string | undefined {
        const args = process.argv;
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--environment' && i + 1 < args.length) {
                return args[i + 1];
            }
            if (args[i]?.startsWith('--environment=')) {
                return args[i].split('=')[1];
            }
        }
        return undefined;
    }

    /**
     * Load and parse environments.json from the project root.
     * Returns the config for the specified environment.
     * Throws ConfigurationError if file is missing or invalid.
     */
    private loadEnvironmentsFile(environment: string): Partial<FrameworkConfig> {
        const filePath = path.resolve(this.projectRoot, 'environments.json');

        if (!fs.existsSync(filePath)) {
            throw new ConfigurationError(
                [],
                filePath,
                'File not found'
            );
        }

        let content: string;
        try {
            content = fs.readFileSync(filePath, 'utf-8');
        } catch (err) {
            throw new ConfigurationError(
                [],
                filePath,
                `Unable to read file: ${(err as Error).message}`
            );
        }

        let parsed: EnvironmentsFile;
        try {
            parsed = JSON.parse(content) as EnvironmentsFile;
        } catch (err) {
            throw new ConfigurationError(
                [],
                filePath,
                `Invalid JSON: ${(err as Error).message}`
            );
        }

        if (!parsed.environments || typeof parsed.environments !== 'object') {
            throw new ConfigurationError(
                [],
                filePath,
                'Missing or invalid "environments" property'
            );
        }

        // Return the environment-specific config, or empty object if environment not found
        return parsed.environments[environment] ?? {};
    }

    /**
     * Read all PW_* environment variables and return as a flat map.
     */
    private readEnvironmentVariables(): Record<string, string> {
        const result: Record<string, string> = {};

        for (const [key, value] of Object.entries(process.env)) {
            if (key.startsWith('PW_') && value !== undefined) {
                result[key] = value;
            }
        }

        return result;
    }

    /**
     * Merge three tiers into a FrameworkConfig.
     * Env vars (tier 1) > .env file (tier 2) > environments.json (tier 3)
     */
    private merge(
        fileConfig: Partial<FrameworkConfig>,
        envFileValues: Record<string, string>,
        envVarValues: Record<string, string>,
        environment: string
    ): FrameworkConfig {
        // Start with the file config as the base
        const config: FrameworkConfig = {
            environment,
            ...fileConfig,
        };

        // Override environment field
        config.environment = environment;

        // Apply .env file values (tier 2) over file config (tier 3)
        this.applyEnvFileValues(config, envFileValues);

        // Apply environment variables (tier 1) over everything
        this.applyEnvVarValues(config, envVarValues);

        return config;
    }

    /**
     * Apply values from the .env file to the config.
     * Maps PW_* keys from the .env file to config paths.
     */
    private applyEnvFileValues(config: FrameworkConfig, values: Record<string, string>): void {
        this.applyMappedValues(config, values);
    }

    /**
     * Apply environment variable values to the config.
     * Maps PW_* keys to config paths.
     */
    private applyEnvVarValues(config: FrameworkConfig, values: Record<string, string>): void {
        this.applyMappedValues(config, values);
    }

    /**
     * Apply a flat map of PW_* keyed values to the nested config structure.
     * PW_ENVIRONMENT is intentionally excluded — environment resolution is
     * handled separately by resolveEnvironment().
     */
    private applyMappedValues(config: FrameworkConfig, values: Record<string, string>): void {
        const mapping: Record<string, (config: FrameworkConfig, value: string) => void> = {
            'PW_OPENAPI_SPEC_PATH': (cfg, val) => {
                if (!cfg.openapi) cfg.openapi = { specPath: '' };
                cfg.openapi.specPath = val;
            },
            'PW_OPENAPI_BASE_URL': (cfg, val) => {
                if (!cfg.openapi) cfg.openapi = { specPath: '' };
                cfg.openapi.baseUrl = val;
            },
            'PW_DB_TYPE': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.type = val as 'postgresql' | 'mysql' | 'mssql' | 'sqlite';
            },
            'PW_DB_HOST': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.host = val;
            },
            'PW_DB_PORT': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.port = parseInt(val, 10);
            },
            'PW_DB_NAME': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.database = val;
            },
            'PW_DB_USERNAME': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.username = val;
            },
            'PW_DB_PASSWORD': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.password = val;
            },
            'PW_DB_ENCRYPT': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.encrypt = val.toLowerCase() === 'true';
            },
            'PW_DB_TRUST_SERVER_CERTIFICATE': (cfg, val) => {
                if (!cfg.database) cfg.database = { type: 'postgresql', database: '' };
                cfg.database.trustServerCertificate = val.toLowerCase() === 'true';
            },
            'PW_KAFKA_BROKERS': (cfg, val) => {
                if (!cfg.kafka) cfg.kafka = { brokers: [] };
                cfg.kafka.brokers = val.split(',').map(b => b.trim());
            },
            'PW_REDIS_HOST': (cfg, val) => {
                if (!cfg.redis) cfg.redis = { host: '', port: 6379 };
                cfg.redis.host = val;
            },
            'PW_REDIS_PORT': (cfg, val) => {
                if (!cfg.redis) cfg.redis = { host: '', port: 6379 };
                cfg.redis.port = parseInt(val, 10);
            },
            'PW_REDIS_PASSWORD': (cfg, val) => {
                if (!cfg.redis) cfg.redis = { host: '', port: 6379 };
                cfg.redis.password = val;
            },
            'PW_REDIS_KEY_PREFIX': (cfg, val) => {
                if (!cfg.redis) cfg.redis = { host: '', port: 6379 };
                cfg.redis.keyPrefix = val;
            },
            'PW_MONGODB_URI': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.uri = val;
            },
            'PW_MONGODB_HOST': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.host = val;
            },
            'PW_MONGODB_PORT': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.port = parseInt(val, 10);
            },
            'PW_MONGODB_DATABASE': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.database = val;
            },
            'PW_MONGODB_USERNAME': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.username = val;
            },
            'PW_MONGODB_PASSWORD': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.password = val;
            },
            'PW_MONGODB_AUTH_SOURCE': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.authSource = val;
            },
            'PW_MONGODB_SRV': (cfg, val) => {
                if (!cfg.mongodb) cfg.mongodb = { database: '' };
                cfg.mongodb.srv = val.toLowerCase() === 'true';
            },
            'PW_MOBILE_PLATFORM': (cfg, val) => {
                if (!cfg.mobilewright) cfg.mobilewright = { platform: 'ios', bundleId: '', deviceName: '', appPath: '' };
                cfg.mobilewright.platform = val as 'ios' | 'android';
            },
            'PW_MOBILE_BUNDLE_ID': (cfg, val) => {
                if (!cfg.mobilewright) cfg.mobilewright = { platform: 'ios', bundleId: '', deviceName: '', appPath: '' };
                cfg.mobilewright.bundleId = val;
            },
            'PW_MOBILE_DEVICE_NAME': (cfg, val) => {
                if (!cfg.mobilewright) cfg.mobilewright = { platform: 'ios', bundleId: '', deviceName: '', appPath: '' };
                cfg.mobilewright.deviceName = val;
            },
            'PW_MOBILE_APP_PATH': (cfg, val) => {
                if (!cfg.mobilewright) cfg.mobilewright = { platform: 'ios', bundleId: '', deviceName: '', appPath: '' };
                cfg.mobilewright.appPath = val;
            },
        };

        for (const [key, value] of Object.entries(values)) {
            const applier = mapping[key];
            if (applier && value !== '') {
                applier(config, value);
            }
        }
    }
}
