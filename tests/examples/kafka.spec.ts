/**
 * Kafka Fixture — Example Test
 *
 * Demonstrates how to use the Kafka client fixture to produce and consume
 * messages. Each test gets a unique consumer group ID for message isolation.
 * The fixture handles producer/consumer lifecycle and teardown automatically.
 *
 * Prerequisites:
 *   - Kafka brokers configured via PW_KAFKA_BROKERS or environments.json
 *   - Kafka cluster running and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('Kafka Fixture Examples', () => {
    // These tests require a running Kafka cluster.
    // Skip them when infrastructure is not available.
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-KFK-001] produce messages to a topic', { tag: ['@TC-KFK-001'] }, async ({ kafkaClient }) => {
        await test.step('Step 1: Produce two messages with keys to test-events topic', async () => {
            await kafkaClient.produce('test-events', [
                { key: 'user-1', value: JSON.stringify({ event: 'login', userId: '1' }) },
                { key: 'user-2', value: JSON.stringify({ event: 'signup', userId: '2' }) },
            ]);
        });
    });

    test('[TC-KFK-002] consume messages from a topic', { tag: ['@TC-KFK-002'] }, async ({ kafkaClient }) => {
        const topic = 'test-notifications';

        await test.step('Step 1: Produce messages to the topic', async () => {
            await kafkaClient.produce(topic, [
                { key: 'alert-1', value: 'System maintenance scheduled' },
                { key: 'alert-2', value: 'New feature released' },
            ]);
        });

        await test.step('Step 2: Consume messages with timeout and fromBeginning options', async () => {
            const messages = await kafkaClient.consume(topic, {
                timeout: 10000,
                count: 2,
                fromBeginning: true,
            });

            expect(messages.length).toBeGreaterThan(0);

            for (const msg of messages) {
                expect(msg.topic).toBe(topic);
                expect(msg.value).toBeDefined();
                expect(msg.partition).toBeGreaterThanOrEqual(0);
                expect(msg.offset).toBeDefined();
            }
        });
    });

    test('[TC-KFK-003] consume returns empty array on timeout', { tag: ['@TC-KFK-003'] }, async ({ kafkaClient }) => {
        await test.step('Step 1: Consume from an empty topic with short timeout', async () => {
            const messages = await kafkaClient.consume('empty-topic', {
                timeout: 2000,
                fromBeginning: true,
            });

            expect(messages).toEqual([]);
        });
    });
});
