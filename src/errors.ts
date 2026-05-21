/**
 * Error types for the Playwright Framework Template.
 *
 * All framework errors extend FrameworkError for consistent handling.
 * Each error class includes contextual fields to aid debugging.
 *
 * Hierarchy:
 *   FrameworkError
 *   ├── ConfigurationError      — config loading/validation failures
 *   ├── FixtureInitError        — fixture setup failures (connection, init, boot, install)
 *   ├── FixtureOperationError   — fixture runtime failures (query, produce, consume)
 *   ├── SecretsError            — secrets fetching/resolution failures
 *   └── DependencyError         — fixture dependency resolution failures
 */

/**
 * Base error class for all framework errors.
 */
export class FrameworkError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'FrameworkError';
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

/**
 * Thrown when configuration loading or validation fails.
 *
 * Contextual fields:
 * - missingKeys: list of missing config keys with their expected source
 * - filePath: path to the config file that failed to load/parse
 * - parseError: description of the parse failure
 */
export class ConfigurationError extends FrameworkError {
    constructor(
        public readonly missingKeys: Array<{ key: string; source: string }>,
        public readonly filePath?: string,
        public readonly parseError?: string
    ) {
        super(formatConfigError(missingKeys, filePath, parseError));
        this.name = 'ConfigurationError';
    }
}

/**
 * Thrown when a fixture fails during setup/initialization.
 *
 * Contextual fields via details:
 * - host, port: for connection failures (database, redis)
 * - specPath/specUrl: for OpenAPI spec load failures
 * - brokerAddress: for Kafka connection failures
 * - platform, deviceName, appPath: for Mobilewright boot/install failures
 * - timeout: timeout value that was exceeded
 * - reason: human-readable failure reason
 */
export class FixtureInitError extends FrameworkError {
    constructor(
        public readonly fixtureName: string,
        public readonly operation: 'connect' | 'init' | 'boot' | 'install',
        public readonly details: Record<string, unknown>,
        public readonly cause?: Error
    ) {
        super(formatFixtureError(fixtureName, operation, details), cause ? { cause } : undefined);
        this.name = 'FixtureInitError';
    }
}

/**
 * Thrown when a fixture operation fails at runtime.
 *
 * Contextual fields via details:
 * - sql: the SQL statement that failed (database)
 * - topic: the Kafka topic involved (kafka)
 * - reason: human-readable failure reason
 * - timeout: timeout value that was exceeded
 */
export class FixtureOperationError extends FrameworkError {
    constructor(
        public readonly fixtureName: string,
        public readonly operation: 'query' | 'produce' | 'consume' | 'find' | 'findOne' | 'insertOne' | 'insertMany' | 'updateOne' | 'updateMany' | 'deleteOne' | 'deleteMany' | 'aggregate',
        public readonly details: Record<string, unknown>,
        public readonly cause?: Error
    ) {
        super(formatFixtureError(fixtureName, operation, details), cause ? { cause } : undefined);
        this.name = 'FixtureOperationError';
    }
}

/**
 * Thrown when secrets fetching or resolution fails.
 *
 * Contextual fields:
 * - providerName: the secrets provider that was used
 * - operation: what was being attempted (fetch, timeout, resolve, mapping)
 * - secretKey: the specific secret key involved
 * - details: additional context (available providers, invalid field, etc.)
 */
export class SecretsError extends FrameworkError {
    constructor(
        public readonly providerName: string,
        public readonly operation: 'fetch' | 'timeout' | 'resolve' | 'mapping',
        public readonly secretKey?: string,
        public readonly details?: Record<string, unknown>,
        public readonly cause?: Error
    ) {
        super(formatSecretsError(providerName, operation, secretKey, details), cause ? { cause } : undefined);
        this.name = 'SecretsError';
    }
}

/**
 * Thrown when fixture dependency resolution fails.
 *
 * Contextual fields:
 * - fixtureName: the fixture that has the dependency issue
 * - missingDependency: name of the unresolved dependency
 * - cycleParticipants: list of fixture names involved in a circular dependency
 */
export class DependencyError extends FrameworkError {
    constructor(
        public readonly fixtureName: string,
        public readonly missingDependency?: string,
        public readonly cycleParticipants?: string[]
    ) {
        super(formatDependencyError(fixtureName, missingDependency, cycleParticipants));
        this.name = 'DependencyError';
    }
}

// --- Formatting helpers ---

function formatConfigError(
    missingKeys: Array<{ key: string; source: string }>,
    filePath?: string,
    parseError?: string
): string {
    const parts: string[] = ['Configuration error'];

    if (filePath && parseError) {
        parts.push(`failed to parse "${filePath}": ${parseError}`);
    } else if (filePath) {
        parts.push(`file "${filePath}" could not be loaded`);
    }

    if (missingKeys.length > 0) {
        const keyList = missingKeys
            .map(({ key, source }) => `"${key}" (expected in ${source})`)
            .join(', ');
        parts.push(`missing keys: ${keyList}`);
    }

    return parts.join(': ');
}

function formatFixtureError(
    fixtureName: string,
    operation: string,
    details: Record<string, unknown>
): string {
    const detailStr = Object.entries(details)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');

    return `Fixture "${fixtureName}" ${operation} failed: ${detailStr}`;
}

function formatSecretsError(
    providerName: string,
    operation: string,
    secretKey?: string,
    details?: Record<string, unknown>
): string {
    const parts: string[] = [`Secrets error [${providerName}] ${operation}`];

    if (secretKey) {
        parts.push(`key="${secretKey}"`);
    }

    if (details && Object.keys(details).length > 0) {
        const detailStr = Object.entries(details)
            .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
            .join(', ');
        parts.push(detailStr);
    }

    return parts.join(': ');
}

function formatDependencyError(
    fixtureName: string,
    missingDependency?: string,
    cycleParticipants?: string[]
): string {
    if (cycleParticipants && cycleParticipants.length > 0) {
        return `Circular dependency detected: ${cycleParticipants.join(' → ')} → ${cycleParticipants[0]}`;
    }

    if (missingDependency) {
        return `Fixture "${fixtureName}" depends on "${missingDependency}" which is not registered`;
    }

    return `Dependency error in fixture "${fixtureName}"`;
}
