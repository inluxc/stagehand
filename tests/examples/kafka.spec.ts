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

    test('produce messages to a topic', async ({ kafkaClient }) => {
        // The kafkaClient fixture provides:
        //   - produce(topic, messages): send messages to a Kafka topic
        //   - consume(topic, options?): read messages from a topic
        //   - disconnect(): manually disconnect (handled automatically on teardown)

        // Produce messages with optional keys
        await kafkaClient.produce('test-events', [
            { key: 'user-1', value: JSON.stringify({ event: 'login', userId: '1' }) },
            { key: 'user-2', value: JSON.stringify({ event: 'signup', userId: '2' }) },
        ]);

        // Messages are sent asynchronously — produce() resolves when the broker acknowledges
    });

    test('consume messages from a topic', async ({ kafkaClient }) => {
        const topic = 'test-notifications';

        // First, produce some messages
        await kafkaClient.produce(topic, [
            { key: 'alert-1', value: 'System maintenance scheduled' },
            { key: 'alert-2', value: 'New feature released' },
        ]);

        // Consume messages with options:
        //   - timeout: max wait time in ms (default: 30000)
        //   - count: max number of messages to consume
        //   - fromBeginning: start from the earliest offset
        const messages = await kafkaClient.consume(topic, {
            timeout: 10000,
            count: 2,
            fromBeginning: true,
        });

        // Each message includes key, value, topic, partition, and offset
        expect(messages.length).toBeGreaterThan(0);

        for (const msg of messages) {
            expect(msg.topic).toBe(topic);
            expect(msg.value).toBeDefined();
            expect(msg.partition).toBeGreaterThanOrEqual(0);
            expect(msg.offset).toBeDefined();
        }
    });

    test('consume returns empty array on timeout', async ({ kafkaClient }) => {
        // If no messages arrive within the timeout, consume returns an empty array
        // (it does NOT throw an error)
        const messages = await kafkaClient.consume('empty-topic', {
            timeout: 2000,
            fromBeginning: true,
        });

        expect(messages).toEqual([]);
    });
});
