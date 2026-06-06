/**
 * GraphQL Step Class
 *
 * Reusable step sequences for GraphQL client operations.
 * Wraps common query, mutation, and rawRequest patterns.
 */

import { test, expect } from '../index';

export interface GraphQLClient {
    query<T = any>(query: string, variables?: Record<string, any>, options?: { headers?: Record<string, string> }): Promise<T>;
    mutate<T = any>(mutation: string, variables?: Record<string, any>, options?: { headers?: Record<string, string> }): Promise<T>;
    rawRequest<T = any>(query: string, variables?: Record<string, any>): Promise<{ data: T; errors?: Array<{ message: string }> }>;
    setAuthToken(token: string): void;
    setHeader(key: string, value: string): void;
}

export class GraphQLSteps {
    constructor(private graphqlClient: GraphQLClient) {}

    /**
     * Executes a GraphQL query and returns typed data.
     */
    async query<T = any>(description: string, query: string, variables?: Record<string, any>, options?: { headers?: Record<string, string> }): Promise<T> {
        let data: T;

        await test.step(`Step: ${description}`, async () => {
            data = await this.graphqlClient.query<T>(query, variables, options);
            expect(data).toBeDefined();
        });

        return data!;
    }

    /**
     * Executes a GraphQL mutation and returns typed data.
     */
    async mutate<T = any>(description: string, mutation: string, variables?: Record<string, any>): Promise<T> {
        let data: T;

        await test.step(`Step: ${description}`, async () => {
            data = await this.graphqlClient.mutate<T>(mutation, variables);
            expect(data).toBeDefined();
        });

        return data!;
    }

    /**
     * Executes a raw request and returns the full response with data and errors.
     */
    async rawRequest<T = any>(description: string, query: string, variables?: Record<string, any>): Promise<{ data: T; errors?: Array<{ message: string }> }> {
        let response: { data: T; errors?: Array<{ message: string }> };

        await test.step(`Step: ${description}`, async () => {
            response = await this.graphqlClient.rawRequest<T>(query, variables);
            expect(response).toBeDefined();
        });

        return response!;
    }

    /**
     * Executes a raw request and asserts errors are present.
     */
    async rawRequestExpectErrors(description: string, query: string): Promise<Array<{ message: string }>> {
        let errors: Array<{ message: string }> = [];

        await test.step(`Step: ${description}`, async () => {
            const response = await this.graphqlClient.rawRequest(query);
            expect(response.errors).toBeDefined();
            expect(response.errors!.length).toBeGreaterThan(0);
            errors = response.errors!;
        });

        return errors;
    }

    /**
     * Sets an auth token on the client.
     */
    async setAuthToken(token: string): Promise<void> {
        await test.step(`Step: Set auth token dynamically`, async () => {
            this.graphqlClient.setAuthToken(token);
        });
    }

    /**
     * Sets a custom header on the client.
     */
    async setHeader(key: string, value: string): Promise<void> {
        await test.step(`Step: Set custom header "${key}"`, async () => {
            this.graphqlClient.setHeader(key, value);
        });
    }
}
