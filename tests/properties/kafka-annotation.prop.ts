/**
 * Property 5: Kafka annotation contains required metadata
 *
 * For any topic name string and non-negative message count, the Kafka annotation
 * formatter SHALL produce an annotation containing the operation type (`produce`
 * or `consume`), the exact topic name, and the exact message count.
 *
 * **Validates: Requirements 12.3**
 *
 * Feature: cicd-emulated-testing, Property 5: Kafka annotation contains required metadata
 */

import { test, expect } from '@playwright/test';
import fc from 'fast-check';
import { recordKafka } from '../../src/annotations/recorder';

/** Creates a mock testInfo object for testing */
function createMockTestInfo() {
    return { annotations: [] as Array<{ type: string; description?: string }> };
}

/** Arbitrary for Kafka operation type */
const arbOperation = fc.constantFrom('produce', 'consume') as fc.Arbitrary<'produce' | 'consume'>;

/** Arbitrary for topic name — non-empty string without credential patterns */
const arbTopic = fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789._-'.split('')),
    { minLength: 1, maxLength: 100 }
);

/** Arbitrary for non-negative message count */
const arbMessageCount = fc.nat();

test.describe('Property 5: Kafka annotation contains required metadata', {
    tag: '@Feature: cicd-emulated-testing, Property 5: Kafka annotation contains required metadata',
}, () => {
    test('annotation has type fixture-operation', async () => {
        await fc.assert(
            fc.property(arbOperation, arbTopic, arbMessageCount, (operation, topic, messageCount) => {
                const testInfo = createMockTestInfo();
                recordKafka(testInfo, operation, topic, messageCount);

                expect(testInfo.annotations).toHaveLength(1);
                expect(testInfo.annotations[0].type).toBe('fixture-operation');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains fixture: kafka', async () => {
        await fc.assert(
            fc.property(arbOperation, arbTopic, arbMessageCount, (operation, topic, messageCount) => {
                const testInfo = createMockTestInfo();
                recordKafka(testInfo, operation, topic, messageCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.fixture).toBe('kafka');
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the correct operation', async () => {
        await fc.assert(
            fc.property(arbOperation, arbTopic, arbMessageCount, (operation, topic, messageCount) => {
                const testInfo = createMockTestInfo();
                recordKafka(testInfo, operation, topic, messageCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.operation).toBe(operation);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the exact topic name (after redaction)', async () => {
        await fc.assert(
            fc.property(arbOperation, arbTopic, arbMessageCount, (operation, topic, messageCount) => {
                const testInfo = createMockTestInfo();
                recordKafka(testInfo, operation, topic, messageCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                // Topic names generated from safe characters won't trigger redaction
                expect(metadata.topic).toBe(topic);
            }),
            { numRuns: 100 }
        );
    });

    test('parsed description contains the exact messageCount', async () => {
        await fc.assert(
            fc.property(arbOperation, arbTopic, arbMessageCount, (operation, topic, messageCount) => {
                const testInfo = createMockTestInfo();
                recordKafka(testInfo, operation, topic, messageCount);

                const metadata = JSON.parse(testInfo.annotations[0].description!);
                expect(metadata.messageCount).toBe(messageCount);
            }),
            { numRuns: 100 }
        );
    });
});
