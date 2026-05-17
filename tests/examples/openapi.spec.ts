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
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('OpenAPI Fixture Examples', () => {
    // These tests require a running API server and valid OpenAPI spec.
    // Skip when not running in CI where infrastructure is available.
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('initialize client and call an operation', async ({ openApiClient }) => {
        // The openApiClient fixture provides:
        //   - client: an Axios instance extended with operation methods from the spec
        //   - api: the underlying OpenAPIClientAxios instance for advanced usage

        const { client, api } = openApiClient;

        // Call an operation defined in the OpenAPI spec by its operationId.
        // For example, if the spec defines: operationId: "getUsers"
        const response = await (client as any).getUsers();

        // Validate the response
        expect(response.status).toBe(200);
        expect(response.data).toBeDefined();
        expect(Array.isArray(response.data)).toBe(true);
    });

    test('call operation with parameters', async ({ openApiClient }) => {
        const { client } = openApiClient;

        // Operations with path parameters pass them as the first argument.
        // For example: operationId: "getUserById" with path param {id}
        const response = await (client as any).getUserById({ id: '123' });

        expect(response.status).toBe(200);
        expect(response.data.id).toBe('123');
    });

    test('call operation with request body', async ({ openApiClient }) => {
        const { client } = openApiClient;

        // POST operations pass the request body as the second argument.
        // For example: operationId: "createUser"
        const response = await (client as any).createUser(null, {
            name: 'Test User',
            email: 'test@example.com',
        });

        expect(response.status).toBe(201);
        expect(response.data.name).toBe('Test User');
    });

    test('access the underlying OpenAPIClientAxios instance', async ({ openApiClient }) => {
        const { api } = openApiClient;

        // The api instance gives access to the parsed OpenAPI document
        // and can be used for advanced scenarios like inspecting available operations.
        const operations = api.getOperations();

        expect(operations.length).toBeGreaterThan(0);
    });
});
