/**
 * AMQP (RabbitMQ) Fixture — Example Tests
 *
 * Shows how to publish messages and check what was published with the
 * `amqpClient` fixture and the AmqpSteps class. Each test declares its own
 * exchange and queues with unique names; the fixture deletes them afterwards.
 *
 * Prerequisites:
 *   - A RabbitMQ broker: PW_AMQP_URL (amqp://user:pass@localhost:5672),
 *     PW_AMQP_CONTAINER=true, or `amqp` in environments.json
 *   - `docker compose -f compose.test.yaml up -d --wait rabbitmq` runs one locally
 */

import { randomUUID } from 'node:crypto';
import { test, expect } from '../../src';
import { AmqpSteps } from '../../src/steps';

test.describe('AMQP Fixture Examples', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-AMQ-001] a published event reaches a listener on the exchange', { tag: ['@TC-AMQ-001'] }, async ({ amqpClient, testData }) => {
        const amqp = new AmqpSteps(amqpClient);
        const exchange = testData.unique('orders');
        const orderId = testData.unique('ord');

        await test.step('Step 1: Declare a topic exchange', async () => {
            await amqpClient.assertExchange(exchange, 'topic', { durable: false });
        });

        const listener = await amqp.listen('Listen for order events on the exchange', exchange, 'orders.*');

        await amqp.publish('Publish an order.created event', exchange, 'orders.created', { orderId, total: 42 }, {
            correlationId: orderId,
            headers: { source: 'checkout' },
        });

        const message = await amqp.expectMessage(
            'Wait for the event for this order',
            listener,
            (m) => m.json<{ orderId: string }>().orderId === orderId,
        );

        await test.step('Step 2: Verify the message body and properties', async () => {
            expect(message.routingKey).toBe('orders.created');
            expect(message.json()).toEqual({ orderId, total: 42 });
            expect(message.properties.contentType).toBe('application/json');
            expect(message.properties.correlationId).toBe(orderId);
            expect(message.headers.source).toBe('checkout');
        });
    });

    test('[TC-AMQ-002] listening does not take messages from the application queue', { tag: ['@TC-AMQ-002'] }, async ({ amqpClient, testData }) => {
        const amqp = new AmqpSteps(amqpClient);
        const exchange = testData.unique('events');
        const appQueue = testData.unique('app-queue');
        let listener!: Awaited<ReturnType<typeof amqpClient.listen>>;

        await test.step('Step 1: Set up an exchange with the application queue bound to it', async () => {
            await amqpClient.assertExchange(exchange, 'fanout', { durable: false });
            await amqpClient.assertQueue(appQueue);
            await amqpClient.bindQueue(appQueue, exchange, '');
            listener = await amqpClient.listen(exchange);
        });

        await amqp.publish('Publish one event', exchange, '', 'user signed up');

        await amqp.expectMessage('Verify the listener got a copy', listener, (m) => m.body === 'user signed up');

        const [appCopy] = await amqp.consumeExpectMessages('Verify the application queue still has its copy', appQueue, { count: 1, timeout: 5000 });
        await test.step('Step 2: Verify the copy is the same message', async () => {
            expect(appCopy.body).toBe('user signed up');
            expect(appCopy.properties.contentType).toBe('text/plain');
        });
    });

    test('[TC-AMQ-003] consume takes only the requested number of messages', { tag: ['@TC-AMQ-003'] }, async ({ amqpClient, testData }) => {
        const amqp = new AmqpSteps(amqpClient);
        const queue = testData.unique('jobs');

        await test.step('Step 1: Declare a queue and send three jobs to it', async () => {
            await amqpClient.assertQueue(queue);
            for (const n of [1, 2, 3]) await amqpClient.sendToQueue(queue, { job: n });
        });

        const taken = await amqp.consumeExpectMessages('Take two jobs from the queue', queue, { count: 2 });

        await test.step('Step 2: Verify the jobs came in order', async () => {
            expect(taken.map((m) => m.json())).toEqual([{ job: 1 }, { job: 2 }]);
        });

        await amqp.expectQueueDepth('Verify one job is left in the queue', queue, 1);
    });

    test('[TC-AMQ-004] publishing with no queue bound for the routing key fails', { tag: ['@TC-AMQ-004'] }, async ({ amqpClient, testData }) => {
        const exchange = testData.unique('unbound');

        await test.step('Step 1: Declare an exchange with nothing bound to it', async () => {
            await amqpClient.assertExchange(exchange, 'direct', { durable: false });
        });

        await test.step('Step 2: Verify the publish is rejected as unroutable', async () => {
            await expect(amqpClient.publish(exchange, 'nowhere', 'lost')).rejects.toThrow(/no queue is bound/);
        });

        await test.step('Step 3: Verify { mandatory: false } allows it', async () => {
            await amqpClient.publish(exchange, 'nowhere', 'lost', { mandatory: false });
        });
    });

    test('[TC-AMQ-005] purge empties a queue', { tag: ['@TC-AMQ-005'] }, async ({ amqpClient, testData }) => {
        const amqp = new AmqpSteps(amqpClient);
        const queue = testData.unique('backlog');

        await test.step('Step 1: Fill a queue with leftover messages', async () => {
            await amqpClient.assertQueue(queue);
            for (const n of [1, 2, 3, 4]) await amqpClient.sendToQueue(queue, `old ${n}`);
        });

        await amqp.expectQueueDepth('Verify the queue holds four messages', queue, 4);

        const removed = await amqp.purge('Purge the queue', queue);

        await test.step('Step 2: Verify every message was removed', async () => {
            expect(removed).toBe(4);
            expect((await amqpClient.checkQueue(queue))?.messageCount).toBe(0);
        });
    });

    test('[TC-AMQ-006] listen on a headers exchange with binding arguments', { tag: ['@TC-AMQ-006'] }, async ({ amqpClient, testData }) => {
        const amqp = new AmqpSteps(amqpClient);
        const exchange = testData.unique('notifications');

        await test.step('Step 1: Declare a headers exchange', async () => {
            await amqpClient.assertExchange(exchange, 'headers', { durable: false });
        });

        const listener = await amqp.listen('Listen for e-mail notifications only', exchange, '', {
            arguments: { 'x-match': 'all', channel: 'email' },
        });

        await amqp.publish('Publish an SMS notification', exchange, '', 'sms body', { headers: { channel: 'sms' }, mandatory: false });
        await amqp.publish('Publish an e-mail notification', exchange, '', 'email body', { headers: { channel: 'email' } });

        await amqp.expectMessage('Verify the e-mail notification arrives', listener, (m) => m.body === 'email body');
        await amqp.expectNoMessage('Verify the SMS notification does not', listener, (m) => m.body === 'sms body', 500);
    });

    test('[TC-AMQ-007] waiting for a message that never comes fails with what arrived', { tag: ['@TC-AMQ-007'] }, async ({ amqpClient, testData }) => {
        const exchange = testData.unique('audit');
        let listener!: Awaited<ReturnType<typeof amqpClient.listen>>;

        await test.step('Step 1: Listen on an exchange and publish an unrelated event', async () => {
            await amqpClient.assertExchange(exchange, 'topic', { durable: false });
            listener = await amqpClient.listen(exchange, 'audit.#');
            await amqpClient.publish(exchange, 'audit.login', { user: 'alice' });
            await listener.messages({ count: 1, timeout: 5000 });
        });

        await test.step('Step 2: Verify the wait times out and names the message that did arrive', async () => {
            await expect(listener.waitForMessage((m) => m.routingKey === 'audit.logout', { timeout: 500 }))
                .rejects.toThrow(/no matching message within 500 ms: 1 message\(s\) arrived, none matching: audit\.login/);
        });
    });

    test('[TC-AMQ-010] a queue RabbitMQ 4 refuses gives a clear error and the client keeps working', { tag: ['@TC-AMQ-010'] }, async ({ amqpClient, testData }) => {
        const queue = testData.unique('transient');

        await test.step('Step 1: Verify a non-durable, non-exclusive queue is refused with the fix in the message', async () => {
            await expect(amqpClient.assertQueue(queue, { durable: false })).rejects.toThrow(/leave out durable: false, or pass exclusive: true/);
        });

        await test.step('Step 2: Verify the next call reconnects and works', async () => {
            await amqpClient.assertQueue(queue);
            await amqpClient.sendToQueue(queue, 'still connected');
            const [message] = await amqpClient.consume(queue);
            expect(message.body).toBe('still connected');
        });
    });
});

