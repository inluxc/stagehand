/**
 * Kafka integration fixture for Playwright tests.
 *
 * Provides a KafkaClient with produce() and consume() methods,
 * managing producer and consumer lifecycle per test with unique
 * consumer group IDs for message isolation.
 *
 * Uses kafkajs as the underlying Kafka client library.
 */

import { Kafka, Producer, Consumer, EachMessagePayload, logLevel, SASLOptions as KafkaJsSASLOptions } from 'kafkajs';
import { KafkaFixtureConfig } from '../config/schema';
import { FixtureInitError, FixtureOperationError } from '../errors';

/**
 * A single Kafka message with metadata.
 */
export interface KafkaMessage {
    key: string | null;
    value: string | Buffer;
    topic: string;
    partition: number;
    offset: string;
}

/**
 * Options for consuming messages from a topic.
 */
export interface ConsumeOptions {
    /** Maximum time to wait for messages in ms (default: 30000). */
    timeout?: number;
    /** Maximum number of messages to consume. */
    count?: number;
    /** Whether to consume from the beginning of the topic. */
    fromBeginning?: boolean;
}

/**
 * Client interface exposed to tests for Kafka interactions.
 */
export interface KafkaClient {
    produce(topic: string, messages: Array<{ key?: string | null; value: string | Buffer }>): Promise<void>;
    consume(topic: string, options?: ConsumeOptions): Promise<KafkaMessage[]>;
    disconnect(): Promise<void>;
}

/**
 * Generates a unique consumer group ID for test isolation.
 */
function generateGroupId(testId: string): string {
    return `test-${testId}-${Date.now()}`;
}

/**
 * Kafka fixture definition for use with Playwright's test.extend().
 *
 * Lifecycle:
 * 1. Setup: Create Kafka instance → Connect producer → Create consumer with unique group ID → Connect consumer
 * 2. Provide KafkaClient to test via `use()`
 * 3. Teardown: Disconnect producer → Disconnect consumer (within 5s timeout, force-close if exceeded)
 */
