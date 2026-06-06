/**
 * Kafka Step Class
 *
 * Reusable step sequences for Kafka client operations.
 * Wraps common produce/consume patterns for test reuse.
 */

import { test, expect } from '../index';

export interface KafkaMessage {
    key: string | null;
    value: string | Buffer;
    topic: string;
    partition: number;
    offset: string;
}

export interface KafkaClient {
    produce(topic: string, messages: Array<{ key?: string | null; value: string | Buffer }>): Promise<void>;
    consume(topic: string, options?: { timeout?: number; count?: number; fromBeginning?: boolean }): Promise<KafkaMessage[]>;
}

export class KafkaSteps {
    constructor(private kafkaClient: KafkaClient) {}

    /**
     * Produces messages to a Kafka topic.
     */
    async produce(description: string, topic: string, messages: Array<{ key?: string | null; value: string | Buffer }>): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.kafkaClient.produce(topic, messages);
        });
    }

    /**
     * Consumes messages from a Kafka topic and returns them.
     */
    async consume(
        description: string,
        topic: string,
        options?: { timeout?: number; count?: number; fromBeginning?: boolean },
    ): Promise<KafkaMessage[]> {
        let messages: KafkaMessage[] = [];

        await test.step(`Step: ${description}`, async () => {
            messages = await this.kafkaClient.consume(topic, options);
        });

        return messages;
    }

    /**
     * Consumes and asserts that messages were received.
     */
    async consumeExpectMessages(
        description: string,
        topic: string,
        options?: { timeout?: number; count?: number; fromBeginning?: boolean },
    ): Promise<KafkaMessage[]> {
        let messages: KafkaMessage[] = [];

        await test.step(`Step: ${description}`, async () => {
            messages = await this.kafkaClient.consume(topic, options);
            expect(messages.length).toBeGreaterThan(0);

            for (const msg of messages) {
                expect(msg.topic).toBe(topic);
                expect(msg.value).toBeDefined();
                expect(msg.partition).toBeGreaterThanOrEqual(0);
                expect(msg.offset).toBeDefined();
            }
        });

        return messages;
    }

    /**
     * Consumes and asserts no messages were received (timeout scenario).
     */
    async consumeExpectEmpty(description: string, topic: string, timeout: number = 2000): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const messages = await this.kafkaClient.consume(topic, {
                timeout,
                fromBeginning: true,
            });
            expect(messages).toEqual([]);
        });
    }
}
