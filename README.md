# Stagehand

> *In theater, a **stagehand** is the person who works behind the scenes — setting up props, managing scenery, and making sure everything is in place before the actors perform. They're invisible to the audience, but without them, the show doesn't happen.*

**Stagehand** does the same for your [Playwright](https://playwright.dev/) tests. It sets up the infrastructure fixtures — API clients, databases, message queues, caches, mobile devices, OTP — so your tests can focus on the performance itself.

---

An extension toolkit for [Playwright Test](https://playwright.dev/) that adds ready-to-use fixtures for API, database, messaging, cache, mobile, and OTP testing. You keep your existing Playwright setup — Stagehand just gives you more fixtures to work with.

## Installation

```bash
# Playwright is a peer dependency — you bring your own version
npm install @playwright/test
npm install @inluxc/stagehand
```

## How It Works

Stagehand exports an extended `test` object built on top of `@playwright/test`. All standard Playwright fixtures (`page`, `request`, `context`, etc.) remain available. The package simply layers additional fixtures on top:

```typescript
// Instead of:
import { test, expect } from '@playwright/test';

// Use:
import { test, expect } from '@inluxc/stagehand';

// You still have access to `page`, `request`, etc.
test('browser test still works', async ({ page }) => {
  await page.goto('https://example.com');
  await expect(page).toHaveTitle(/Example/);
});

// Plus new fixtures:
test('api test with OpenAPI client', async ({ openApiClient }) => {
  const { client } = openApiClient;
  const res = await (client as any).listUsers();
  expect(res.status).toBe(200);
});
```

---

## Available Fixtures

| Fixture | Type | What it does | Docs |
|---------|------|--------------|------|
| `openApiClient` | `OpenApiClient` | Typed HTTP client generated from your OpenAPI spec | [Setup & Usage](docs/openapi-fixture.md) |
| `databaseClient` | `DatabaseClient` | Multi-dialect DB client (PostgreSQL, MySQL, MSSQL, SQLite) | [Setup & Usage](docs/database-fixture.md) |
| `kafkaClient` | `KafkaClient` | Kafka producer/consumer | [Setup & Usage](docs/kafka-fixture.md) |
| `redisClient` | `RedisClient` | Redis client with pub/sub | [Setup & Usage](docs/redis-fixture.md) |
| `mongoDbClient` | `MongoDbClient` | MongoDB CRUD and aggregation client | [Setup & Usage](docs/mongodb-fixture.md) |
| `graphqlClient` | `GraphQLClient` | GraphQL query/mutation client | [Setup & Usage](docs/graphql-fixture.md) |
| `otpClient` | `OtpClient` | TOTP/HOTP generation and verification for 2FA testing | [Setup & Usage](docs/otp-fixture.md) |
| `mobilewrightDevice` | `MobilewrightDevice` | Mobile device control | [Setup & Usage](docs/mobilewright-fixture.md) |
| `mobilewrightScreen` | `MobilewrightScreen` | Mobile screen interactions | [Setup & Usage](docs/mobilewright-fixture.md) |

All standard Playwright fixtures (`page`, `request`, `context`, `browser`, `browserName`) remain fully available.

> For creating your own fixtures, see [Custom Fixtures](docs/custom-fixtures.md).

---

## Usage Examples

### Mixing Playwright's `page` with Stagehand fixtures

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Full-stack test', () => {
  test('create user via API, verify in browser', async ({ openApiClient, page }) => {
    // Use the API fixture to create data
    const { client } = openApiClient;
    const res = await (client as any).createUser(null, {
      name: 'Alice',
      email: 'alice@test.com',
    });
    expect(res.status).toBe(201);

    // Use Playwright's page fixture to verify in the UI
    await page.goto('/admin/users');
    await expect(page.getByText('alice@test.com')).toBeVisible();
  });
});
```

### OpenAPI Client

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Pet Store API', () => {
  test('list all pets', async ({ openApiClient }) => {
    const { client } = openApiClient;
    const response = await (client as any).listPets();

    expect(response.status).toBe(200);
    expect(response.data).toBeInstanceOf(Array);
  });

  test('create and fetch a pet', async ({ openApiClient }) => {
    const { client } = openApiClient;

    const created = await (client as any).createPet(null, {
      name: 'Buddy',
      species: 'dog',
    });
    expect(created.status).toBe(201);

    const fetched = await (client as any).getPet({ petId: created.data.id });
    expect(fetched.data.name).toBe('Buddy');
  });
});
```

### Database Client

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Database Operations', () => {
  test('query users', async ({ databaseClient }) => {
    const rows = await databaseClient.query<{ id: number; name: string }>(
      'SELECT id, name FROM users WHERE active = $1',
      [true]
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toHaveProperty('name');
  });

  test('insert a record', async ({ databaseClient }) => {
    const result = await databaseClient.execute(
      'INSERT INTO users (name, email) VALUES ($1, $2)',
      ['Bob', 'bob@example.com']
    );

    expect(result.affectedRows).toBe(1);
  });
});
```

### Kafka Client

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Kafka Messaging', () => {
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
    expect(JSON.parse(messages[0].value)).toMatchObject(payload);
  });
});
```

