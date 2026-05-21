/**
 * MongoDB Connection Fixture for the Playwright Framework Template.
 *
 * Provides a MongoDbClient with find(), findOne(), insertOne(), insertMany(),
 * updateOne(), updateMany(), deleteOne(), deleteMany(), and aggregate() methods.
 *
 * Uses the official MongoDB Node.js driver (mongodb).
 *
 * Lifecycle:
 *   Setup: Read config → Create MongoClient → Verify connectivity (ping)
 *   Teardown: Close MongoClient connection
 *
 * Errors:
 *   - FixtureInitError on connection failure (includes host, port, timeout)
 *   - FixtureOperationError on operation failure (includes collection, operation)
 *
 * @requirements 8.1, 8.2, 8.3
 */

import { FixtureInitError, FixtureOperationError } from '../errors';
import { MongoDbFixtureConfig } from '../config/schema';

/**
 * Options for find operations.
 */
export interface FindOptions {
    /** Maximum number of documents to return. */
    limit?: number;
    /** Number of documents to skip. */
    skip?: number;
    /** Sort specification (e.g., { createdAt: -1 }). */
    sort?: Record<string, 1 | -1>;
    /** Projection — fields to include or exclude. */
    projection?: Record<string, 0 | 1>;
}

/**
 * Options for aggregate operations.
 */
export interface AggregateOptions {
    /** Maximum time in ms for the aggregation to execute. */
    maxTimeMS?: number;
}

/**
 * Result of an insert operation.
 */
export interface InsertOneResult {
    /** The _id of the inserted document. */
    insertedId: unknown;
    /** Whether the operation was acknowledged by the server. */
    acknowledged: boolean;
}

/**
 * Result of an insertMany operation.
 */
export interface InsertManyResult {
    /** Map of index to inserted _id. */
    insertedIds: Record<number, unknown>;
    /** Number of documents inserted. */
    insertedCount: number;
    /** Whether the operation was acknowledged by the server. */
    acknowledged: boolean;
}

/**
 * Result of an update operation.
 */
export interface UpdateResult {
    /** Number of documents matched by the filter. */
    matchedCount: number;
    /** Number of documents modified. */
    modifiedCount: number;
    /** The _id of the upserted document, if any. */
    upsertedId: unknown | null;
    /** Whether the operation was acknowledged by the server. */
    acknowledged: boolean;
}

/**
 * Result of a delete operation.
 */
export interface DeleteResult {
    /** Number of documents deleted. */
    deletedCount: number;
    /** Whether the operation was acknowledged by the server. */
    acknowledged: boolean;
}

/**
 * MongoDB client interface exposed to tests.
 */
