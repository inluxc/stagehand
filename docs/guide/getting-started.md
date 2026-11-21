# Getting Started

Propmaster extends [Playwright Test](https://playwright.dev/) with fixtures for the systems behind your UI: APIs, databases, message brokers, caches, mobile devices and OTP. You keep your Playwright config and tests. Propmaster adds more fixtures to request.

## Requirements

- Node.js 22.12 or newer
- `@playwright/test` (a peer dependency, so you choose the version)

## Install

```bash
npm install --save-dev @playwright/test @inluxc/propmaster
```

Propmaster itself has no runtime dependencies. Each fixture's driver is an optional peer dependency, so you install only the ones for the fixtures you use:

| Fixture | Install |
|---|---|
| `openApiClient` | `openapi-client-axios` (`js-yaml` too, for YAML spec files; `ajv` and `ajv-formats` for contract checks) |
| `graphqlClient` | `graphql-request graphql` |
| `databaseClient` | `pg` (PostgreSQL), `mysql2` (MySQL), `mssql` (MSSQL) or `better-sqlite3` (SQLite) |
| `mongoDbClient` | `mongodb` |
| `neo4jClient` | `neo4j-driver` |
| `kafkaClient` | `kafkajs` |
| `amqpClient` | `amqplib` |
| `redisClient` | `ioredis` |
| `otpClient` | `otplib` |
| `inboxClient` | nothing (uses `fetch`); needs a Mailpit server |
| `mockServer` | nothing (uses `fetch`); needs a WireMock server |
| `testData` | nothing (`@faker-js/faker` optional, for `f.faker`) |
| `appiumDriver` | `webdriverio` (`gadsHub` needs nothing extra) |
| `container: true` on any backend ([Testcontainers](../testcontainers)) | `testcontainers` |

```bash
# e.g. a project testing a REST API backed by PostgreSQL and Kafka
npm install --save-dev openapi-client-axios pg kafkajs
```

A test that requests a fixture whose driver isn't installed fails with a `MissingPackageError` that names the package and the install command. Importing Propmaster never loads a driver; each one loads the first time a test uses its fixture.

### Or scaffold a new project

`propmaster init` creates a project with one folder per test type (`tests/api`, `tests/integration`, `tests/e2e`, `tests/mobile`), a Playwright config that runs each type as its own project, an `environments.json`, and `tests/support/` for page objects, fixtures, test data and helpers:

```bash
npx propmaster init my-tests
```

Run it in a project that already has Playwright tests and it adds only what's missing. It moves nothing and reports where your tests belong; `npx propmaster organize` then moves them. See [Project Layout](./project-layout).

## Your first test

Import `test` and `expect` from Propmaster instead of `@playwright/test`. Then request fixtures by name:

```typescript
// tests/users.spec.ts
import { test, expect } from '@inluxc/propmaster';

test('a new user is stored as active', async ({ openApiClient, databaseClient }) => {
    const { client } = openApiClient;

    await test.step('Create the user through the API', async () => {
        const res = await (client as any).createUser(null, { name: 'Alice', email: 'alice@example.com' });
        expect(res.status).toBe(201);
    });

    await test.step('Check the row in the database', async () => {
        const rows = await databaseClient.query<{ active: boolean }>(
            'SELECT active FROM users WHERE email = $1', ['alice@example.com'],
        );
        expect(rows[0].active).toBe(true);
    });
});
```

Point the fixtures at your services with environment variables:

```bash
PW_OPENAPI_SPEC_PATH=./openapi.yaml \
PW_OPENAPI_BASE_URL=http://localhost:3000 \
PW_DB_TYPE=postgresql PW_DB_HOST=localhost PW_DB_NAME=app \
PW_DB_USERNAME=app PW_DB_PASSWORD=app \
npx playwright test
```

For more than a couple of variables, keep them in [`environments.json` or `.env` files](./configuration) instead.

## Playwright fixtures still work

Propmaster's `test` is built on `@playwright/test`, so `page`, `request`, `context` and `browser` are all available, alongside Propmaster fixtures in the same test:

```typescript
import { test, expect } from '@inluxc/propmaster';

test('a user created through the API appears in the admin UI', async ({ openApiClient, page }) => {
    const { client } = openApiClient;
    await (client as any).createUser(null, { name: 'Alice', email: 'alice@test.com' });

    await page.goto('/admin/users');
    await expect(page.getByText('alice@test.com')).toBeVisible();
});
```

## Available fixtures

| Fixture | What it gives you | Guide |
|---|---|---|
| `openApiClient` | Typed HTTP client generated from an OpenAPI spec | [OpenAPI](../openapi-fixture) |
| `graphqlClient` | GraphQL queries, mutations and raw responses | [GraphQL](../graphql-fixture) |
| `databaseClient` | PostgreSQL, MySQL, MSSQL or SQLite queries | [Database](../database-fixture) |
| `mongoDbClient` | MongoDB CRUD and aggregation | [MongoDB](../mongodb-fixture) |
| `neo4jClient` | Neo4j Cypher reads, writes and transactions | [Neo4j](../neo4j-fixture) |
| `kafkaClient` | Kafka produce and consume | [Kafka](../kafka-fixture) |
| `amqpClient` | RabbitMQ publish, listen on an exchange, consume and purge | [RabbitMQ](../amqp-fixture) |
| `redisClient` | Redis keys and pub/sub | [Redis](../redis-fixture) |
| `otpClient` | TOTP/HOTP codes for 2FA flows | [OTP](../otp-fixture) |
| `inboxClient` | Emailed codes, verification and reset links (Mailpit) | [Inbox](../inbox-fixture) |
| `mockServer` | Stubbed third-party APIs your backend calls (WireMock) | [Mock server](../mock-server-fixture) |
| `testData` | Factories and unique values; inserts through the clients are removed after each test | [Test data](../test-data) |
| `authToken` / `authRequest` | OAuth/OIDC tokens per role; `authRole` also starts browser tests logged in | [Auth](../auth) |
| `appiumDriver` | Appium session (WebdriverIO) on local Appium, a grid, a cloud farm or GADS | [Appium](../appium-fixture) |
| `gadsHub` | GADS hub status and device listing | [Appium → GADS](../appium-fixture#gads-preset) |

Need something else? [Write your own fixture](../custom-fixtures) on top of Propmaster's `test`.

## Next steps

- [Project Layout](./project-layout): folders by test type, one config, and sorting existing tests
- [Configuration](./configuration): environments, `.env` files and per-project settings
- [Writing Tests](./writing-tests): test IDs, steps and the convention checker
- [Running in CI](../ci): GitHub Actions jobs with real services
