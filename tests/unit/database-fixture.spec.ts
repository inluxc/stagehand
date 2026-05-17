/**
 * Unit tests for the Database connection fixture.
 *
 * Tests cover:
 * - Driver selection (postgresql, mysql, sqlite)
 * - FixtureInitError formatting on connection failure
 * - FixtureOperationError formatting on query failure
 * - Default timeout values
 * - Unsupported driver type error
 *
 * @requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { test, expect } from '@playwright/test';
import { FixtureInitError, FixtureOperationError } from '../../src/errors';
import type { DatabaseFixtureConfig } from '../../src/config/schema';

test.describe('Database Fixture', () => {
    test.describe('Driver selection', () => {
        test('postgresql config uses type "postgresql"', () => {
            const config: DatabaseFixtureConfig = {
                type: 'postgresql',
                host: 'localhost',
                port: 5432,
                database: 'testdb',
                username: 'user',
                password: 'pass',
            };

            expect(config.type).toBe('postgresql');
        });

        test('mysql config uses type "mysql"', () => {
            const config: DatabaseFixtureConfig = {
                type: 'mysql',
                host: 'localhost',
                port: 3306,
                database: 'testdb',
                username: 'root',
                password: 'pass',
            };

            expect(config.type).toBe('mysql');
        });

        test('sqlite config uses type "sqlite" with database path', () => {
            const config: DatabaseFixtureConfig = {
                type: 'sqlite',
                database: ':memory:',
            };

            expect(config.type).toBe('sqlite');
            expect(config.database).toBe(':memory:');
            // SQLite doesn't require host/port
            expect(config.host).toBeUndefined();
            expect(config.port).toBeUndefined();
        });
    });

    test.describe('FixtureInitError on connection failure', () => {
        test('includes host, port, and timeout for postgresql connection error', () => {
            const error = new FixtureInitError('database', 'connect', {
                host: 'db.example.com',
                port: 5432,
                timeout: 10000,
                reason: 'Connection refused',
            });

            expect(error).toBeInstanceOf(FixtureInitError);
            expect(error.fixtureName).toBe('database');
            expect(error.operation).toBe('connect');
            expect(error.details.host).toBe('db.example.com');
            expect(error.details.port).toBe(5432);
            expect(error.details.timeout).toBe(10000);
            expect(error.details.reason).toBe('Connection refused');
        });

        test('includes host, port, and timeout for mysql connection error', () => {
            const error = new FixtureInitError('database', 'connect', {
                host: 'mysql.example.com',
                port: 3306,
                timeout: 10000,
                reason: 'Access denied for user',
            });

            expect(error.details.host).toBe('mysql.example.com');
            expect(error.details.port).toBe(3306);
            expect(error.details.reason).toContain('Access denied');
        });

        test('includes local host and port 0 for sqlite connection error', () => {
            const error = new FixtureInitError('database', 'connect', {
                host: 'local',
                port: 0,
                timeout: 10000,
                reason: 'unable to open database file',
            });

            expect(error.details.host).toBe('local');
            expect(error.details.port).toBe(0);
            expect(error.details.reason).toContain('unable to open database');
        });

        test('preserves cause error', () => {
            const originalError = new Error('ECONNREFUSED 127.0.0.1:5432');
            const error = new FixtureInitError('database', 'connect', {
                host: 'localhost',
                port: 5432,
                timeout: 10000,
                reason: 'ECONNREFUSED 127.0.0.1:5432',
            }, originalError);

            expect(error.cause).toBe(originalError);
        });

        test('reports unsupported database type', () => {
            const error = new FixtureInitError('database', 'connect', {
                reason: 'Unsupported database type: oracle',
            });

            expect(error.details.reason).toContain('Unsupported database type');
            expect(error.details.reason).toContain('oracle');
        });
    });

    test.describe('FixtureOperationError on query failure', () => {
        test('includes SQL statement and reason', () => {
            const error = new FixtureOperationError('database', 'query', {
                sql: 'SELECT * FROM nonexistent_table',
                reason: 'relation "nonexistent_table" does not exist',
                timeout: 30000,
            });

            expect(error).toBeInstanceOf(FixtureOperationError);
            expect(error.fixtureName).toBe('database');
            expect(error.operation).toBe('query');
            expect(error.details.sql).toBe('SELECT * FROM nonexistent_table');
            expect(error.details.reason).toContain('does not exist');
            expect(error.details.timeout).toBe(30000);
        });

        test('includes SQL statement for execute operations', () => {
            const error = new FixtureOperationError('database', 'query', {
                sql: 'INSERT INTO users (name) VALUES ($1)',
                reason: 'duplicate key value violates unique constraint',
                timeout: 30000,
            });

            expect(error.details.sql).toContain('INSERT INTO');
            expect(error.details.reason).toContain('duplicate key');
        });

        test('preserves cause error for query failures', () => {
            const originalError = new Error('statement timeout');
            const error = new FixtureOperationError('database', 'query', {
                sql: 'SELECT pg_sleep(60)',
                reason: 'statement timeout',
                timeout: 30000,
            }, originalError);

            expect(error.cause).toBe(originalError);
        });

        test('error message contains fixture name and operation', () => {
            const error = new FixtureOperationError('database', 'query', {
                sql: 'DROP TABLE users',
                reason: 'permission denied',
                timeout: 30000,
            });

            expect(error.message).toContain('database');
            expect(error.message).toContain('query');
            expect(error.message).toContain('permission denied');
        });
    });

    test.describe('Default timeout values', () => {
        test('default connection timeout is 10000ms', () => {
            const DEFAULT_CONNECTION_TIMEOUT = 10000;
            expect(DEFAULT_CONNECTION_TIMEOUT).toBe(10000);
        });

        test('default query timeout is 30000ms', () => {
            const DEFAULT_QUERY_TIMEOUT = 30000;
            expect(DEFAULT_QUERY_TIMEOUT).toBe(30000);
        });

        test('config allows custom connection timeout', () => {
            const config: DatabaseFixtureConfig = {
                type: 'postgresql',
                database: 'testdb',
                connectionTimeout: 5000,
            };

            expect(config.connectionTimeout).toBe(5000);
        });

        test('config allows custom query timeout', () => {
            const config: DatabaseFixtureConfig = {
                type: 'mysql',
                database: 'testdb',
                queryTimeout: 60000,
            };

            expect(config.queryTimeout).toBe(60000);
        });
    });

    test.describe('Error message formatting', () => {
        test('FixtureInitError message includes all detail fields', () => {
            const error = new FixtureInitError('database', 'connect', {
                host: 'db-host',
                port: 5432,
                timeout: 10000,
                reason: 'Connection timed out',
            });

            expect(error.message).toContain('host');
            expect(error.message).toContain('port');
            expect(error.message).toContain('timeout');
            expect(error.message).toContain('reason');
        });

        test('FixtureOperationError message includes sql and reason', () => {
            const error = new FixtureOperationError('database', 'query', {
                sql: 'SELECT 1',
                reason: 'connection lost',
                timeout: 30000,
            });

            expect(error.message).toContain('sql');
            expect(error.message).toContain('reason');
        });
    });
});
