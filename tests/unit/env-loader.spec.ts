/**
 * Unit tests for EnvLoader — dotenv file parser and loader.
 *
 * Tests cover:
 * - Parsing key-value pairs
 * - Handling comments (lines starting with #)
 * - Handling empty lines
 * - Handling quoted values (single and double quotes)
 * - Graceful fallback for missing files
 */

import { test, expect } from '@playwright/test';
import { createEnvLoader } from '../../src/config/env-loader';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'env-loader-test-'));
}

function cleanup(dir: string): void {
    fs.rmSync(dir, { recursive: true, force: true });
}

test.describe('EnvLoader', () => {
    test('parses simple key-value pairs', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(path.join(dir, '.env.test'), 'KEY1=value1\nKEY2=value2\n');
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
        } finally {
            cleanup(dir);
        }
    });

    test('skips comment lines starting with #', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                '# This is a comment\nKEY=value\n# Another comment\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY: 'value' });
        } finally {
            cleanup(dir);
        }
    });

    test('skips empty lines', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                'KEY1=value1\n\n\nKEY2=value2\n\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
        } finally {
            cleanup(dir);
        }
    });

    test('strips double-quoted values', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                'KEY="hello world"\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY: 'hello world' });
        } finally {
            cleanup(dir);
        }
    });

    test('strips single-quoted values', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                "KEY='hello world'\n"
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY: 'hello world' });
        } finally {
            cleanup(dir);
        }
    });

    test('returns empty map when file does not exist', () => {
        const dir = createTempDir();
        try {
            const loader = createEnvLoader(dir);
            const result = loader.load('nonexistent');

            expect(result).toEqual({});
        } finally {
            cleanup(dir);
        }
    });

    test('handles values containing equals signs', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                'DATABASE_URL=postgres://user:pass@host:5432/db?sslmode=require\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({
                DATABASE_URL: 'postgres://user:pass@host:5432/db?sslmode=require',
            });
        } finally {
            cleanup(dir);
        }
    });

    test('handles empty values', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(path.join(dir, '.env.test'), 'KEY=\n');
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY: '' });
        } finally {
            cleanup(dir);
        }
    });

    test('handles Windows-style line endings (CRLF)', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                'KEY1=value1\r\nKEY2=value2\r\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
        } finally {
            cleanup(dir);
        }
    });

    test('trims whitespace around keys and values', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                '  KEY1  =  value1  \nKEY2 = value2\n'
            );
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({ KEY1: 'value1', KEY2: 'value2' });
        } finally {
            cleanup(dir);
        }
    });

    test('does not modify process.env', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(
                path.join(dir, '.env.test'),
                'ENV_LOADER_TEST_KEY=should_not_leak\n'
            );
            const loader = createEnvLoader(dir);
            loader.load('test');

            expect(process.env['ENV_LOADER_TEST_KEY']).toBeUndefined();
        } finally {
            cleanup(dir);
        }
    });

    test('loads environment-specific file based on environment name', () => {
        const dir = createTempDir();
        try {
            fs.writeFileSync(path.join(dir, '.env.local'), 'ENV=local\n');
            fs.writeFileSync(path.join(dir, '.env.dev'), 'ENV=dev\n');

            const loader = createEnvLoader(dir);

            expect(loader.load('local')).toEqual({ ENV: 'local' });
            expect(loader.load('dev')).toEqual({ ENV: 'dev' });
        } finally {
            cleanup(dir);
        }
    });

    test('handles mixed content with comments, empty lines, and values', () => {
        const dir = createTempDir();
        try {
            const content = [
                '# Database config',
                'DB_HOST=localhost',
                'DB_PORT=5432',
                '',
                '# Redis config',
                'REDIS_HOST=localhost',
                'REDIS_PORT=6379',
                '',
            ].join('\n');

            fs.writeFileSync(path.join(dir, '.env.test'), content);
            const loader = createEnvLoader(dir);
            const result = loader.load('test');

            expect(result).toEqual({
                DB_HOST: 'localhost',
                DB_PORT: '5432',
                REDIS_HOST: 'localhost',
                REDIS_PORT: '6379',
            });
        } finally {
            cleanup(dir);
        }
    });
});
