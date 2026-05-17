/**
 * Property 7: OpenAPI annotation contains required metadata
 *
 * For any HTTP method, request path, request body string, response status code,
 * and response body string, the OpenAPI annotation formatter SHALL produce an
 * annotation containing all five fields with request and response bodies truncated
 * to 4096 characters if necessary.
 *
 * **Validates: Requirements 12.5**
 *
 * Feature: cicd-emulated-testing, Property 7: OpenAPI annotation contains required metadata
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { recordOpenApi } from '../../src/annotations/recorder';

const TRUNCATION_INDICATOR = '[truncated]';
const HTTP_BODY_LIMIT = 4096;

/** Creates a mock testInfo object for testing */
function createMockTestInfo() {
    return { annotations: [] as Array<{ type: string; description?: string }> };
}

/** Arbitrary HTTP methods */
const arbMethod = fc.constantFrom('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS');

/** Arbitrary request paths */
const arbPath = fc.stringOf(
    fc.constantFrom(...'/abcdefghijklmnopqrstuvwxyz0123456789-_.~'.split('')),
    { minLength: 1, maxLength: 200 }
).map(s => '/' + s);

/** Arbitrary body strings (can be empty or large) */
const arbBody = fc.string({ minLength: 0, maxLength: 8192 });

/** Arbitrary HTTP status codes */
const arbStatus = fc.integer({ min: 100, max: 599 });

test.describe('Property 7: OpenAPI annotation contains required metadata', {
    tag: '@Feature: cicd-emulated-testing, Property 7: OpenAPI annotation contains required metadata',
}, () => {
    test('annotation has type fixture-operation', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                expect(testInfo.annotations).toHaveLength(1);
                expect(testInfo.annotations[0].type).toBe('fixture-operation');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains fixture: openapi', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.fixture).toBe('openapi');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the method field', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.method).toBeDefined();
                expect(typeof parsed.method).toBe('string');
                expect(parsed.method.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the path field', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.path).toBeDefined();
                expect(typeof parsed.path).toBe('string');
                expect(parsed.path.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains requestBody field truncated to 4096 chars if longer', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.requestBody).toBeDefined();
                expect(typeof parsed.requestBody).toBe('string');

                if (reqBody.length > HTTP_BODY_LIMIT) {
                    expect(parsed.requestBody.length).toBeLessThanOrEqual(HTTP_BODY_LIMIT + TRUNCATION_INDICATOR.length);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the exact responseStatus number', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.responseStatus).toBe(status);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains responseBody field truncated to 4096 chars if longer', async () => {
        await fc.assert(
            fc.property(arbMethod, arbPath, arbBody, arbStatus, arbBody, (method, path, reqBody, status, resBody) => {
                const testInfo = createMockTestInfo();
                recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                const parsed = JSON.parse(testInfo.annotations[0].description!);
                expect(parsed.responseBody).toBeDefined();
                expect(typeof parsed.responseBody).toBe('string');

                if (resBody.length > HTTP_BODY_LIMIT) {
                    expect(parsed.responseBody.length).toBeLessThanOrEqual(HTTP_BODY_LIMIT + TRUNCATION_INDICATOR.length);
                }
            }),
            { numRuns: 100 }
        );
    });

    test('when request/response body length > 4096, the field ends with [truncated]', async () => {
        await fc.assert(
            fc.property(
                arbMethod,
                arbPath,
                fc.string({ minLength: HTTP_BODY_LIMIT + 1, maxLength: 8192 }),
                arbStatus,
                fc.string({ minLength: HTTP_BODY_LIMIT + 1, maxLength: 8192 }),
                (method, path, reqBody, status, resBody) => {
                    const testInfo = createMockTestInfo();
                    recordOpenApi(testInfo, method, path, reqBody, status, resBody);

                    const parsed = JSON.parse(testInfo.annotations[0].description!);
                    expect(parsed.requestBody.endsWith(TRUNCATION_INDICATOR)).toBe(true);
                    expect(parsed.responseBody.endsWith(TRUNCATION_INDICATOR)).toBe(true);
                }
            ),
            { numRuns: 100 }
        );
    });
});