### Redis Client

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Redis Cache', () => {
  test('set and get a value', async ({ redisClient }) => {
    await redisClient.set('session:abc', JSON.stringify({ userId: 1 }), 60);

    const value = await redisClient.get('session:abc');
    expect(JSON.parse(value!)).toEqual({ userId: 1 });
  });

  test('pub/sub messaging', async ({ redisClient }) => {
    const messagePromise = redisClient.subscribe('notifications', { timeout: 5000 });
    await redisClient.publish('notifications', 'Hello!');

    const received = await messagePromise;
    expect(received).toBe('Hello!');
  });
});
```

### OTP Client (2FA/MFA Testing)

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Two-Factor Authentication', () => {
  test('generate and verify TOTP', async ({ otpClient }) => {
    const secret = otpClient.generateSecret();
    const token = await otpClient.generateTotp(secret);

    expect(token).toHaveLength(6);
    expect(await otpClient.verifyTotp(token, secret)).toBe(true);
  });

  test('generate key URI for QR provisioning', async ({ otpClient }) => {
    const secret = otpClient.generateSecret();
    const uri = otpClient.generateKeyUri('user@example.com', 'MyApp', secret);

    expect(uri).toContain('otpauth://totp/');
    expect(uri).toContain('MyApp');
  });
});
```

### Mobile Testing (Mobilewright)

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Mobile App - Login', () => {
  test('user can log in', async ({ mobilewrightDevice, mobilewrightScreen }) => {
    await mobilewrightDevice.openUrl('myapp://login');

    await mobilewrightScreen.fill(
      mobilewrightScreen.getByLabel('Email'),
      'user@example.com'
    );
    await mobilewrightScreen.fill(
      mobilewrightScreen.getByLabel('Password'),
      'securepass123'
    );
    await mobilewrightScreen.tap(mobilewrightScreen.getByText('Sign In'));
  });
});
```

### Browser Testing (standard Playwright — unchanged)

```typescript
import { test, expect } from '@inluxc/stagehand';

test.describe('Web App', () => {
  test('loads the dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });
});
```

---

## Extending Further — Custom Fixtures

You can layer your own fixtures on top of Stagehand the same way you would with `@playwright/test`:

```typescript
// my-fixtures.ts
import { test as base } from '@inluxc/stagehand';

export const test = base.extend<{ authToken: string }>({
  authToken: async ({ openApiClient }, use) => {
    // Use Stagehand's openApiClient to get a token
    const { client } = openApiClient;
    const res = await (client as any).login(null, {
      email: 'test@example.com',
      password: 'password',
    });
    await use(res.data.token);
  },
});

export { expect } from '@inluxc/stagehand';
```

```typescript
// my-test.spec.ts
import { test, expect } from './my-fixtures';

test('authenticated request', async ({ authToken, page }) => {
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${authToken}` });
  await page.goto('/protected');
  await expect(page).toHaveTitle(/Protected/);
});
```

---

## Configuration

### Environment Variables

All config uses the `PW_` prefix. Set `PW_ENVIRONMENT` to load the matching `.env.{environment}` file:

```bash
PW_ENVIRONMENT=dev npx playwright test
```

| Variable | Purpose |
|----------|---------|
| `PW_ENVIRONMENT` | Active environment (`local`, `dev`, `test`, `stg`, `prod`) |
| `PW_OPENAPI_SPEC_PATH` | Path or URL to OpenAPI spec |
| `PW_OPENAPI_BASE_URL` | API base URL |
| `PW_DB_TYPE` | `postgresql`, `mysql`, `mssql`, `sqlite` |
| `PW_DB_HOST` / `PW_DB_PORT` / `PW_DB_NAME` | Database connection |
| `PW_DB_USERNAME` / `PW_DB_PASSWORD` | Database credentials |
| `PW_KAFKA_BROKERS` | Comma-separated broker list |
| `PW_REDIS_HOST` / `PW_REDIS_PORT` / `PW_REDIS_PASSWORD` | Redis connection |
| `PW_REDIS_KEY_PREFIX` | Key prefix for test isolation |
| `PW_MOBILE_PLATFORM` | `ios` or `android` |
| `PW_OTP_SECRET` | Base32-encoded OTP secret |
| `PW_OTP_DIGITS` | Token length (default: 6) |
| `PW_OTP_PERIOD` | TOTP time step in seconds (default: 30) |

### `playwright.config.ts` — works as normal

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: 'https://api.example.com',
  },
  projects: [
    { name: 'api', testMatch: '**/api/**/*.spec.ts' },
    { name: 'browser', testMatch: '**/browser/**/*.spec.ts' },
  ],
});
```

---

## Secrets Management

```typescript
import { SecretsManager } from '@inluxc/stagehand';

// Supports: aws, vault, azure, gitlab, env-file
const secrets = new SecretsManager({ provider: 'aws', region: 'us-east-1' });
const dbPassword = await secrets.get('prod/db-password');
```

---

## Publishing

```bash
npm run build
npm publish
```

## License

MIT
