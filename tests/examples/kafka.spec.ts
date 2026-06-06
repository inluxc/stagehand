/**
 * Kafka Fixture — Example Test
 *
 * Demonstrates how to use the Kafka client fixture to produce and consume
 * messages. Uses the KafkaSteps class for reusable step sequences.
 * The fixture handles producer/consumer lifecycle and teardown automatically.
 *
 * Prerequisites:
 *   - Kafka brokers configured via PW_KAFKA_BROKERS or environments.json
 *   - Kafka cluster running and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';
import { KafkaSteps } from '../../src/steps';

test.describe('Kafka Fixture Examples', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-KFK-001] produce messages to a topic', { tag: ['@TC-KFK-001'] }, async ({ kafkaClient }) => {
        const kafka = new KafkaSteps(kafkaClient);

        await kafka.produce('Produce two messages with keys to test-events topic', 'test-events', [
            { key: 'user-1', value: JSON.stringify({ event: 'login', userId: '1' }) },
            { key: 'user-2', value: JSON.stringify({ event: 'signup', userId: '2' }) },
        ]);
    });

    test('[TC-KFK-002] consume messages from a topic', { tag: ['@TC-KFK-002'] }, async ({ kafkaClient }) => {
        const kafka = new KafkaSteps(kafkaClient);
        const topic = 'test-notifications';

        await kafka.produce('Produce messages to the topic', topic, [
            { key: 'alert-1', value: 'System maintenance scheduled' },
            { key: 'alert-2', value: 'New feature released' },
        ]);

        await kafka.consumeExpectMessages(
            'Consume messages with timeout and fromBeginning options',
            topic,
            { timeout: 10000, count: 2, fromBeginning: true },
        );
    });

    test('[TC-KFK-003] consume returns empty array on timeout', { tag: ['@TC-KFK-003'] }, async ({ kafkaClient }) => {
        const kafka = new KafkaSteps(kafkaClient);

        await kafka.consumeExpectEmpty('Consume from an empty topic with short timeout', 'empty-topic', 2000);
    });
});
