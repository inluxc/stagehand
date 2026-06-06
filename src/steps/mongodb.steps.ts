/**
 * MongoDB Step Class
 *
 * Reusable step sequences for MongoDB client operations.
 * Wraps common CRUD and aggregation patterns for test reuse.
 */

import { test, expect } from '../index';

export interface MongoDbClient {
    find<T = any>(collection: string, filter: Record<string, any>, options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> }): Promise<T[]>;
    findOne<T = any>(collection: string, filter: Record<string, any>): Promise<T | null>;
    insertOne(collection: string, document: Record<string, any>): Promise<{ acknowledged: boolean; insertedId: any }>;
    insertMany(collection: string, documents: Record<string, any>[]): Promise<{ acknowledged: boolean; insertedCount: number; insertedIds: Record<number, unknown> }>;
    updateOne(collection: string, filter: Record<string, any>, update: Record<string, any>): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedId?: any }>;
    updateMany(collection: string, filter: Record<string, any>, update: Record<string, any>): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
    deleteOne(collection: string, filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }>;
    deleteMany(collection: string, filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }>;
    aggregate<T = any>(collection: string, pipeline: Record<string, any>[]): Promise<T[]>;
}

export class MongoDbSteps {
    constructor(private mongoDbClient: MongoDbClient) {}

    /**
     * Finds documents matching a filter.
     */
    async find<T = any>(
        description: string,
        collection: string,
        filter: Record<string, any>,
        options?: { limit?: number; skip?: number; sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> },
    ): Promise<T[]> {
        let documents: T[] = [];

        await test.step(`Step: ${description}`, async () => {
            documents = await this.mongoDbClient.find<T>(collection, filter, options);
            expect(documents).toBeDefined();
            expect(Array.isArray(documents)).toBe(true);
        });

        return documents;
    }

    /**
     * Finds a single document matching a filter.
     */
    async findOne<T = any>(description: string, collection: string, filter: Record<string, any>): Promise<T | null> {
        let document: T | null = null;

        await test.step(`Step: ${description}`, async () => {
            document = await this.mongoDbClient.findOne<T>(collection, filter);
        });

        return document;
    }

    /**
     * Inserts a single document and returns the result.
     */
    async insertOne(description: string, collection: string, document: Record<string, any>): Promise<{ acknowledged: boolean; insertedId: any }> {
        let result: { acknowledged: boolean; insertedId: any };

        await test.step(`Step: ${description}`, async () => {
            result = await this.mongoDbClient.insertOne(collection, document);
            expect(result.acknowledged).toBe(true);
            expect(result.insertedId).toBeDefined();
        });

        return result!;
    }

    /**
     * Inserts multiple documents and returns the result.
     */
    async insertMany(description: string, collection: string, documents: Record<string, any>[]): Promise<{ acknowledged: boolean; insertedCount: number; insertedIds: Record<number, unknown> }> {
        let result: { acknowledged: boolean; insertedCount: number; insertedIds: Record<number, unknown> };

        await test.step(`Step: ${description}`, async () => {
            result = await this.mongoDbClient.insertMany(collection, documents);
            expect(result.acknowledged).toBe(true);
            expect(result.insertedCount).toBe(documents.length);
        });

        return result!;
    }

    /**
     * Updates a single document matching a filter.
     */
    async updateOne(description: string, collection: string, filter: Record<string, any>, update: Record<string, any>): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }> {
        let result: { acknowledged: boolean; matchedCount: number; modifiedCount: number; upsertedId?: any };

        await test.step(`Step: ${description}`, async () => {
            result = await this.mongoDbClient.updateOne(collection, filter, update);
            expect(result.acknowledged).toBe(true);
        });

        return result!;
    }

    /**
     * Deletes a single document matching a filter.
     */
    async deleteOne(description: string, collection: string, filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }> {
        let result: { acknowledged: boolean; deletedCount: number };

        await test.step(`Step: ${description}`, async () => {
            result = await this.mongoDbClient.deleteOne(collection, filter);
            expect(result.acknowledged).toBe(true);
        });

        return result!;
    }

    /**
     * Deletes multiple documents matching a filter.
     */
    async deleteMany(description: string, collection: string, filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }> {
        let result: { acknowledged: boolean; deletedCount: number };

        await test.step(`Step: ${description}`, async () => {
            result = await this.mongoDbClient.deleteMany(collection, filter);
            expect(result.acknowledged).toBe(true);
        });

        return result!;
    }

    /**
     * Runs an aggregation pipeline and returns results.
     */
    async aggregate<T = any>(description: string, collection: string, pipeline: Record<string, any>[]): Promise<T[]> {
        let results: T[] = [];

        await test.step(`Step: ${description}`, async () => {
            results = await this.mongoDbClient.aggregate<T>(collection, pipeline);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        return results;
    }

    /**
     * Verifies documents have expected properties.
     */
    async verifyDocumentProperties(description: string, documents: any[], properties: string[]): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            if (documents.length > 0) {
                for (const prop of properties) {
                    expect(documents[0]).toHaveProperty(prop);
                }
            }
        });
    }
}
