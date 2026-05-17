/**
 * Custom Fixture Example
 *
 * Demonstrates how to create and register a custom fixture following the
 * framework's fixture pattern. Custom fixtures integrate with Playwright's
 * test.extend() mechanism and benefit from automatic lifecycle management.
 *
 * Pattern:
 *   1. Define a client interface
 *   2. Create a fixture definition object with setup/use/teardown
 *   3. Extend the base test object with your fixture
 *
 * @requirements 7.3, 1.6
 */

import { test as base, expect } from '../src';

// ─── Step 1: Define your client interface ────────────────────────────────────

/**
 * Interface for the custom S3 storage client.
 * Define the methods your tests will use.
 */
interface S3StorageClient {
    upload(bucket: string, key: string, content: Buffer | string): Promise<{ url: string }>;
    download(bucket: string, key: string): Promise<Buffer>;
    delete(bucket: string, key: string): Promise<void>;
    listObjects(bucket: string, prefix?: string): Promise<string[]>;
}

// ─── Step 2: Create the fixture definition ───────────────────────────────────

/**
 * Custom fixture definition following the framework pattern.
 *
 * The fixture object key becomes the parameter name in your tests.
 * The function receives dependencies (other fixtures) and a `use` callback.
 */
export const s3StorageFixture = {
    s3Storage: async (
        { /* you can depend on other fixtures here, e.g. config */ },
        use: (client: S3StorageClient) => Promise<void>
    ) => {
        // ── Setup Phase ──
        // Initialize your client, connect to services, prepare state.
        // This runs BEFORE the test body.

        const client: S3StorageClient = {
            async upload(bucket, key, content) {
                // In a real implementation, use AWS SDK:
                // const s3 = new S3Client({ region: 'us-east-1' });
                // await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: content }));
                return { url: `https://${bucket}.s3.amazonaws.com/${key}` };
            },

            async download(bucket, key) {
                // const s3 = new S3Client({ region: 'us-east-1' });
                // const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
                return Buffer.from('file-content');
            },

            async delete(bucket, key) {
                // const s3 = new S3Client({ region: 'us-east-1' });
                // await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
            },

            async listObjects(bucket, prefix) {
                // const s3 = new S3Client({ region: 'us-east-1' });
                // const response = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
                return [];
            },
        };

        // ── Use Phase ──
        // Provide the client to the test. The test body runs during this call.
        await use(client);

        // ── Teardown Phase ──
        // Clean up resources after the test completes.
        // This runs AFTER the test body, regardless of pass/fail.

        // Example: delete test artifacts from S3
        // await cleanupTestBucket(client);
    },
};

// ─── Step 3: Extend the test object ─────────────────────────────────────────

/**
 * Create a new test object that includes your custom fixture.
 * You can combine it with the framework's built-in fixtures.
 */
const test = base.extend<{ s3Storage: S3StorageClient }>({
    ...s3StorageFixture,
});

// ─── Step 4: Use in tests ────────────────────────────────────────────────────

test.describe('Custom S3 Storage Fixture', () => {
    // Skip — this is a documentation example, not a runnable test
    test.skip();

    test('upload and download a file', async ({ s3Storage }) => {
        // The fixture is available as a typed parameter
        const content = Buffer.from('Hello, World!');

        const { url } = await s3Storage.upload('test-bucket', 'test/hello.txt', content);
        expect(url).toContain('test-bucket');

        const downloaded = await s3Storage.download('test-bucket', 'test/hello.txt');
        expect(downloaded.toString()).toBe('Hello, World!');
    });

    test('list objects with prefix', async ({ s3Storage }) => {
        const objects = await s3Storage.listObjects('test-bucket', 'reports/');
        expect(Array.isArray(objects)).toBe(true);
    });

    test('combine with built-in fixtures', async ({ s3Storage, databaseClient }) => {
        // Custom fixtures work alongside built-in ones.
        // Here we use both s3Storage and databaseClient in the same test.

        // Upload a report
        const reportData = JSON.stringify({ total: 42 });
        const { url } = await s3Storage.upload('reports', 'daily/report.json', reportData);

        // Record the upload in the database
        await databaseClient.execute(
            'INSERT INTO uploads (url, created_at) VALUES ($1, NOW())',
            [url]
        );

        // Verify it was recorded
        const rows = await databaseClient.query<{ url: string }>(
            'SELECT url FROM uploads WHERE url = $1',
            [url]
        );
        expect(rows).toHaveLength(1);
    });
});
