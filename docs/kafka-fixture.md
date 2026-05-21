# Kafka Fixture

The `kafkaClient` fixture provides Kafka producer and consumer capabilities for integration testing. It uses [KafkaJS](https://kafka.js.org/) under the hood and manages the full lifecycle of producer/consumer connections per test with unique consumer group IDs for message isolation.

---

## What It Does

- Connects a Kafka producer and consumer per test
- Generates unique consumer group IDs for test isolation
- Supports SSL and SASL authentication
- Provides `produce()` and `consume()` methods with configurable timeouts
- Handles graceful disconnection with timeout-based force-close

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_KAFKA_BROKERS` | No | Comma-separated broker list (default: `localhost:9092`) |
| `PW_KAFKA_CLIENT_ID` | No | Client identifier (default: `playwright-test`) |
| `PW_KAFKA_SSL` | No | Enable SSL (`true`/`false`) |
| `PW_KAFKA_DISCONNECT_TIMEOUT` | No | Disconnect timeout in ms (default: `5000`) |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "kafka": {
        "brokers": ["kafka-1.dev.example.com:9092", "kafka-2.dev.example.com:9092"],
        "clientId": "playwright-test",
        "ssl": true,
        "sasl": {
          "mechanism": "plain",
          "username": "test-user",
          "password": "test-pass"
        },
        "disconnectTimeout": 5000
      }
    }
  }
}
```

### Configuration via `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'integration',
      testMatch: '**/integration/**/*.spec.ts',
      use: {
        kafka: {
          brokers: ['localhost:9092'],
          clientId: 'playwright-test',
          ssl: false,
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `brokers` | `string[]` | `['localhost:9092']` | List of Kafka broker addresses |
| `clientId` | `string` | `'playwright-test'` | Kafka client identifier |
| `ssl` | `boolean` | `false` | Enable SSL for broker connections |
| `sasl` | `SASLOptions` | — | SASL authentication options |
| `disconnectTimeout` | `number` | `5000` | Timeout in ms for disconnect operations |

#### SASL Options

| Option | Type | Description |
|--------|------|-------------|
| `mechanism` | `'plain' \| 'scram-sha-256' \| 'scram-sha-512'` | Authentication mechanism |
| `username` | `string` | SASL username |
| `password` | `string` | SASL password |

---

## Usage

### Producing Messages

```typescript
import { test, expect } from '@inluxc/stagehand';

test('produce a message', async ({ kafkaClient }) => {
  await kafkaClient.produce('user-events', [
    { key: 'user-42', value: JSON.stringify({ action: 'signup' }) },
  ]);
});
```

### Consuming Messages

```typescript
test('consume messages from a topic', async ({ kafkaClient }) => {
  const messages = await kafkaClient.consume('user-events', {
    count: 1,
    timeout: 10000,
    fromBeginning: true,
  });

  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0].value as string)).toHaveProperty('action');
});
```

### Produce and Consume Together

```typescript
test('produce and consume a message', async ({ kafkaClient }) => {
  const payload = { userId: 42, action: 'signup' };

  await kafkaClient.produce('user-events', [
    { key: 'user-42', value: JSON.stringify(payload) },
  ]);

  const messages = await kafkaClient.consume('user-events', {
    count: 1,
    timeout: 10000,
    fromBeginning: false,
  });

  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0].value as string)).toMatchObject(payload);
});
```

### Consume Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `30000` | Maximum time to wait for messages in ms |
| `count` | `number` | — | Maximum number of messages to consume |
| `fromBeginning` | `boolean` | `false` | Whether to consume from the beginning of the topic |

### Message Shape

Each consumed message has the following structure:

```typescript
interface KafkaMessage {
  key: string | null;
  value: string | Buffer;
  topic: string;
  partition: number;
  offset: string;
}
```

---

## Lifecycle

1. **Setup** — Creates Kafka instance, connects producer, creates consumer with unique group ID, connects consumer
2. **Use** — Provides `kafkaClient` to the test
3. **Teardown** — Disconnects producer and consumer within the configured timeout (force-closes if exceeded)

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | Producer or consumer connection failure |
| `FixtureOperationError` | Message production failure |

The `consume()` method returns an empty array (rather than throwing) if the timeout expires with no messages or if the topic does not exist.
