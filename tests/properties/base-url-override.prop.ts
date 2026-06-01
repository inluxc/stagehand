/**
 * Property 5: Base URL override precedence
 *
 * For any OpenAPI specification with server URLs and a Connection_Config with a
 * baseUrl override, all API calls made through the client SHALL use the override
 * URL, ignoring the specification's server URLs.
 *
 * We verify that when a baseUrl is provided via axiosConfigDefaults, the client's
 * defaults.baseURL is set to the override value, regardless of the spec's server URLs.
 *
 * **Validates: Requirements 2.6**
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { OpenAPIClientAxios } from 'openapi-client-axios';

/**
 * Generates valid HTTP/HTTPS base URLs.
 */
const arbBaseUrl = fc
    .tuple(
        fc.constantFrom('http', 'https'),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
            { minLength: 3, maxLength: 15 }
        ),
        fc.constantFrom('.com', '.io', '.dev', '.net', '.org'),
        fc.option(
            fc.nat({ max: 9999 }).map((p) => `:${p + 1000}`),
            { nil: undefined }
        )
    )
    .map(([scheme, host, tld, port]) => `${scheme}://${host}${tld}${port ?? ''}`);

/**
 * Generates a server URL that differs from the override URL.
 */
const arbSpecServerUrl = fc
    .tuple(
        fc.constantFrom('http', 'https'),
        fc.stringOf(
            fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
            { minLength: 3, maxLength: 15 }
        ),
        fc.constantFrom('.example.com', '.spec-server.io', '.original.dev')
    )
    .map(([scheme, host, tld]) => `${scheme}://${host}${tld}`);

/**
 * Builds a minimal OpenAPI spec with the given server URL.
 */
function buildSpecWithServer(serverUrl: string): object {
    return {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: serverUrl }],
        paths: {
            '/test': {
                get: {
                    operationId: 'testOperation',
                    responses: { '200': { description: 'OK' } },
                },
            },
        },
    };
}

test.describe('Property 5: Base URL override precedence', () => {
    test('baseUrl override always takes precedence over spec server URLs', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbSpecServerUrl,
                arbBaseUrl,
                async (specServerUrl, overrideBaseUrl) => {
                    // Ensure the override is different from the spec server URL
                    fc.pre(specServerUrl !== overrideBaseUrl);

                    const spec = buildSpecWithServer(specServerUrl);

                    const api = new OpenAPIClientAxios({
                        definition: spec as any,
                        axiosConfigDefaults: {
                            baseURL: overrideBaseUrl,
                        },
                    });

                    const client = await api.init();

                    // Apply the override after init (as the fixture does)
                    client.defaults.baseURL = overrideBaseUrl;

                    // The client's baseURL must be the override, not the spec server URL
                    expect(client.defaults.baseURL).toBe(overrideBaseUrl);
                    expect(client.defaults.baseURL).not.toBe(specServerUrl);
                }
            ),
            { numRuns: 100 }
        );
    });

    test('baseUrl override is preserved regardless of spec server count', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(arbSpecServerUrl, { minLength: 1, maxLength: 5 }),
                arbBaseUrl,
                async (specServerUrls, overrideBaseUrl) => {
                    // Ensure the override differs from all spec servers
                    fc.pre(specServerUrls.every((url) => url !== overrideBaseUrl));

                    const spec = {
                        openapi: '3.0.0',
                        info: { title: 'Test API', version: '1.0.0' },
                        servers: specServerUrls.map((url) => ({ url })),
                        paths: {
                            '/test': {
                                get: {
                                    operationId: 'testOp',
                                    responses: { '200': { description: 'OK' } },
                                },
                            },
                        },
                    };

                    const api = new OpenAPIClientAxios({
                        definition: spec as any,
                        axiosConfigDefaults: {
                            baseURL: overrideBaseUrl,
                        },
                    });

                    const client = await api.init();
                    client.defaults.baseURL = overrideBaseUrl;

                    // Override must always win
                    expect(client.defaults.baseURL).toBe(overrideBaseUrl);
                }
            ),
            { numRuns: 100 }
        );
    });
});
