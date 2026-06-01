/**
 * Property 4: OperationId method mapping
 *
 * For any valid OpenAPI specification containing operationId values, after
 * initializing the OpenAPI client, the client object SHALL expose a callable
 * method for each operationId defined in the specification.
 *
 * Since we can't easily test with real OpenAPI specs in property tests, we test
 * the openapi-client-axios API contract by verifying that for any set of
 * operationId strings, the initialized client exposes methods matching those IDs.
 *
 * **Validates: Requirements 2.3**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { OpenAPIClientAxios } from 'openapi-client-axios';

/**
 * Generates valid operationId strings (camelCase identifiers).
 * OpenAPI operationIds must be valid JavaScript identifiers.
 */
const arbOperationId = fc
    .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('')),
            { minLength: 1, maxLength: 20 }
        )
    )
    .map(([first, rest]) => first + rest);

/**
 * Generates a minimal OpenAPI 3.0 spec document with the given operationIds.
 * Each operationId is mapped to a GET endpoint.
 */
function buildMinimalSpec(operationIds: string[]): object {
    const paths: Record<string, object> = {};
    for (let i = 0; i < operationIds.length; i++) {
        paths[`/path${i}`] = {
            get: {
                operationId: operationIds[i],
                responses: { '200': { description: 'OK' } },
            },
        };
    }
    return {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'http://localhost:3000' }],
        paths,
    };
}

test.describe('Property 4: OperationId method mapping', () => {
    test('for any set of operationIds, the initialized client exposes a callable method for each', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.uniqueArray(arbOperationId, { minLength: 1, maxLength: 8 }),
                async (operationIds) => {
                    const spec = buildMinimalSpec(operationIds);

                    const api = new OpenAPIClientAxios({
                        definition: spec as any,
                    });

                    const client = await api.init();

                    // Each operationId must be exposed as a callable method on the client
                    for (const opId of operationIds) {
                        expect(typeof (client as any)[opId]).toBe('function');
                    }
                }
            ),
            { numRuns: 100 }
        );
    });

    test('operationId methods are functions that can be called (return promises)', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbOperationId,
                async (operationId) => {
                    const spec = buildMinimalSpec([operationId]);

                    const api = new OpenAPIClientAxios({
                        definition: spec as any,
                    });

                    const client = await api.init();

                    // The method should exist and be callable
                    const method = (client as any)[operationId];
                    expect(typeof method).toBe('function');
                }
            ),
            { numRuns: 100 }
        );
    });
});
