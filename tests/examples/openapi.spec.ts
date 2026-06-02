/**
 * OpenAPI Fixture — Example Test
 *
 * Demonstrates how to use the OpenAPI client fixture to call API operations
 * defined in an OpenAPI specification. The fixture automatically initializes
 * the client with typed operation methods and handles teardown.
 *
 * Prerequisites:
 *   - A valid OpenAPI spec path configured in environments.json or via PW_OPENAPI_SPEC_PATH
 *   - The target API server running and accessible
 *
 * This example uses the Petstore v2 spec (https://petstore.swagger.io/v2/swagger.json)
 * with a Prism mock server in CI.
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('OpenAPI Fixture Examples', () => {
    // These tests require a running API server and valid OpenAPI spec.
    // Skip when not running in CI where infrastructure is available.
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    // Prism mock server can be unstable in containers; retry on transient failures.
    test.describe.configure({ retries: 2 });

    test('[TC-API-001] initialize client and call an operation', { tag: ['@TC-API-001'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Call getInventory operation with api_key header', async () => {
            const response = await (client as any).getInventory(null, null, {
                headers: { api_key: 'special-key' },
            });

            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
            expect(typeof response.data).toBe('object');
        });
    });

    test('[TC-API-002] call operation with path parameters', { tag: ['@TC-API-002'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Call findPetsByStatus with query parameter', async () => {
            const response = await (client as any).findPetsByStatus([{ status: 'available' }], null, {
                headers: { api_key: 'special-key' },
            });

            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
            expect(Array.isArray(response.data)).toBe(true);
        });
    });

    test('[TC-API-003] call operation with request body', { tag: ['@TC-API-003'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Call addPet with request body', async () => {
            const response = await (client as any).addPet(null, {
                name: 'TestPet',
                photoUrls: ['https://example.com/photo.jpg'],
                status: 'available',
            }, {
                headers: { api_key: 'special-key' },
            });

            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
            expect(response.data.name).toBe('TestPet');
        });
    });

    test('[TC-API-004] access the underlying OpenAPIClientAxios instance', { tag: ['@TC-API-004'] }, async ({ openApiClient }) => {
        const { api } = openApiClient;

        await test.step('Step 1: Retrieve operations from the parsed OpenAPI document', async () => {
            const operations = api.getOperations();
            expect(operations.length).toBeGreaterThan(0);
        });
    });
});
