/**
 * OpenAPI Fixture — Example Test
 *
 * Demonstrates how to use the OpenAPI client fixture to call API operations
 * defined in an OpenAPI specification. Uses the OpenApiSteps class for
 * reusable step sequences.
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
import { OpenApiSteps } from '../../src/steps';

test.describe('OpenAPI Fixture Examples', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-API-001] call getInventory and verify response structure', { tag: ['@TC-API-001'] }, async ({ openApiClient }) => {
        const api = new OpenApiSteps(openApiClient);

        const response = await api.getInventory();

        await test.step('Step 1: Verify inventory response is a key-value map of status to count', async () => {
            expect(response.data).not.toBeNull();
            for (const [key, value] of Object.entries(response.data)) {
                expect(typeof key).toBe('string');
                expect(typeof value).toBe('number');
            }
        });
    });

    test('[TC-API-002] verify client base URL is set correctly', { tag: ['@TC-API-002'] }, async ({ openApiClient }) => {
        const api = new OpenApiSteps(openApiClient);

        await api.verifyBaseUrl();
        await api.verifyOperationMethodsExist(['getInventory', 'addPet', 'findPetsByStatus']);
    });

    test('[TC-API-003] access the underlying OpenAPIClientAxios instance', { tag: ['@TC-API-003'] }, async ({ openApiClient }) => {
        const api = new OpenApiSteps(openApiClient);

        const operations = await api.getOperations();

        await test.step('Step 1: Verify operation metadata includes paths and methods', async () => {
            const firstOp = operations[0];
            expect(firstOp).toHaveProperty('path');
            expect(firstOp).toHaveProperty('method');
        });
    });

    test('[TC-API-004] verify operation IDs are accessible from the spec', { tag: ['@TC-API-004'] }, async ({ openApiClient }) => {
        const api = new OpenApiSteps(openApiClient);

        const operationIds = await api.getOperationIds();

        await test.step('Step 1: Verify expected operation IDs exist', async () => {
            expect(operationIds).toContain('getInventory');
            expect(operationIds).toContain('addPet');
        });
    });
});
