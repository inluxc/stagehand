# Redis Fixture

The `redisClient` fixture provides a Redis client with get, set, del, publish, and subscribe methods. It uses [ioredis](https://github.com/redis/ioredis) under the hood and supports test-scoped key prefix isolation with automatic cleanup on teardown.

---

## What It Does

- Connects to a Redis server with configurable timeout and authentication
- Provides key-value operations (`get`, `set`, `del`) with optional TTL
- Supports pub/sub messaging (`publish`, `subscribe`)
- Isolates test keys using a configurable prefix
- Automatically flushes prefixed keys on teardown
- Creates a dedicated subscriber connection for pub/sub when key prefix is configured

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_REDIS_HOST` | No | Redis server host (default: `localhost`) |
| `PW_REDIS_PORT` | No | Redis server port (default: `6379`) |
| `PW_REDIS_PASSWORD` | No | Redis authentication password |
| `PW_REDIS_KEY_PREFIX` | No | Key prefix for test isolation |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "redis": {
        "host": "localhost",
        "port": 6379,
        "password": "redis-secret",
        "db": 0,
        "keyPrefix": "test:",
        "connectionTimeout": 5000
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
        redisConfig: {
          host: 'localhost',
          port: 6379,
          keyPrefix: 'test:',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `host` | `string` | — | Redis server host |
| `port` | `number` | — | Redis server port |
| `password` | `string` | — | Redis authentication password |
| `db` | `number` | — | Redis database index |
| `keyPrefix` | `string` | — | Test-scoped key prefix for isolation |
| `connectionTimeout` | `number` | `5000` | Connection timeout in ms |

---

## Usage

### Basic Key-Value Operations

```typescript
import { test, expect } from '@inluxc/stagehand';

test('set and get a value', async ({ redisClient }) => {
  await redisClient.set('session:abc', JSON.stringify({ userId: 1 }), 60); // TTL: 60 seconds

  const value = await redisClient.get('session:abc');
  expect(JSON.parse(value!)).toEqual({ userId: 1 });
});

test('delete a key', async ({ redisClient }) => {
  await redisClient.set('temp-key', 'value');
  const deleted = await redisClient.del('temp-key');
  expect(deleted).toBe(1);

  const value = await redisClient.get('temp-key');
  expect(value).toBeNull();
});
```

### Pub/Sub Messaging

```typescript
test('pub/sub messaging', async ({ redisClient }) => {
  // Start subscribing before publishing
  const messagePromise = redisClient.subscribe('notifications', { timeout: 5000 });

  // Publish a message
  await redisClient.publish('notifications', 'Hello!');

  // Wait for the message
  const received = await messagePromise;
  expect(received).toBe('Hello!');
});
```

### API Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `get` | `(key: string) => Promise<string \| null>` | Get a value by key |
| `set` | `(key: string, value: string, ttl?: number) => Promise<void>` | Set a value with optional TTL in seconds |
| `del` | `(key: string) => Promise<number>` | Delete a key, returns number of keys removed |
| `publish` | `(channel: string, message: string) => Promise<number>` | Publish a message to a channel |
| `subscribe` | `(channel: string, options?: SubscribeOptions) => Promise<string \| null>` | Subscribe and wait for one message |

### Subscribe Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | `number` | `5000` | Timeout in ms to wait for a message |

---

## Key Prefix Isolation

When `keyPrefix` is configured, all keys are automatically prefixed. This prevents test data from colliding with other data in the same Redis instance.

```json
{
  "redis": {
    "keyPrefix": "test:run-123:"
  }
}
```

With this config, `redisClient.set('mykey', 'value')` actually stores the key as `test:run-123:mykey`. On teardown, all keys matching the prefix pattern are automatically cleaned up.

---

## Lifecycle

1. **Setup** — Creates ioredis client, verifies connection with PING, creates subscriber client if keyPrefix is configured
2. **Use** — Provides `redisClient` to the test
3. **Teardown** — Flushes all prefixed keys (via SCAN + DEL), disconnects subscriber, quits main client

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | Connection failure (includes host, port, timeout) |

The `subscribe()` method returns `null` (rather than throwing) if the timeout expires without receiving a message.
