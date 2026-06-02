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

    test('[TC-API-001] initialize client and call getInventory', { tag: ['@TC-API-001'] }, async ({ openApiClient }) => {
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

    test('[TC-API-002] verify response data structure from getInventory', { tag: ['@TC-API-002'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Call getInventory and capture response', async () => {
            const response = await (client as any).getInventory(null, null, {
                headers: { api_key: 'special-key' },
            });

            expect(response.status).toBe(200);
        });

        await test.step('Step 2: Verify inventory response is a key-value map', async () => {
            const response = await (client as any).getInventory(null, null, {
                headers: { api_key: 'special-key' },
            });

            // getInventory returns a map of status string → count number
            expect(typeof response.data).toBe('object');
            expect(response.data).not.toBeNull();
            for (const [key, value] of Object.entries(response.data)) {
                expect(typeof key).toBe('string');
                expect(typeof value).toBe('number');
            }
        });
    });

    test('[TC-API-003] verify client base URL is set correctly', { tag: ['@TC-API-003'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Verify client defaults.baseURL matches configured base URL', async () => {
            // The fixture should configure the client with PW_OPENAPI_BASE_URL
            expect(client.defaults.baseURL).toBeDefined();
            expect(client.defaults.baseURL).toContain('http');
        });

        await test.step('Step 2: Verify client has operation methods from the spec', async () => {
            // openapi-client-axios attaches operation methods to the client
            expect(typeof (client as any).getInventory).toBe('function');
            expect(typeof (client as any).addPet).toBe('function');
            expect(typeof (client as any).findPetsByStatus).toBe('function');
        });
    });

    test('[TC-API-004] access the underlying OpenAPIClientAxios instance', { tag: ['@TC-API-004'] }, async ({ openApiClient }) => {
        const { api } = openApiClient;

        await test.step('Step 1: Retrieve operations from the parsed OpenAPI document', async () => {
            const operations = api.getOperations();
            expect(operations.length).toBeGreaterThan(0);
        });

        await test.step('Step 2: Verify operation metadata includes paths and methods', async () => {
            const operations = api.getOperations();
            const firstOp = operations[0];
            expect(firstOp).toHaveProperty('path');
            expect(firstOp).toHaveProperty('method');
        });
    });
});
