/**
 * Loads a fixture's driver package on first use.
 *
 * Drivers (pg, kafkajs, webdriverio, ...) are optional peer dependencies:
 * a project installs only the ones for the fixtures it uses. Importing
 * `@inluxc/propmaster` loads none of them; each fixture loads its own the
 * first time a test requests it, and a missing one becomes a
 * MissingPackageError that names the package and the install command.
 */

import { MissingPackageError } from '../errors.js';

/**
 * The packages to install for each fixture. Keep in sync with
 * `peerDependencies` in package.json.
 */
export const FIXTURE_PACKAGES = {
    openApiClient: ['openapi-client-axios'],
    'openApiClient (YAML spec)': ['js-yaml'],
    'openApiClient (contract checks)': ['ajv', 'ajv-formats'],
    graphqlClient: ['graphql-request', 'graphql'],
    'databaseClient (postgresql)': ['pg'],
    'databaseClient (mysql)': ['mysql2'],
    'databaseClient (mssql)': ['mssql'],
    'databaseClient (sqlite)': ['better-sqlite3'],
    mongoDbClient: ['mongodb'],
    neo4jClient: ['neo4j-driver'],
    kafkaClient: ['kafkajs'],
    amqpClient: ['amqplib'],
    redisClient: ['ioredis'],
    otpClient: ['otplib'],
    'testData (faker)': ['@faker-js/faker'],
    appiumDriver: ['webdriverio'],
    'any backend with `container: true`': ['testcontainers'],
} as const satisfies Record<string, readonly string[]>;

const cache = new Map<string, Promise<unknown>>();

/** The package name a specifier belongs to: `mysql2/promise` → `mysql2`, `@scope/pkg/x` → `@scope/pkg`. */
export function packageNameOf(specifier: string): string {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** True when `err` says `pkg` itself can't be found (not one of its own imports failing). */
export function isMissingPackage(err: unknown, pkg: string): boolean {
    const e = err as { code?: unknown; message?: unknown } | null;
    if (!e || (e.code !== 'ERR_MODULE_NOT_FOUND' && e.code !== 'MODULE_NOT_FOUND')) return false;
    const message = String(e.message ?? '');
    return message.includes(`'${pkg}'`) || message.includes(`"${pkg}"`);
}

/**
 * Imports `specifier` for `fixtureName`, once per process. Throws
 * MissingPackageError when the package isn't installed; any other failure
 * (a broken install, a native build error) is rethrown unchanged.
 *
 * @param install packages to suggest installing, when more than the one imported
 */
export function loadOptional<T>(specifier: string, fixtureName: string, install?: readonly string[]): Promise<T> {
    let pending = cache.get(specifier);
    if (!pending) {
        const pkg = packageNameOf(specifier);
        pending = import(specifier).catch((err: unknown) => {
            cache.delete(specifier); // let a later test retry after the package is installed
            if (isMissingPackage(err, pkg)) {
                throw new MissingPackageError(fixtureName, pkg, [...(install ?? [pkg])], { cause: err });
            }
            throw err;
        });
        cache.set(specifier, pending);
    }
    return pending as Promise<T>;
}