// Run in order in one worker: the second test checks what the first left behind.
test.describe.serial('AMQP Fixture Examples — cleanup', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    const suffix = randomUUID().slice(0, 8);
    const exchange = `cleanup-ex-${suffix}`;
    const queue = `cleanup-q-${suffix}`;

    test('[TC-AMQ-008] declare an exchange, a queue and a binding', { tag: ['@TC-AMQ-008'] }, async ({ amqpClient }) => {
        await test.step('Step 1: Declare them through the client', async () => {
            await amqpClient.assertExchange(exchange, 'direct', { durable: false });
            await amqpClient.assertQueue(queue);
            await amqpClient.bindQueue(queue, exchange, 'key');
        });

        await test.step('Step 2: Verify they exist during the test', async () => {
            expect(await amqpClient.exchangeExists(exchange)).toBe(true);
            expect(await amqpClient.checkQueue(queue)).toMatchObject({ queue, messageCount: 0 });
        });
    });

    test('[TC-AMQ-009] what the previous test declared was deleted when it ended', { tag: ['@TC-AMQ-009'] }, async ({ amqpClient }) => {
        await test.step('Step 1: Verify the queue and the exchange are gone', async () => {
            expect(await amqpClient.checkQueue(queue)).toBeNull();
            expect(await amqpClient.exchangeExists(exchange)).toBe(false);
        });
    });
});
