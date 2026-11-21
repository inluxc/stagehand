# RabbitMQ (AMQP) Fixture

The `amqpClient` fixture tests event-driven flows on RabbitMQ and other AMQP 0-9-1 brokers. A test publishes a message and checks what the application did, or triggers an action and checks the event the application published. Reading the event doesn't take it from the application's own queues.

---

## What It Does

- `publish()` and `sendToQueue()` wait for the broker to confirm the message. They fail when no queue is bound for the routing key, because the broker would otherwise drop the message without a word.
- `listen(exchange, bindingKey)` binds a temporary queue of the test's own to the exchange. The application's queues still get their copies, and the test reads its copy from the listener.
- `consume(queue)` takes messages from a named queue: one the test owns, or one it means to empty.
- `waitForMessage()` fails with a readable error that lists the messages that did arrive.
- Queues, exchanges and bindings the test declares through the client are deleted when the test ends, pass or fail.
- `PW_AMQP_CONTAINER=true` starts RabbitMQ in a container for the run.

---

## Setup

### Install

```bash
npm install --save-dev amqplib
```

You also need a broker. Pick one of these:

```bash
# Locally, with the repo's compose file (user testuser / testpass)
docker compose -f compose.test.yaml up -d --wait rabbitmq

# Or let the test run start one (needs Docker and testcontainers)
npm install --save-dev testcontainers
PW_AMQP_CONTAINER=true npx playwright test
```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `PW_AMQP_URL` | Broker URL, `amqp://user:pass@host:5672/vhost` (`amqps://` for TLS). Takes precedence over the variables below | — |
| `PW_AMQP_HOST` | Broker host | — |
| `PW_AMQP_PORT` | Broker port | `5672` (`5671` with TLS) |
| `PW_AMQP_USERNAME`, `PW_AMQP_PASSWORD` | Credentials | — |
| `PW_AMQP_VHOST` | Virtual host | `/` |
| `PW_AMQP_TLS` | `true` connects with `amqps` | `false` |
| `PW_AMQP_HEARTBEAT` | Heartbeat interval in seconds (`0` turns heartbeats off) | the broker's |
| `PW_AMQP_TIMEOUT` | Default wait for `consume()`, `messages()` and `waitForMessage()`, in ms | `10000` |
| `PW_AMQP_CONTAINER` | `true` (or an image name) starts RabbitMQ in a container | off |

### Configuration via `environments.json`

```json
{
    "environments": {
        "local": {
            "amqp": { "url": "amqp://testuser:testpass@localhost:5672" }
        },
        "dev": {
            "amqp": { "host": "rabbitmq.dev.example.com", "tls": true, "username": "tests", "vhost": "shop" }
        }
    }
}
```

The password can come from a [secrets provider](./secrets): map it to `amqp.password`.

### Configuration via `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';
import { ConfigLoader } from '@inluxc/propmaster';

const config = new ConfigLoader().load();

export default defineConfig({
    projects: [
        {
            name: 'integration',
            testDir: './tests/integration',
            use: { amqp: config.amqp, database: config.database },
        },
    ],
});
```

### Configuration Options

| Option | Type | Default | |
|---|---|---|---|
| `url` | `string` | — | Broker URL; takes precedence over host, port, credentials and vhost |
| `host`, `port` | `string`, `number` | —, `5672` | |
| `username`, `password` | `string` | — | |
| `vhost` | `string` | `/` | |
| `tls` | `boolean` | `false` | `amqps`, default port 5671 |
| `heartbeat` | `number` | the broker's | Seconds |
| `connectionTimeout` | `number` | `10000` | ms |
| `timeout` | `number` | `10000` | Default wait for messages, in ms |
| `container` | `boolean \| ContainerOptions` | off | See [Testcontainers](./testcontainers) |

---

## Usage

### Check the event your application publishes

Start listening **before** the action. A listener only receives messages published after `listen()` returns.

```typescript
import { test, expect } from '@inluxc/propmaster';

