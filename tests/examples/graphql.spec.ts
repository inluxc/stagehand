/**
 * GraphQL Fixture — Example Tests
 *
 * Demonstrates usage of the graphqlClient fixture for querying
 * and mutating data via a GraphQL API endpoint.
 * Uses the GraphQLSteps class for reusable step sequences.
 *
 * Prerequisites:
 *   - PW_GRAPHQL_ENDPOINT set to a valid GraphQL endpoint URL
 *   - Optionally PW_GRAPHQL_AUTH_TOKEN for authenticated APIs
 */

import { test, expect } from '../../src';
import { GraphQLSteps } from '../../src/steps';

test.describe('GraphQL Client', () => {
    test.skip(
        !process.env['PW_GRAPHQL_ENDPOINT'],
        'Skipped: PW_GRAPHQL_ENDPOINT not configured',
    );

    test('[TC-GQL-001] execute a query and return data', { tag: ['@TC-GQL-001'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        const data = await gql.query<{ __schema: { queryType: { name: string } } }>(
            'Execute introspection query for queryType name',
            `query { __schema { queryType { name } } }`,
        );

        await test.step('Step 1: Verify queryType name is "Query"', async () => {
            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-002] execute a query with variables', { tag: ['@TC-GQL-002'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        const data = await gql.query<{ __type: { name: string; kind: string } | null }>(
            'Query __type with variable name=String',
            `query GetType($name: String!) { __type(name: $name) { name kind } }`,
            { name: 'String' },
        );

        await test.step('Step 1: Verify __type returns String scalar', async () => {
            expect(data.__type).not.toBeNull();
            expect(data.__type!.name).toBe('String');
            expect(data.__type!.kind).toBe('SCALAR');
        });
    });

    test('[TC-GQL-003] handle raw request with full response', { tag: ['@TC-GQL-003'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        const response = await gql.rawRequest<{ __schema: { queryType: { name: string } } }>(
            'Execute rawRequest and verify response structure',
            `query { __schema { queryType { name } } }`,
        );

        await test.step('Step 1: Verify response has data and no errors', async () => {
            expect(response.data.__schema.queryType.name).toBe('Query');
            expect(response.errors).toBeUndefined();
        });
    });

    test('[TC-GQL-004] support setting auth token dynamically', { tag: ['@TC-GQL-004'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        await gql.setAuthToken('test-token-123');

        const data = await gql.query<{ __schema: { queryType: { name: string } } }>(
            'Execute query with token set and verify it succeeds',
            `{ __schema { queryType { name } } }`,
        );

        await test.step('Step 1: Verify query succeeds with auth token', async () => {
            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-005] support custom headers per request', { tag: ['@TC-GQL-005'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        const data = await gql.query<{ __schema: { queryType: { name: string } } }>(
            'Execute query with custom X-Custom-Header',
            `{ __schema { queryType { name } } }`,
            undefined,
            { headers: { 'X-Custom-Header': 'test-value' } },
        );

        await test.step('Step 1: Verify query succeeds with custom header', async () => {
            expect(data.__schema.queryType.name).toBe('Query');
        });
    });

    test('[TC-GQL-006] return errors for invalid queries via rawRequest', { tag: ['@TC-GQL-006'] }, async ({ graphqlClient }) => {
        const gql = new GraphQLSteps(graphqlClient);

        const errors = await gql.rawRequestExpectErrors(
            'Execute rawRequest with non-existent field',
            `{ nonExistentField }`,
        );

        await test.step('Step 1: Verify error messages are descriptive', async () => {
            expect(errors[0].message).toBeDefined();
        });
    });
});
