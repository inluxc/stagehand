# MongoDB Fixture

The `mongoDbClient` fixture provides a MongoDB client with full CRUD and aggregation capabilities. It uses the official [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/) and manages connection lifecycle automatically.

---

## What It Does

- Connects to MongoDB (standalone, replica set, or Atlas via SRV)
- Verifies connectivity with a ping command on setup
- Provides typed CRUD operations: `find`, `findOne`, `insertOne`, `insertMany`, `updateOne`, `updateMany`, `deleteOne`, `deleteMany`
- Supports aggregation pipelines
- Closes the connection on teardown

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_MONGODB_URI` | No | Full MongoDB connection URI (overrides host/port/auth) |
| `PW_MONGODB_HOST` | No | MongoDB server host (default: `localhost`) |
| `PW_MONGODB_PORT` | No | MongoDB server port (default: `27017`) |
| `PW_MONGODB_DATABASE` | Yes | Database name |
| `PW_MONGODB_USERNAME` | No | Authentication username |
| `PW_MONGODB_PASSWORD` | No | Authentication password |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "mongodb": {
        "host": "localhost",
        "port": 27017,
        "database": "myapp_test",
        "username": "admin",
        "password": "secret",
        "authSource": "admin",
        "connectionTimeout": 10000
      }
    },
    "prod": {
      "mongodb": {
        "uri": "mongodb+srv://user:pass@cluster.mongodb.net/myapp",
        "database": "myapp"
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
        mongodb: {
          host: 'localhost',
          port: 27017,
          database: 'myapp_test',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `uri` | `string` | — | Full MongoDB connection URI (overrides host/port/auth) |
| `host` | `string` | `'localhost'` | MongoDB server host |
| `port` | `number` | `27017` | MongoDB server port |
| `database` | `string` | — | Database name |
| `username` | `string` | — | Authentication username |
| `password` | `string` | — | Authentication password |
| `authSource` | `string` | `'admin'` | Authentication source database |
| `srv` | `boolean` | `false` | Use `mongodb+srv://` protocol |
| `connectionTimeout` | `number` | `10000` | Connection timeout in ms |

---

## Usage

### Querying Documents

```typescript
import { test, expect } from '@inluxc/stagehand';

test('find active users', async ({ mongoDbClient }) => {
  const users = await mongoDbClient.find<{ name: string; email: string }>(
    'users',
    { active: true },
    { limit: 10, sort: { name: 1 } }
  );

  expect(users).toBeDefined();
  expect(Array.isArray(users)).toBe(true);
});

test('find a single document', async ({ mongoDbClient }) => {
  const user = await mongoDbClient.findOne<{ name: string }>(
    'users',
    { email: 'admin@example.com' }
  );

  if (user) {
    expect(user).toHaveProperty('name');
  }
});
```

### Inserting Documents

```typescript
test('insert a document', async ({ mongoDbClient }) => {
  const result = await mongoDbClient.insertOne('users', {
    name: 'Alice',
    email: 'alice@example.com',
    active: true,
  });

  expect(result.acknowledged).toBe(true);
  expect(result.insertedId).toBeDefined();
});

test('insert multiple documents', async ({ mongoDbClient }) => {
  const result = await mongoDbClient.insertMany('users', [
    { name: 'User A', email: 'a@example.com' },
    { name: 'User B', email: 'b@example.com' },
  ]);

  expect(result.insertedCount).toBe(2);
});
```

### Updating Documents

```typescript
test('update a document', async ({ mongoDbClient }) => {
  const result = await mongoDbClient.updateOne(
    'users',
    { email: 'alice@example.com' },
    { $set: { active: false } }
  );

  expect(result.acknowledged).toBe(true);
  expect(result.matchedCount).toBeGreaterThanOrEqual(0);
});
```

### Deleting Documents

```typescript
test('delete a document', async ({ mongoDbClient }) => {
  const result = await mongoDbClient.deleteOne('users', {
    email: 'alice@example.com',
  });

  expect(result.acknowledged).toBe(true);
});
```

### Aggregation Pipelines

```typescript
test('run an aggregation', async ({ mongoDbClient }) => {
  const results = await mongoDbClient.aggregate<{ _id: boolean; count: number }>(
    'users',
    [
      { $group: { _id: '$active', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]
  );

  expect(results).toBeDefined();
  if (results.length > 0) {
    expect(results[0]).toHaveProperty('count');
  }
});
```

### Find Options

| Option | Type | Description |
|--------|------|-------------|
| `limit` | `number` | Maximum number of documents to return |
| `skip` | `number` | Number of documents to skip |
| `sort` | `Record<string, 1 \| -1>` | Sort specification |
| `projection` | `Record<string, 0 \| 1>` | Fields to include or exclude |

---

## Lifecycle

1. **Setup** — Creates MongoClient, connects, verifies with a ping command
2. **Use** — Provides `mongoDbClient` to the test
3. **Teardown** — Closes the MongoClient connection

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | Connection failure (includes host, port, database, timeout) |
| `FixtureOperationError` | Operation failure (includes collection name and operation type) |