test('[TC-AMQ-001] placing an order publishes order.created', { tag: ['@TC-AMQ-001'] }, async ({ amqpClient, openApiClient }) => {
    const listener = await amqpClient.listen('orders', 'order.*');
    let orderId: string;

    await test.step('Step 1: Place an order through the API', async () => {
        const response = await (openApiClient.client as any).createOrder(null, { sku: 'SKU-1', quantity: 2 });
        expect(response.status).toBe(201);
        orderId = response.data.id;
    });

    await test.step('Step 2: Verify the order.created event', async () => {
        const event = await listener.waitForMessage((m) => m.json<{ orderId: string }>().orderId === orderId);
        expect(event.routingKey).toBe('order.created');
        expect(event.json()).toMatchObject({ orderId, quantity: 2 });
    });
});
```

Tests running in parallel share the exchange, so every listener also sees the other tests' events. Match on something unique to the test (an ID it created, a correlation ID), as `waitForMessage()` does above, rather than taking the first message that arrives.

### Publish a message your application consumes

```typescript
test('[TC-AMQ-002] a payment.captured event marks the order paid', { tag: ['@TC-AMQ-002'] }, async ({ amqpClient, databaseClient, testData }) => {
    const orderId = testData.unique('ord');

    await test.step('Step 1: Publish the payment event', async () => {
        await amqpClient.publish('payments', 'payment.captured', { orderId, amount: 4200 }, {
            correlationId: orderId,
            headers: { source: 'psp' },
            persistent: true,
        });
    });

    await test.step('Step 2: Verify the order is marked paid', async () => {
        await expect.poll(async () => {
            const [row] = await databaseClient.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
            return row?.status;
        }, { timeout: 10_000 }).toBe('paid');
    });
});
```

The body can be a string (sent as `text/plain`), a Buffer (sent as it is) or anything else (sent as JSON, `application/json`). `contentType` in the options overrides the default.

`publish()` throws when no queue is bound for the routing key, which usually means a wrong exchange name or routing key. If dropping the message is what you want, pass `{ mandatory: false }`.

### Work with a queue the test owns

```typescript
test('[TC-AMQ-003] a job queue', { tag: ['@TC-AMQ-003'] }, async ({ amqpClient, testData }) => {
    const queue = testData.unique('jobs');

    await test.step('Step 1: Declare the queue and send three jobs', async () => {
        await amqpClient.assertQueue(queue);            // deleted after the test
        for (const n of [1, 2, 3]) await amqpClient.sendToQueue(queue, { job: n });
    });

    await test.step('Step 2: Take two and verify one is left', async () => {
        const taken = await amqpClient.consume(queue, { count: 2 });
        expect(taken.map((m) => m.json())).toEqual([{ job: 1 }, { job: 2 }]);
        expect((await amqpClient.checkQueue(queue))?.messageCount).toBe(1);
    });
});
```

`consume()` acknowledges the messages it takes, so they're removed from the queue. On an application's queue this competes with the application's own consumers. Use `listen()` there instead.

### Headers exchanges

```typescript
const listener = await amqpClient.listen('notifications', '', {
    arguments: { 'x-match': 'all', channel: 'email' },
});
```

### With the Steps class

```typescript
import { AmqpSteps } from '@inluxc/propmaster/steps';

