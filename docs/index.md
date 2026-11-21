---
layout: home

hero:
  name: Propmaster
  text: Playwright fixtures for everything behind the UI
  tagline: Typed clients for APIs, databases, message brokers, caches, mobile devices and 2FA, ready to request in any Playwright test. Your existing setup stays as it is.
  image:
    src: /logo.svg
    alt: Propmaster logo
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Browse Fixtures
      link: /openapi-fixture
    - theme: alt
      text: GitHub
      link: https://github.com/inluxc/propmaster

features:
  - icon: 🔌
    title: OpenAPI & GraphQL
    details: A typed HTTP client generated from your OpenAPI spec, and a GraphQL client with queries, mutations and raw responses for error cases.
    link: /openapi-fixture
    linkText: API fixtures
  - icon: 🗄️
    title: Databases
    details: One client for PostgreSQL, MySQL, MSSQL and SQLite, plus MongoDB and Neo4j. Parameterized queries and typed rows.
    link: /database-fixture
    linkText: Database fixture
  - icon: 📨
    title: Kafka, RabbitMQ & Redis
    details: Produce and consume Kafka messages, publish to RabbitMQ and listen for the events your app publishes, and use Redis keys and pub/sub with per-run key prefixes.
    link: /kafka-fixture
    linkText: Messaging fixtures
  - icon: 📱
    title: Mobile with Appium
    details: A WebdriverIO session on local Appium, a grid, a cloud farm or a GADS device farm. The device is freed when the test ends.
    link: /appium-fixture
    linkText: Appium fixture
  - icon: 🔐
    title: OTP & secrets
    details: Generate and verify TOTP/HOTP codes for 2FA flows. Load credentials from AWS, Azure, Vault, OpenBao, GitLab or .env files.
    link: /otp-fixture
    linkText: OTP fixture
  - icon: 🚦
    title: Built for CI
    details: Environment-aware config, test-convention checks, and GitHub Actions jobs that run every backend in parallel against real services.
    link: /ci
    linkText: Running in CI
---

## One import, every fixture

Swap the import and request what the test needs. `page`, `request` and every other Playwright fixture still work.

```typescript
import { test, expect } from '@inluxc/propmaster';

test('order placed via API shows up in the database', async ({ openApiClient, databaseClient }) => {
    const { client } = openApiClient;
    const res = await (client as any).createOrder(null, { sku: 'ABC-1', quantity: 2 });
    expect(res.status).toBe(201);

    const rows = await databaseClient.query<{ status: string }>(
        'SELECT status FROM orders WHERE id = $1', [res.data.id],
    );
    expect(rows[0].status).toBe('pending');
});
```

Each fixture connects on first use and cleans up after the test, so a test that doesn't ask for Kafka never opens a Kafka connection.