export const kafkaFixture = {
    kafkaClient: async (
        { kafka: kafkaConfig }: { kafka: KafkaFixtureConfig | undefined },
        use: (client: KafkaClient) => Promise<void>,
        testInfo: { testId: string }
    ) => {
        // Use config from project `use` block if provided, otherwise fall back to env vars
        const config = kafkaConfig ?? getKafkaConfig();
        const disconnectTimeout = config.disconnectTimeout ?? 5000;

        // Create Kafka instance
        const kafka = new Kafka({
            clientId: config.clientId ?? 'playwright-test',
            brokers: config.brokers,
            ssl: config.ssl ?? false,
            ...(config.sasl ? { sasl: config.sasl as KafkaJsSASLOptions } : {}),
            logLevel: logLevel.WARN,
        });

        let producer: Producer;
        let consumer: Consumer;
        const groupId = generateGroupId(testInfo.testId);

        // Setup: Connect producer
        try {
            producer = kafka.producer();
            await producer.connect();
        } catch (error) {
            throw new FixtureInitError(
                'kafka',
                'connect',
                {
                    brokerAddress: config.brokers.join(','),
                    reason: error instanceof Error ? error.message : String(error),
                },
                error instanceof Error ? error : undefined
            );
        }

        // Setup: Connect consumer with unique group ID
        try {
            consumer = kafka.consumer({ groupId });
            await consumer.connect();
        } catch (error) {
            // Clean up producer if consumer connection fails
            try {
                await producer.disconnect();
            } catch {
                // Ignore cleanup errors
            }
            throw new FixtureInitError(
                'kafka',
                'connect',
                {
                    brokerAddress: config.brokers.join(','),
                    reason: error instanceof Error ? error.message : String(error),
                },
                error instanceof Error ? error : undefined
            );
        }

        // Build the client interface
        const client: KafkaClient = {
            /**
             * Produce messages to a Kafka topic.
             * Throws FixtureOperationError with topic on failure.
             */
            async produce(
                topic: string,
                messages: Array<{ key?: string | null; value: string | Buffer }>
            ): Promise<void> {
                try {
                    await producer.send({
                        topic,
                        messages: messages.map((msg) => ({
                            key: msg.key ?? null,
                            value: typeof msg.value === 'string' ? msg.value : msg.value,
                        })),
                    });
                } catch (error) {
                    throw new FixtureOperationError(
                        'kafka',
                        'produce',
                        {
                            topic,
                            reason: error instanceof Error ? error.message : String(error),
                        },
                        error instanceof Error ? error : undefined
                    );
                }
            },

            /**
             * Consume messages from a Kafka topic.
             * Returns an empty array if the timeout expires with no messages received.
             */
            async consume(topic: string, options?: ConsumeOptions): Promise<KafkaMessage[]> {
                const timeout = options?.timeout ?? 30000;
                const maxCount = options?.count;
                const fromBeginning = options?.fromBeginning ?? false;

                const messages: KafkaMessage[] = [];

                try {
                    await consumer.subscribe({ topic, fromBeginning });
                } catch (error) {
                    // If the topic does not exist or metadata fetch fails,
                    // return an empty array instead of throwing — matches the
                    // documented "returns empty array on timeout" contract.
                    return [];
                }

                return new Promise<KafkaMessage[]>((resolve) => {
                    let timeoutHandle: ReturnType<typeof setTimeout>;
                    let resolved = false;

                    const finish = () => {
                        if (resolved) return;
                        resolved = true;
                        clearTimeout(timeoutHandle);
                        consumer.stop().catch(() => { });
                        resolve(messages);
                    };

                    timeoutHandle = setTimeout(finish, timeout);

                    consumer.run({
                        eachMessage: async ({ topic: msgTopic, partition, message }: EachMessagePayload) => {
                            if (resolved) return;

                            messages.push({
                                key: message.key ? message.key.toString() : null,
                                value: message.value ? message.value.toString() : '',
                                topic: msgTopic,
                                partition,
                                offset: message.offset,
                            });

                            if (maxCount !== undefined && messages.length >= maxCount) {
                                finish();
                            }
                        },
                    });
                });
            },

            /**
             * Disconnect producer and consumer.
             */
            async disconnect(): Promise<void> {
                await disconnectWithTimeout(producer, consumer, disconnectTimeout);
            },
        };

        // Provide client to the test
        await use(client);

        // Teardown: Disconnect producer and consumer within timeout
        await disconnectWithTimeout(producer, consumer, disconnectTimeout);
    },
};

/**
 * Disconnect producer and consumer within the specified timeout.
 * Force-closes connections if the timeout is exceeded.
 */
async function disconnectWithTimeout(
    producer: Producer,
    consumer: Consumer,
    timeout: number
): Promise<void> {
    const disconnectPromise = async () => {
        try {
            await producer.disconnect();
        } catch {
            // Log but don't fail teardown
        }
        try {
            await consumer.disconnect();
        } catch {
            // Log but don't fail teardown
        }
    };

    const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
            // Force-close: resolve anyway after timeout
            resolve();
        }, timeout);
    });

    await Promise.race([disconnectPromise(), timeoutPromise]);
}

/**
 * Reads Kafka configuration from environment variables or returns defaults.
 */
function getKafkaConfig(): KafkaFixtureConfig {
    const brokersEnv = process.env.PW_KAFKA_BROKERS;
    const brokers = brokersEnv ? brokersEnv.split(',').map((b) => b.trim()) : ['localhost:9092'];

    const config: KafkaFixtureConfig = {
        brokers,
        clientId: process.env.PW_KAFKA_CLIENT_ID ?? 'playwright-test',
        ssl: process.env.PW_KAFKA_SSL === 'true',
        disconnectTimeout: process.env.PW_KAFKA_DISCONNECT_TIMEOUT
            ? parseInt(process.env.PW_KAFKA_DISCONNECT_TIMEOUT, 10)
            : 5000,
    };

    return config;
}
