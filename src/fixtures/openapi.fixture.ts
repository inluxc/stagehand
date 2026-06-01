/**
 * OpenAPI Client Fixture for Playwright.
 *
 * Provides an initialized openapi-client-axios instance as a Playwright fixture.
 * Loads an OpenAPI spec from a local file or remote URL, initializes the client
 * with operation methods, and supports base URL override from config.
 *
 * Usage:
 *   import { test } from '../fixtures';
 *   test('my api test', async ({ openApiClient }) => {
 *     const response = await openApiClient.client.someOperation();
 *   });
 */

import { OpenAPIClientAxios } from 'openapi-client-axios';
import type { AxiosInstance } from 'openapi-client-axios';
import type { OpenApiFixtureConfig } from '../config/schema';
import { FixtureInitError } from '../errors';
import { ConfigLoader } from '../config/loader';

/**
 * The OpenAPI client object provided to tests.
 */
export interface OpenApiClient {
    /** Axios instance extended with operation methods from the spec. */
    client: AxiosInstance;
    /** The underlying OpenAPIClientAxios instance. */
    api: OpenAPIClientAxios;
}

/** Default timeout for remote spec retrieval (ms). */
const DEFAULT_SPEC_TIMEOUT = 10_000;

/** Default timeout for client initialization (ms). */
const DEFAULT_INIT_TIMEOUT = 30_000;

/**
 * Creates a promise that rejects after the specified timeout.
 */
function createTimeout(ms: number, label: string): { promise: Promise<never>; clear: () => void } {
    let timer: ReturnType<typeof setTimeout>;
    const promise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
    });
    const clear = () => clearTimeout(timer!);
    return { promise, clear };
}

/**
 * OpenAPI fixture definition for use with Playwright's test.extend().
 *
 * Spread this into your fixture registry:
 *   export const test = base.extend({ ...openApiFixture });
 */
export const openApiFixture = {
    openApiClient: [
        async (
            { openapi }: { openapi: OpenApiFixtureConfig | undefined },
            use: (client: OpenApiClient) => Promise<void>,
        ) => {
            // Use config from project `use` block if provided, otherwise fall back to ConfigLoader
            let openapiConfig: OpenApiFixtureConfig | undefined = openapi;

            if (!openapiConfig) {
                const configLoader = new ConfigLoader();
                const config = configLoader.load();
                openapiConfig = config.openapi;
            }

            if (!openapiConfig || !openapiConfig.specPath) {
                throw new FixtureInitError('openApiClient', 'init', {
                    reason: 'OpenAPI configuration is missing or specPath is not defined',
                });
            }

            const specPath = openapiConfig.specPath;
            const baseUrl = openapiConfig.baseUrl;
            const specTimeout = openapiConfig.specTimeout ?? DEFAULT_SPEC_TIMEOUT;
            const initTimeout = openapiConfig.initTimeout ?? DEFAULT_INIT_TIMEOUT;

            let api: OpenAPIClientAxios;
            let client: AxiosInstance;

            try {
                // Build OpenAPIClientAxios options
                const opts: ConstructorParameters<typeof OpenAPIClientAxios>[0] = {
                    definition: specPath,
                    axiosConfigDefaults: {
                        timeout: specTimeout,
                    },
                };

                // If a base URL override is provided, set it via axiosConfigDefaults
                if (baseUrl) {
                    opts.axiosConfigDefaults = {
                        ...opts.axiosConfigDefaults,
                        baseURL: baseUrl,
                    };
                }

                api = new OpenAPIClientAxios(opts);

                // Initialize with timeout
                const timeout = createTimeout(initTimeout, 'OpenAPI client initialization');

                try {
                    client = await Promise.race([api.init(), timeout.promise]);
                } finally {
                    timeout.clear();
                }

                // Apply base URL override after init (ensures it takes precedence over spec servers)
                if (baseUrl) {
                    client.defaults.baseURL = baseUrl;
                }
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                throw new FixtureInitError(
                    'openApiClient',
                    'init',
                    {
                        specPath,
                        reason,
                        timeout: initTimeout,
                    },
                    error instanceof Error ? error : undefined
                );
            }

            // Provide the client to the test
            await use({ client, api });

            // Teardown: clear internal references
            (api as any).instance = null;
            (api as any).document = null;
            (api as any).definition = null;
        },
        { scope: 'test' },
    ],
};
