/**
 * AMQP Step Class
 *
 * Reusable steps for RabbitMQ / AMQP 0-9-1: publish a message, listen on an
 * exchange for what the application publishes, and check queues. Each method
 * runs inside `test.step()`, so it shows up as one step in reports and traces.
 */

import { test, expect } from '../index.js';
import type {
    AmqpBody,
    AmqpClient,
    AmqpConsumeOptions,
    AmqpListener,
    AmqpListenOptions,
    AmqpMessage,
    AmqpPublishOptions,
    AmqpWaitOptions,
} from '../fixtures/amqp.fixture.js';

export type { AmqpClient, AmqpListener, AmqpMessage } from '../fixtures/amqp.fixture.js';

export class AmqpSteps {
    constructor(private amqpClient: AmqpClient) {}

    /** Publishes to an exchange and waits for the broker's confirm. */
    async publish(description: string, exchange: string, routingKey: string, message: AmqpBody, options?: AmqpPublishOptions): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.amqpClient.publish(exchange, routingKey, message, options);
        });
    }

    /** Publishes straight to a queue. */
    async sendToQueue(description: string, queue: string, message: AmqpBody, options?: AmqpPublishOptions): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.amqpClient.sendToQueue(queue, message, options);
        });
    }

    /**
     * Starts listening on an exchange. Call it before the action that
     * publishes: only messages published after this step are received.
     */
    async listen(description: string, exchange: string, bindingKey = '#', options?: AmqpListenOptions): Promise<AmqpListener> {
        let listener!: AmqpListener;
        await test.step(`Step: ${description}`, async () => {
            listener = await this.amqpClient.listen(exchange, bindingKey, options);
        });
        return listener;
    }

    /**
     * Waits for a message matching `predicate` on the listener and returns it.
     * Parallel tests share exchanges, so match on something unique to this
     * test (an order ID, a correlation ID).
     */
    async expectMessage(
        description: string,
        listener: AmqpListener,
        predicate?: (message: AmqpMessage) => boolean,
        options?: AmqpWaitOptions,
    ): Promise<AmqpMessage> {
        let message!: AmqpMessage;
        await test.step(`Step: ${description}`, async () => {
            message = await listener.waitForMessage(predicate, options);
        });
        return message;
    }

    /** Checks that no message matching `predicate` arrives within `timeout` ms (default 2000). */
    async expectNoMessage(
        description: string,
        listener: AmqpListener,
        predicate: (message: AmqpMessage) => boolean = () => true,
        timeout = 2000,
    ): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await new Promise((resolve) => setTimeout(resolve, timeout));
            const unexpected = listener.received.filter(predicate);
            expect(unexpected.map((m) => `${m.routingKey}: ${m.body}`)).toEqual([]);
        });
    }

    /** Takes `count` messages (default 1) from a queue and checks that they all arrived. */
    async consumeExpectMessages(description: string, queue: string, options?: AmqpConsumeOptions): Promise<AmqpMessage[]> {
        let messages: AmqpMessage[] = [];
        await test.step(`Step: ${description}`, async () => {
            messages = await this.amqpClient.consume(queue, options);
            expect(messages.length, `messages taken from queue "${queue}"`).toBe(options?.count ?? 1);
        });
        return messages;
    }

    /** Waits until a queue holds `count` ready messages (default timeout 10000 ms). */
    async expectQueueDepth(description: string, queue: string, count: number, timeout = 10_000): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect
                .poll(async () => (await this.amqpClient.checkQueue(queue))?.messageCount ?? null, {
                    message: `ready messages in queue "${queue}"`,
                    timeout,
                })
                .toBe(count);
        });
    }

    /** Empties a queue; returns how many messages it removed. */
    async purge(description: string, queue: string): Promise<number> {
        let removed = 0;
        await test.step(`Step: ${description}`, async () => {
            removed = await this.amqpClient.purge(queue);
        });
        return removed;
    }
}
