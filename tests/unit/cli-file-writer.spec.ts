/**
 * Unit tests for the FileWriter class.
 *
 * Tests cover:
 * - write() creates files with correct content
 * - write() creates parent directories as needed
 * - getWrittenFiles() tracks all written files
 * - rollback() removes all written files
 * - rollback() removes empty directories created during the session
 * - update() modifies file content correctly
 * - update() preserves original content if modifier throws
 * - exists() returns correct boolean for existing/non-existing files
 * - read() returns file content
 *
 * @requirements 1.16, 3.6
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileWriter } from '../../src/cli/file-writer';

let tmpDir: string;
let writer: FileWriter;

test.beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-writer-test-'));
    writer = new FileWriter();
});

test.afterEach(() => {
    // Clean up the temporary directory
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

test.describe('FileWriter', () => {
    test.describe('write()', () => {
        test('creates a file with the correct content', () => {
            const filePath = path.join(tmpDir, 'hello.txt');
            writer.write(filePath, 'hello world');

            expect(fs.existsSync(filePath)).toBe(true);
            expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello world');
        });

        test('creates parent directories if they do not exist', () => {
            const filePath = path.join(tmpDir, 'nested', 'deep', 'file.ts');
            writer.write(filePath, 'export const x = 1;');

            expect(fs.existsSync(filePath)).toBe(true);
            expect(fs.readFileSync(filePath, 'utf-8')).toBe('export const x = 1;');
        });
    });

    test.describe('getWrittenFiles()', () => {
        test('returns empty array when no files have been written', () => {
            expect(writer.getWrittenFiles()).toEqual([]);
        });

        test('tracks all files written during the session', () => {
            const file1 = path.join(tmpDir, 'a.txt');
            const file2 = path.join(tmpDir, 'b.txt');
            const file3 = path.join(tmpDir, 'sub', 'c.txt');

            writer.write(file1, 'content a');
            writer.write(file2, 'content b');
            writer.write(file3, 'content c');

            const written = writer.getWrittenFiles();
            expect(written).toContain(file1);
            expect(written).toContain(file2);
            expect(written).toContain(file3);
            expect(written).toHaveLength(3);
        });

        test('returns a copy — mutating the result does not affect internal state', () => {
            const filePath = path.join(tmpDir, 'file.txt');
            writer.write(filePath, 'data');

            const result = writer.getWrittenFiles();
            result.push('/fake/path');

            expect(writer.getWrittenFiles()).toHaveLength(1);
        });
    });

    test.describe('rollback()', () => {
        test('removes all files written during the session', () => {
            const file1 = path.join(tmpDir, 'one.txt');
            const file2 = path.join(tmpDir, 'two.txt');

            writer.write(file1, 'one');
            writer.write(file2, 'two');

            expect(fs.existsSync(file1)).toBe(true);
            expect(fs.existsSync(file2)).toBe(true);

            writer.rollback();

            expect(fs.existsSync(file1)).toBe(false);
            expect(fs.existsSync(file2)).toBe(false);
        });

        test('removes empty directories created during the session', () => {
            // ensureDir is called with the direct parent of the file.
            // When the parent doesn't exist, it creates it recursively and tracks
            // only the path passed to ensureDir. Rollback removes tracked dirs
            // that are empty after file removal.
            const createdDir = path.join(tmpDir, 'created');
            const nestedFile = path.join(createdDir, 'file.txt');

            writer.write(nestedFile, 'content');

            // Verify directory was created
            expect(fs.existsSync(createdDir)).toBe(true);

            writer.rollback();

            // File should be gone
            expect(fs.existsSync(nestedFile)).toBe(false);
            // The tracked directory should be removed since it's now empty
            expect(fs.existsSync(createdDir)).toBe(false);
        });

        test('does not remove directories that still contain other files', () => {
            // Create a file outside the writer's tracking
            const preExisting = path.join(tmpDir, 'shared', 'existing.txt');
            fs.mkdirSync(path.join(tmpDir, 'shared'), { recursive: true });
            fs.writeFileSync(preExisting, 'pre-existing');

            // Write a file in the same directory via the writer
            const tracked = path.join(tmpDir, 'shared', 'tracked.txt');
            writer.write(tracked, 'tracked content');

            writer.rollback();

            // Tracked file should be removed
            expect(fs.existsSync(tracked)).toBe(false);
            // Directory should remain because it still has the pre-existing file
            expect(fs.existsSync(path.join(tmpDir, 'shared'))).toBe(true);
            expect(fs.existsSync(preExisting)).toBe(true);
        });

        test('clears tracking state after rollback', () => {
            const filePath = path.join(tmpDir, 'temp.txt');
            writer.write(filePath, 'temp');

            writer.rollback();

            expect(writer.getWrittenFiles()).toEqual([]);
        });
    });

    test.describe('update()', () => {
        test('modifies file content correctly', () => {
            const filePath = path.join(tmpDir, 'config.json');
            fs.writeFileSync(filePath, '{"name": "old"}', 'utf-8');

            writer.update(filePath, (content) => {
                return content.replace('old', 'new');
            });

            expect(fs.readFileSync(filePath, 'utf-8')).toBe('{"name": "new"}');
        });

        test('preserves original content if modifier throws', () => {
            const filePath = path.join(tmpDir, 'important.txt');
            const originalContent = 'original content must survive';
            fs.writeFileSync(filePath, originalContent, 'utf-8');

            expect(() => {
                writer.update(filePath, () => {
                    throw new Error('modifier failed');
                });
            }).toThrow('modifier failed');

            expect(fs.readFileSync(filePath, 'utf-8')).toBe(originalContent);
        });
    });

    test.describe('exists()', () => {
        test('returns true for an existing file', () => {
            const filePath = path.join(tmpDir, 'exists.txt');
            fs.writeFileSync(filePath, 'content', 'utf-8');

            expect(writer.exists(filePath)).toBe(true);
        });

        test('returns false for a non-existing file', () => {
            const filePath = path.join(tmpDir, 'does-not-exist.txt');

            expect(writer.exists(filePath)).toBe(false);
        });

        test('returns true for an existing directory', () => {
            const dirPath = path.join(tmpDir, 'some-dir');
            fs.mkdirSync(dirPath);

            expect(writer.exists(dirPath)).toBe(true);
        });
    });

    test.describe('read()', () => {
        test('returns file content as a UTF-8 string', () => {
            const filePath = path.join(tmpDir, 'readable.txt');
            fs.writeFileSync(filePath, 'file content here', 'utf-8');

            expect(writer.read(filePath)).toBe('file content here');
        });

        test('returns content written by write()', () => {
            const filePath = path.join(tmpDir, 'written.txt');
            writer.write(filePath, 'written via FileWriter');

            expect(writer.read(filePath)).toBe('written via FileWriter');
        });
    });
});
