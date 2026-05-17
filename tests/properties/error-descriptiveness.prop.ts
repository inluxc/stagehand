/**
 * Property 9: Error descriptiveness
 *
 * For any fixture operation that fails, the thrown error message SHALL contain
 * all contextual fields specified for that error type (e.g., host and port for
 * connection errors, SQL statement for query errors, topic for produce errors,
 * file path for config errors, platform and deviceName for mobile errors).
 *
 * We generate arbitrary error details and verify the error message contains all
 * required contextual fields.
 *
 * **Validates: Requirements 2.4, 3.5, 3.6, 4.5, 4.7, 5.5, 6.3, 6.4, 8.7**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import {
    ConfigurationError,
    FixtureInitError,
    FixtureOperationError,
    SecretsError,
} from '../../src/errors';

/**
 * Generates non-empty alphanumeric strings for error field values.
 */
const arbFieldValue = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_./: '.split('')),
    { minLength: 1, maxLength: 30 }
);

/**
 * Generates valid host names.
 */
const arbHost = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-.'.split('')),
    { minLength: 3, maxLength: 20 }
);

/**
 * Generates valid port numbers.
 */
const arbPort = fc.integer({ min: 1, max: 65535 });

/**
 * Generates valid fixture names.
 */
const arbFixtureName = fc.constantFrom('redis', 'kafka', 'database', 'openApiClient', 'mobilewright');

test.describe('Property 9: Error descriptiveness', () => {
    test('FixtureInitError for connection failures includes host, port, and reason', () => {
        fc.assert(
            fc.property(
                arbFixtureName,
                arbHost,
                arbPort,
                arbFieldValue,
                (fixtureName, host, port, reason) => {
                    const error = new FixtureInitError(fixtureName, 'connect', {
                        host,
                        port,
                        reason,
                    });

                    // Error message must contain all contextual fields
                    expect(error.message).toContain(fixtureName);
                    expect(error.message).toContain('connect');
                    expect(error.message).toContain(host);
                    expect(error.message).toContain(String(port));
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureInitError for OpenAPI spec failures includes specPath and reason', () => {
        fc.assert(
            fc.property(
                arbFieldValue,
                arbFieldValue,
                (specPath, reason) => {
                    const error = new FixtureInitError('openApiClient', 'init', {
                        specPath,
                        reason,
                    });

                    expect(error.message).toContain('openApiClient');
                    expect(error.message).toContain('init');
                    expect(error.message).toContain(specPath);
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureInitError for Mobilewright failures includes platform, deviceName, appPath, and reason', () => {
        fc.assert(
            fc.property(
                fc.constantFrom('ios', 'android') as fc.Arbitrary<string>,
                arbFieldValue,
                arbFieldValue,
                arbFieldValue,
                (platform, deviceName, appPath, reason) => {
                    const error = new FixtureInitError('mobilewright', 'boot', {
                        platform,
                        deviceName,
                        appPath,
                        reason,
                    });

                    expect(error.message).toContain('mobilewright');
                    expect(error.message).toContain('boot');
                    expect(error.message).toContain(platform);
                    expect(error.message).toContain(deviceName);
                    expect(error.message).toContain(appPath);
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureOperationError for query failures includes SQL statement and reason', () => {
        fc.assert(
            fc.property(
                arbFieldValue,
                arbFieldValue,
                (sql, reason) => {
                    const error = new FixtureOperationError('database', 'query', {
                        sql,
                        reason,
                    });

                    expect(error.message).toContain('database');
                    expect(error.message).toContain('query');
                    expect(error.message).toContain(sql);
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureOperationError for produce failures includes topic and reason', () => {
        fc.assert(
            fc.property(
                arbFieldValue,
                arbFieldValue,
                (topic, reason) => {
                    const error = new FixtureOperationError('kafka', 'produce', {
                        topic,
                        reason,
                    });

                    expect(error.message).toContain('kafka');
                    expect(error.message).toContain('produce');
                    expect(error.message).toContain(topic);
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('ConfigurationError includes all missing key names and their sources', () => {
        fc.assert(
            fc.property(
                fc.array(
                    fc.tuple(arbFieldValue, arbFieldValue).map(([key, source]) => ({ key, source })),
                    { minLength: 1, maxLength: 5 }
                ),
                (missingKeys) => {
                    const error = new ConfigurationError(missingKeys);

                    // Error message must contain each missing key and its source
                    for (const { key, source } of missingKeys) {
                        expect(error.message).toContain(key);
                        expect(error.message).toContain(source);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('ConfigurationError with file path includes the file path and parse error', () => {
        fc.assert(
            fc.property(
                arbFieldValue,
                arbFieldValue,
                (filePath, parseError) => {
                    const error = new ConfigurationError([], filePath, parseError);

                    expect(error.message).toContain(filePath);
                    expect(error.message).toContain(parseError);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureInitError for Redis connection failures includes host, port, and timeout', () => {
        fc.assert(
            fc.property(
                arbHost,
                arbPort,
                fc.integer({ min: 1000, max: 60000 }),
                arbFieldValue,
                (host, port, timeout, reason) => {
                    const error = new FixtureInitError('redis', 'connect', {
                        host,
                        port,
                        timeout,
                        reason,
                    });

                    expect(error.message).toContain('redis');
                    expect(error.message).toContain('connect');
                    expect(error.message).toContain(host);
                    expect(error.message).toContain(String(port));
                    expect(error.message).toContain(String(timeout));
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('FixtureInitError for Kafka broker failures includes brokerAddress and reason', () => {
        fc.assert(
            fc.property(
                arbHost,
                arbPort,
                arbFieldValue,
                (host, port, reason) => {
                    const brokerAddress = `${host}:${port}`;
                    const error = new FixtureInitError('kafka', 'connect', {
                        brokerAddress,
                        reason,
                    });

                    expect(error.message).toContain('kafka');
                    expect(error.message).toContain('connect');
                    expect(error.message).toContain(brokerAddress);
                    expect(error.message).toContain(reason);
                }
            ),
            { numRuns: 100 }
        );
    });
});