export interface MongoDbClient {
    find<T = Record<string, unknown>>(collection: string, filter?: Record<string, unknown>, options?: FindOptions): Promise<T[]>;
    findOne<T = Record<string, unknown>>(collection: string, filter?: Record<string, unknown>): Promise<T | null>;
    insertOne(collection: string, document: Record<string, unknown>): Promise<InsertOneResult>;
    insertMany(collection: string, documents: Record<string, unknown>[]): Promise<InsertManyResult>;
    updateOne(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<UpdateResult>;
    updateMany(collection: string, filter: Record<string, unknown>, update: Record<string, unknown>): Promise<UpdateResult>;
    deleteOne(collection: string, filter: Record<string, unknown>): Promise<DeleteResult>;
    deleteMany(collection: string, filter: Record<string, unknown>): Promise<DeleteResult>;
    aggregate<T = Record<string, unknown>>(collection: string, pipeline: Record<string, unknown>[], options?: AggregateOptions): Promise<T[]>;
    close(): Promise<void>;
}

const DEFAULT_CONNECTION_TIMEOUT = 10000;

/**
 * Builds a MongoDB connection URI from the config.
 */
function buildConnectionUri(config: MongoDbFixtureConfig): string {
    // If a full URI is provided, use it directly
    if (config.uri) {
        return config.uri;
    }

    const protocol = config.srv ? 'mongodb+srv' : 'mongodb';
    const host = config.host ?? 'localhost';
    const port = config.srv ? '' : `:${config.port ?? 27017}`;
    const auth = config.username && config.password
        ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
        : '';
    const authSource = config.authSource ? `?authSource=${config.authSource}` : '';

    return `${protocol}://${auth}${host}${port}/${config.database}${authSource}`;
}

/**
 * Creates a MongoDB client and verifies connectivity.
 */
async function createMongoDbClient(config: MongoDbFixtureConfig): Promise<MongoDbClient> {
    const { MongoClient } = await import('mongodb');

    const connectionTimeout = config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT;
    const uri = buildConnectionUri(config);

    let client: InstanceType<typeof MongoClient>;

    try {
        client = new MongoClient(uri, {
            connectTimeoutMS: connectionTimeout,
            serverSelectionTimeoutMS: connectionTimeout,
        });

        await client.connect();

        // Verify connectivity with a ping
        await client.db(config.database).command({ ping: 1 });
    } catch (error) {
        throw new FixtureInitError('mongodb', 'connect', {
            host: config.host ?? 'localhost',
            port: config.port ?? 27017,
            database: config.database,
            timeout: connectionTimeout,
            reason: error instanceof Error ? error.message : String(error),
        }, error instanceof Error ? error : undefined);
    }

    const db = client.db(config.database);

    return {
        async find<T = Record<string, unknown>>(
            collection: string,
            filter: Record<string, unknown> = {},
            options: FindOptions = {},
        ): Promise<T[]> {
            try {
                let cursor = db.collection(collection).find(filter);

                if (options.projection) {
                    cursor = cursor.project(options.projection);
                }
                if (options.sort) {
                    cursor = cursor.sort(options.sort);
                }
                if (options.skip !== undefined) {
                    cursor = cursor.skip(options.skip);
                }
                if (options.limit !== undefined) {
                    cursor = cursor.limit(options.limit);
                }

                return (await cursor.toArray()) as T[];
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'find', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async findOne<T = Record<string, unknown>>(
            collection: string,
            filter: Record<string, unknown> = {},
        ): Promise<T | null> {
            try {
                const doc = await db.collection(collection).findOne(filter);
                return doc as T | null;
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'findOne', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async insertOne(collection: string, document: Record<string, unknown>): Promise<InsertOneResult> {
            try {
                const result = await db.collection(collection).insertOne(document);
                return {
                    insertedId: result.insertedId,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'insertOne', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async insertMany(collection: string, documents: Record<string, unknown>[]): Promise<InsertManyResult> {
            try {
                const result = await db.collection(collection).insertMany(documents);
                return {
                    insertedIds: result.insertedIds as unknown as Record<number, unknown>,
                    insertedCount: result.insertedCount,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'insertMany', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async updateOne(
            collection: string,
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
        ): Promise<UpdateResult> {
            try {
                const result = await db.collection(collection).updateOne(filter, update);
                return {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upsertedId: result.upsertedId ?? null,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'updateOne', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async updateMany(
            collection: string,
            filter: Record<string, unknown>,
            update: Record<string, unknown>,
        ): Promise<UpdateResult> {
            try {
                const result = await db.collection(collection).updateMany(filter, update);
                return {
                    matchedCount: result.matchedCount,
                    modifiedCount: result.modifiedCount,
                    upsertedId: result.upsertedId ?? null,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'updateMany', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async deleteOne(collection: string, filter: Record<string, unknown>): Promise<DeleteResult> {
            try {
                const result = await db.collection(collection).deleteOne(filter);
                return {
                    deletedCount: result.deletedCount,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'deleteOne', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async deleteMany(collection: string, filter: Record<string, unknown>): Promise<DeleteResult> {
            try {
                const result = await db.collection(collection).deleteMany(filter);
                return {
                    deletedCount: result.deletedCount,
                    acknowledged: result.acknowledged,
                };
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'deleteMany', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async aggregate<T = Record<string, unknown>>(
            collection: string,
            pipeline: Record<string, unknown>[],
            options: AggregateOptions = {},
        ): Promise<T[]> {
            try {
                const cursor = db.collection(collection).aggregate(pipeline, {
                    maxTimeMS: options.maxTimeMS,
                });
                return (await cursor.toArray()) as T[];
            } catch (error) {
                throw new FixtureOperationError('mongodb', 'aggregate', {
                    collection,
                    reason: error instanceof Error ? error.message : String(error),
                }, error instanceof Error ? error : undefined);
            }
        },

        async close(): Promise<void> {
            await client.close();
        },
    };
}

/**
 * Playwright fixture definition for the MongoDB client.
 *
 * Usage in tests:
 *   test('find users', async ({ mongoDbClient }) => {
 *     const users = await mongoDbClient.find<User>('users', { active: true });
 *     expect(users).toHaveLength(3);
 *   });
 */
export const mongoDbFixture = {
    mongoDbClient: async (
        { mongodb }: { mongodb: MongoDbFixtureConfig | undefined },
        use: (client: MongoDbClient) => Promise<void>,
    ) => {
        // Use config from project `use` block if provided, otherwise fall back to ConfigLoader
        let config: MongoDbFixtureConfig | undefined = mongodb;

        if (!config) {
            const { ConfigLoader } = await import('../config/loader');
            const loader = new ConfigLoader();
            const frameworkConfig = loader.load();
            config = frameworkConfig.mongodb;
        }

        if (!config) {
            throw new FixtureInitError('mongodb', 'connect', {
                reason: 'MongoDB configuration is missing. Provide mongodb config in environments.json, environment variables, or project use block.',
            });
        }

        // Setup: create client and verify connectivity
        const client = await createMongoDbClient(config);

        // Provide client to the test
        await use(client);

        // Teardown: close connection
        await client.close();
    },
};