const amqp = new AmqpSteps(amqpClient);
const listener = await amqp.listen('Listen for order events', 'orders', 'order.*');
await amqp.publish('Publish an order.created event', 'orders', 'order.created', { orderId });
await amqp.expectMessage('Verify the event arrives', listener, (m) => m.json<{ orderId: string }>().orderId === orderId);
await amqp.expectNoMessage('Verify no cancellation is published', listener, (m) => m.routingKey === 'order.cancelled');
await amqp.consumeExpectMessages('Take two jobs', 'jobs', { count: 2 });
await amqp.expectQueueDepth('Verify the queue is empty', 'jobs', 0);
await amqp.purge('Empty the dead-letter queue', 'orders.dlq');
```

### API Reference

| Method | Returns | |
|---|---|---|
| `publish(exchange, routingKey, body, options?)` | `Promise<void>` | Waits for the broker's confirm. `''` is the default exchange |
| `sendToQueue(queue, body, options?)` | `Promise<void>` | Through the default exchange |
| `listen(exchange, bindingKey = '#', { arguments }?)` | `Promise<AmqpListener>` | A temporary exclusive queue bound to the exchange |
| `listener.waitForMessage(predicate?, { timeout }?)` | `Promise<AmqpMessage>` | The first match, received so far or still to come; throws on timeout |
| `listener.messages({ count = 1, timeout }?)` | `Promise<AmqpMessage[]>` | Waits for `count` messages; returns what arrived |
| `listener.received` | `AmqpMessage[]` | Everything received so far |
| `consume(queue, { count = 1, timeout }?)` | `Promise<AmqpMessage[]>` | Takes and acknowledges messages; returns what arrived |
| `purge(queue)` | `Promise<number>` | Messages removed |
| `checkQueue(queue)` | `Promise<{ queue, messageCount, consumerCount } \| null>` | `null` when the queue doesn't exist |
| `exchangeExists(exchange)` | `Promise<boolean>` | |
| `assertQueue(queue, options?)` | `Promise<string>` | The queue's name (`''` lets the broker pick one) |
| `assertExchange(exchange, type, options?)` | `Promise<void>` | `direct`, `topic`, `fanout`, `headers`, ... |
| `bindQueue(queue, exchange, pattern, { arguments, keep }?)` | `Promise<void>` | |

**Publish options:** `headers`, `contentType`, `contentEncoding`, `correlationId`, `messageId`, `replyTo`, `type`, `appId`, `userId`, `priority`, `expiration` (ms), `timestamp`, `persistent`, `mandatory` (default `true`).

**`AmqpMessage`:** `body` (UTF-8 string), `content` (Buffer), `json<T>()`, `exchange`, `routingKey`, `redelivered`, `headers`, and `properties` (every AMQP property).

---

## Lifecycle

1. **Setup:** one connection per test.
2. **Test:** publishes go through a confirm channel, one at a time. Each listener and each `consume()` gets a channel of its own.
3. **Teardown:** in reverse order, the bindings, exchanges and queues the test declared are removed. Pass `{ keep: true }` to `assertQueue`, `assertExchange` or `bindQueue` to leave one in place, or set `use: { autoCleanup: false }` on a project. A queue or exchange that existed before the test is never deleted. Then listener queues are deleted and the connection closes.

If the broker closes the connection (for example, RabbitMQ refusing a queue declaration), the next call reconnects, so the rest of the test and the cleanup still run.

---

## RabbitMQ 4 notes

- **Transient queues:** RabbitMQ 4 refuses queues declared with `durable: false` unless they're also `exclusive`, and it closes the connection when you try. Leave out `durable: false` (the queue is deleted after the test anyway), or pass `exclusive: true`. The fixture's error message says so.
- **The `guest` user** can only connect from the broker's own host. In containers and CI, create a user: `RABBITMQ_DEFAULT_USER` / `RABBITMQ_DEFAULT_PASS`, as `compose.test.yaml` does.

---

## Error Handling

| Error | When |
|---|---|
| `FixtureInitError` (`amqp`, `connect`) | No broker configured, or the connection failed. The URL in the message has its password replaced with `***` |
| `FixtureOperationError` (`amqp`, `publish`) | The broker rejected the message, or no queue is bound for the routing key |
| `FixtureOperationError` (`amqp`, `listen` / `consume`) | The exchange or queue doesn't exist |
| `FixtureOperationError` (`amqp`, `waitForMessage`) | No matching message before the timeout. The message lists what arrived |
| `FixtureOperationError` (`amqp`, `assertQueue` / `assertExchange`) | The declaration conflicts with an existing one, or the broker refused it |
| `MissingPackageError` | `amqplib` isn't installed |
