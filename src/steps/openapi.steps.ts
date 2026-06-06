/**
 * OpenAPI Step Class
 *
 * Reusable step sequences for OpenAPI client operations.
 * Wraps common API interactions so spec files stay concise.
 */

import { test, expect } from '../index';
import type { OpenApiClient } from '../fixtures/openapi.fixture';

export class OpenApiSteps {
    constructor(private openApiClient: OpenApiClient) {}

    private get client(): any {
        return this.openApiClient.client as any;
    }

    get api() {
        return this.openApiClient.api;
    }

    /**
     * Calls an operation by name with optional params and returns the response.
     */
    async callOperation(operationId: string, params?: any, body?: any, config?: any): Promise<any> {
        let response: any;

        await test.step(`Step: Call operation "${operationId}"`, async () => {
            response = await this.client[operationId](params, body, config);
            expect(response.status).toBeGreaterThanOrEqual(200);
            expect(response.status).toBeLessThan(300);
        });

        return response;
    }

    /**
     * Verifies the client base URL is configured and contains http.
     */
    async verifyBaseUrl(): Promise<string> {
        let baseUrl: string = '';

        await test.step('Step: Verify client base URL is set correctly', async () => {
            baseUrl = this.openApiClient.client.defaults.baseURL ?? '';
            expect(baseUrl).toBeDefined();
            expect(baseUrl).toContain('http');
        });

        return baseUrl;
    }

    /**
     * Verifies that specific operation methods exist on the client.
     */
    async verifyOperationMethodsExist(operationIds: string[]): Promise<void> {
        await test.step(`Step: Verify operation methods exist: ${operationIds.join(', ')}`, async () => {
            for (const opId of operationIds) {
                expect(typeof this.client[opId]).toBe('function');
            }
        });
    }

    /**
     * Retrieves all operations from the parsed OpenAPI document.
     */
    async getOperations(): Promise<any[]> {
        let operations: any[] = [];

        await test.step('Step: Retrieve operations from parsed OpenAPI document', async () => {
            operations = this.api.getOperations();
            expect(operations.length).toBeGreaterThan(0);
        });

        return operations;
    }

    /**
     * Gets all operation IDs from the spec.
     */
    async getOperationIds(): Promise<string[]> {
        let operationIds: string[] = [];

        await test.step('Step: Get all operation IDs from the spec', async () => {
            const operations = this.api.getOperations();
            operationIds = operations.map((op: any) => op.operationId).filter(Boolean);
            expect(operationIds.length).toBeGreaterThan(0);
        });

        return operationIds;
    }

    /**
     * Calls getInventory with api_key and returns the response.
     */
    async getInventory(): Promise<any> {
        let response: any;

        await test.step('Step: Call getInventory with api_key header', async () => {
            response = await this.client.getInventory(null, null, {
                headers: { api_key: 'special-key' },
            });
            expect(response.status).toBe(200);
            expect(response.data).toBeDefined();
        });

        return response;
    }
}
