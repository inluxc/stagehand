/**
 * GraphQL Fixture — Example Tests
 *
 * Demonstrates usage of the graphqlClient fixture for querying
 * and mutating data via a GraphQL API endpoint.
 *
 * Prerequisites:
 *   - PW_GRAPHQL_ENDPOINT set to a valid GraphQL endpoint URL
 *   - Optionally PW_GRAPHQL_AUTH_TOKEN for authenticated APIs
 */

import { test, expect } from '../../src';

test.describe('GraphQL Client', () => {
    test.skip(
        !process.env['PW_GRAPHQL_ENDPOINT'],
        'Skipped: PW_GRAPHQL_ENDPOINT not configured',
    );

    test('[TC-GQL-001] execute a query and return data', { tag: ['@TC-GQL-001'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Execute introspection query for queryType name', async () => {
            const query = `
                query {
                    __schema {
                        queryType {
                            name
                        }
                    }
                }
            `;

            const data = await graphqlClient.query<{
                __schema: { queryType: { name: string } };
            }>(query);

            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-002] execute a query with variables', { tag: ['@TC-GQL-002'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Query __type with variable name=String', async () => {
            const query = `
                query GetType($name: String!) {
                    __type(name: $name) {
                        name
                        kind
                    }
                }
            `;

            const data = await graphqlClient.query<{
                __type: { name: string; kind: string } | null;
            }>(query, { name: 'String' });

            expect(data.__type).not.toBeNull();
            expect(data.__type!.name).toBe('String');
            expect(data.__type!.kind).toBe('SCALAR');
        });
    });

    test('[TC-GQL-003] handle raw request with full response', { tag: ['@TC-GQL-003'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Execute rawRequest and verify response structure', async () => {
            const query = `
                query {
                    __schema {
                        queryType {
                            name
                        }
                    }
                }
            `;

            const response = await graphqlClient.rawRequest<{
                __schema: { queryType: { name: string } };
            }>(query);

            expect(response.data.__schema.queryType.name).toBe('Query');
            expect(response.errors).toBeUndefined();
        });
    });

    test('[TC-GQL-004] support setting auth token dynamically', { tag: ['@TC-GQL-004'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Set auth token dynamically', async () => {
            graphqlClient.setAuthToken('test-token-123');
        });

        await test.step('Step 2: Execute query with token set and verify it succeeds', async () => {
            const data = await graphqlClient.query<{
                __schema: { queryType: { name: string } };
            }>(`{ __schema { queryType { name } } }`);

            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-005] support custom headers per request', { tag: ['@TC-GQL-005'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Execute query with custom X-Custom-Header', async () => {
            const data = await graphqlClient.query<{
                __schema: { queryType: { name: string } };
            }>(
                `{ __schema { queryType { name } } }`,
                undefined,
                { headers: { 'X-Custom-Header': 'test-value' } },
            );

            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-006] return errors for invalid queries via rawRequest', { tag: ['@TC-GQL-006'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Execute rawRequest with non-existent field', async () => {
            const response = await graphqlClient.rawRequest(`{ nonExistentField }`);

            expect(response.errors).toBeDefined();
            expect(response.errors!.length).toBeGreaterThan(0);
            expect(response.errors![0].message).toBeDefined();
        });
    });
});
