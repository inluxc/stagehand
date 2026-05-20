# Playwright Framework Template

A reusable Playwright test framework template with an extensible fixture architecture for API, integration, browser, and mobile testing. Includes pre-built fixtures for OpenAPI, Database, Kafka, Redis, OTP (2FA/MFA), and Mobilewright mobile testing — with built-in support for security testing, responsiveness validation, accessibility (ARIA) coverage, console error tracking, and performance monitoring.

## Prerequisites

- Node.js 18+
- npm or yarn
- For mobile testing: Xcode (iOS) or Android SDK (Android)

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers (required for browser-based tests)
npx playwright install
```

## Project Structure

The framework organizes tests into Playwright projects, each with its own configuration passed via the `use` block:

| Project | Purpose | Config passed |
|---|---|---|
| `openapi` | API testing via OpenAPI spec | `openapi` |
| `mobile-ios` | Mobile testing on iOS | `mobilewright` |
| `mobile-android` | Mobile testing on Android | `mobilewright` |
| `browser-chromium` | Browser testing (Chrome) | `baseURL` + device |
| `browser-firefox` | Browser testing (Firefox) | `baseURL` + device |
| `browser-webkit` | Browser testing (Safari) | `baseURL` + device |
| `api-integration` | Database, Kafka, Redis tests | `database`, `kafka`, `redis` |
| `property-tests` | Property-based tests | — |

Run a specific project:

```bash
npx playwright test --project=openapi
npx playwright test --project=mobile-ios
npx playwright test --project=browser-chromium
```

## Environment Configuration

Configuration uses a three-tier precedence system:

1. **Environment variables** (highest priority)
2. **Environment file** (`.env.{environment}`) — medium priority
3. **Configuration file** (`environments.json`) — lowest priority

Set the active environment with `PW_ENVIRONMENT`:

```bash
PW_ENVIRONMENT=dev npm test
```

Supported environments: `local`, `dev`, `test`, `stg`, `prod`.

### Project-Level Configuration

Configurations are loaded by `ConfigLoader` and passed to each project's `use` block in `playwright.config.ts`. Fixtures receive their config as a Playwright option, with automatic fallback to `ConfigLoader` / env vars when not provided.

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import { ConfigLoader } from './src/config/loader';
import type { ConfigOptions } from './src/fixtures';

const config = new ConfigLoader().load();

export default defineConfig<ConfigOptions>({
    projects: [
        {
            name: 'openapi',
            testMatch: '**/examples/openapi.spec.ts',
            use: {
                openapi: config.openapi,
            },
        },
        {
            name: 'mobile-ios',
            testMatch: '**/examples/mobilewright.spec.ts',
            use: {
                mobilewright: {
                    platform: 'ios',
                    bundleId: 'com.example.app',
                    deviceName: 'iPhone 15',
                    appPath: './apps/example.app',
                },
            },
        },
        {
            name: 'browser-chromium',
            testMatch: '**/examples/browser.spec.ts',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: config.openapi?.baseUrl,
            },
        },
        {
            name: 'api-integration',
            testMatch: '**/examples/{database,kafka,redis}.spec.ts',
            use: {
                database: config.database,
                kafka: config.kafka,
                redis: config.redis,
            },
        },
    ],
});
```

### Config Options

The `ConfigOptions` interface defines the fixture options available in the `use` block:

| Option | Type | Used by |
|---|---|---|
| `openapi` | `OpenApiFixtureConfig` | `openApiClient` fixture |
| `database` | `DatabaseFixtureConfig` | `databaseClient` fixture |
| `kafka` | `KafkaFixtureConfig` | `kafkaClient` fixture |
| `redis` | `RedisFixtureConfig` | `redisClient` fixture |
| `mobilewright` | `MobilewrightFixtureConfig` | `mobilewrightDevice` / `mobilewrightScreen` fixtures |
| `otp` | `OtpFixtureConfig` | `otpClient` fixture |

All options are optional — when not provided in the project `use` block, fixtures fall back to loading config from `ConfigLoader` (env vars → `.env` file → `environments.json`).

### Environment Variables

| Variable | Description |
|---|---|
| `PW_ENVIRONMENT` | Active environment name |
| `PW_OPENAPI_SPEC_PATH` | OpenAPI spec file path or URL |
| `PW_OPENAPI_BASE_URL` | API base URL override |
| `PW_DB_TYPE` | Database type (`postgresql`, `mysql`, `mssql`, `sqlite`) |
| `PW_DB_HOST` | Database host |
| `PW_DB_PORT` | Database port |
| `PW_DB_NAME` | Database name |
| `PW_DB_USERNAME` | Database username |
| `PW_DB_PASSWORD` | Database password |
| `PW_KAFKA_BROKERS` | Comma-separated Kafka broker list |
| `PW_REDIS_HOST` | Redis host |
| `PW_REDIS_PORT` | Redis port |
| `PW_REDIS_PASSWORD` | Redis password |
| `PW_REDIS_KEY_PREFIX` | Test key prefix for isolation |
| `PW_MOBILE_PLATFORM` | Target platform (`ios` or `android`) |
| `PW_MOBILE_BUNDLE_ID` | Application bundle identifier |
| `PW_MOBILE_DEVICE_NAME` | Target device or simulator name |
| `PW_MOBILE_APP_PATH` | Path to application binary |

Copy `.env.example` to `.env.local` (or `.env.dev`, etc.) and fill in your values.

## How to Run Tests

```bash
# Run all tests
npm test

# Run a specific project
npx playwright test --project=openapi
npx playwright test --project=mobile-ios
npx playwright test --project=browser-chromium
npx playwright test --project=api-integration

# Run tests by tag
npm run test:tag -- @smoke

# Run with a specific environment
PW_ENVIRONMENT=dev npx playwright test --project=openapi

# TypeScript type-checking
npm run typecheck
```

## Usage Examples

### OpenAPI Client Fixture

```typescript
import { test, expect } from '../src/fixtures';

test('fetch users via OpenAPI', async ({ openApiClient }) => {
  const { client } = openApiClient;

  // Call an operation defined in your OpenAPI spec
  const response = await client.getUsers();
  expect(response.status).toBe(200);
  expect(response.data).toBeInstanceOf(Array);
});
```

### Database Fixture

```typescript
import { test, expect } from '../src/fixtures';

test('query database records', async ({ databaseClient }) => {
  const users = await databaseClient.query<{ id: number; name: string }>(
    'SELECT id, name FROM users WHERE active = $1',
    [true]
  );

  expect(users.length).toBeGreaterThan(0);
});
```

### Kafka Fixture

```typescript
import { test, expect } from '../src/fixtures';

test('produce and consume messages', async ({ kafkaClient }) => {
  await kafkaClient.produce('test-topic', [
    { key: 'key-1', value: JSON.stringify({ event: 'user.created' }) },
  ]);

  const messages = await kafkaClient.consume('test-topic', {
    count: 1,
    timeout: 10000,
  });

  expect(messages).toHaveLength(1);
  expect(JSON.parse(messages[0].value.toString())).toEqual({ event: 'user.created' });
});
```

### Redis Fixture

```typescript
import { test, expect } from '../src/fixtures';

test('set and get cache values', async ({ redisClient }) => {
  await redisClient.set('session:abc', JSON.stringify({ userId: 1 }), 60);

  const value = await redisClient.get('session:abc');
  expect(JSON.parse(value!)).toEqual({ userId: 1 });

  await redisClient.del('session:abc');
});
```

### Mobilewright Fixture

```typescript
import { test, expect } from '../src/fixtures';

test('tap login button on mobile', async ({ mobilewrightScreen, mobilewrightDevice }) => {
  // Open a deep link
  await mobilewrightDevice.openUrl('myapp://login');

  // Interact with the screen
  const loginButton = mobilewrightScreen.getByText('Log In');
  await mobilewrightScreen.tap(loginButton);

  // Verify navigation
  const welcomeText = mobilewrightScreen.getByText('Welcome');
  expect(welcomeText).toBeDefined();
});
```

### OTP Fixture (2FA/MFA)

```typescript
import { test, expect } from '../src/fixtures';

test('generate and verify TOTP for 2FA login', async ({ otpClient }) => {
  // Generate a secret (or use one from your test user setup)
  const secret = otpClient.generateSecret();

  // Generate a time-based token
  const token = await otpClient.generateTotp(secret);
  expect(token).toMatch(/^\d{6}$/);

  // Verify the token
  const isValid = await otpClient.verifyTotp(token, secret);
  expect(isValid).toBe(true);
});

test('generate otpauth URI for QR provisioning', async ({ otpClient }) => {
  const secret = otpClient.generateSecret();
  const uri = otpClient.generateKeyUri('user@example.com', 'MyApp', secret);
  expect(uri).toContain('otpauth://totp/');
});
```

## Configuration

### Three-Tier Precedence

The framework resolves configuration values in this order:

1. **Project `use` block** — explicit config in `playwright.config.ts` takes precedence
2. **Environment variables** — `PW_*` prefixed variables override file-based config
3. **Environment file** — `.env.{environment}` file values override the config file
4. **Configuration file** — `environments.json` provides base defaults

If a required value is missing from all sources, the framework throws a `ConfigurationError` listing the missing keys.

### environments.json

The `environments.json` file defines per-environment configuration. Each environment can specify connection details for all fixtures:

```json
{
  "environments": {
    "local": {
      "openapi": { "specPath": "./specs/api.yaml", "baseUrl": "http://localhost:3000" },
      "database": { "type": "postgresql", "host": "localhost", "port": 5432, "database": "testdb" },
      "kafka": { "brokers": ["localhost:9092"] },
      "redis": { "host": "localhost", "port": 6379 },
      "mobilewright": { "platform": "ios", "bundleId": "com.example.app", "deviceName": "iPhone 15", "appPath": "./apps/example.app" }
    }
  }
}
```

## Secrets

The framework includes a pluggable secrets provider system that retrieves sensitive values (passwords, tokens, API keys) from external services and injects them into configuration before fixture initialization.

### Supported Providers

- **AWS Secrets Manager** — for staging/production environments
- **HashiCorp Vault** — for production environments (KV v1 & v2, Token & AppRole auth, Enterprise namespaces)
- **GitLab CI/CD Variables** — for CI pipelines
- **Azure Key Vault** — for Azure-hosted environments
- **Environment file** — local `.env.*` fallback for development

### Configuration

Secrets are configured per-environment in `environments.json`:

```json
{
  "secrets": {
    "provider": "aws",
    "options": { "region": "us-east-1" },
    "keyMappings": {
      "db-password": "database.password",
      "redis-password": "redis.password"
    },
    "timeout": 10000
  }
}
```

### HashiCorp Vault

The Vault provider supports multiple authentication methods and both KV v1 and v2 secrets engines.

#### Token Authentication

The simplest method — provide a Vault token directly or via the `VAULT_TOKEN` environment variable:

```json
{
  "secrets": {
    "provider": "vault",
    "options": {
      "url": "https://vault.example.com",
      "mountPath": "secret/data/playwright",
      "token": "hvs.your-vault-token"
    },
    "keyMappings": {
      "db-password": "database.password",
      "redis-password": "redis.password"
    },
    "timeout": 15000
  }
}
```

Or set `VAULT_TOKEN` in your environment and omit the `token` field.

#### AppRole Authentication

Recommended for CI/CD pipelines and automated systems:

```json
{
  "secrets": {
    "provider": "vault",
    "options": {
      "url": "https://vault.example.com",
      "mountPath": "secret/data/playwright",
      "roleId": "your-role-id",
      "secretId": "your-secret-id"
    },
    "keyMappings": {
      "db-password": "database.password",
      "kafka-sasl-password": "kafka.sasl.password"
    }
  }
}
```

Or set `VAULT_ROLE_ID` and `VAULT_SECRET_ID` environment variables.

#### Vault Enterprise Namespaces

For Vault Enterprise with namespace isolation:

```json
{
  "secrets": {
    "provider": "vault",
    "options": {
      "url": "https://vault.example.com",
      "mountPath": "secret/data/playwright",
      "namespace": "admin/team-qa"
    },
    "keyMappings": {
      "db-password": "database.password"
    }
  }
}
```

Or set `VAULT_NAMESPACE` environment variable.

#### KV v1 Secrets Engine

If using the older KV v1 engine (no versioning):

```json
{
  "secrets": {
    "provider": "vault",
    "options": {
      "url": "https://vault.example.com",
      "mountPath": "secret/playwright",
      "kvVersion": 1
    },
    "keyMappings": {
      "db-password": "database.password"
    }
  }
}
```

#### Vault Environment Variables

| Variable | Description |
|---|---|
| `VAULT_TOKEN` | Vault authentication token |
| `VAULT_ROLE_ID` | AppRole role ID |
| `VAULT_SECRET_ID` | AppRole secret ID |
| `VAULT_NAMESPACE` | Vault Enterprise namespace |

All fetched secrets are cached for the entire test runner invocation. Custom providers can be registered by implementing the `SecretsProvider` interface.

## Test Coverage Categories

The framework encourages comprehensive test coverage across multiple dimensions. Each test file should include relevant categories from the following:

### API Tests (OpenAPI)

API tests are structured into three sections:

| Section | Purpose |
|---|---|
| **Positive Tests** | Happy-path scenarios with valid inputs — verify correct status codes, response bodies, and data types |
| **Negative Tests** | Invalid inputs, missing fields, wrong types, boundary values — verify proper error responses (400, 404, 422) |
| **Security Tests** | Injection and abuse attempts — verify the API never returns 500 for malicious input |

#### Security Test Coverage

| Attack Vector | What's Tested |
|---|---|
| SQL Injection | Payloads in path params, body fields, and query params |
| XSS (Cross-Site Scripting) | Script tags, event handlers, javascript: URIs in input fields |
| OS Command Injection | Shell metacharacters (`;`, `|`, `$()`, backticks) in inputs |
| Path Traversal | `../` sequences and encoded variants in path parameters |
| NoSQL Injection | MongoDB-style operators (`$gt`, `$ne`, `$where`) in inputs |
| Authentication Bypass | Missing tokens, invalid tokens, accessing other users' resources |
| Rate Limiting | Rapid repeated requests to verify throttling |
| Header Injection | CRLF injection in custom headers |
| Mass Assignment | Unexpected fields and prototype pollution attempts |
| Response Headers | Verification of security headers (`X-Content-Type-Options`, `X-Frame-Options`, etc.) |

```typescript
// Example: SQL injection test
test('SQL injection in path parameter is rejected', async ({ openApiClient }) => {
    const { client } = openApiClient;
    const payloads = ["1; DROP TABLE users;--", "1' OR '1'='1"];

    for (const payload of payloads) {
        try {
            await (client as any).getItemById({ id: payload });
        } catch (error: any) {
            expect(error.response.status).toBeLessThan(500);
        }
    }
});
```

### Browser Tests (UI)

Browser tests are structured into six sections:

| Section | Purpose |
|---|---|
| **Functional** | Core user interactions, form submissions, navigation flows |
| **Responsiveness** | Layout validation across 7 viewport sizes (320px–1920px) |
| **Accessibility (ARIA)** | Landmarks, labels, headings, keyboard navigation, contrast |
| **Console & Error Tracking** | JS errors, failed requests, deprecations, unhandled rejections |
| **Performance** | Load time, CLS, large resources, memory leak detection |
| **Visual Regression** | Screenshot baselines with pixel diff tolerance |

#### Responsiveness Testing

Tests validate across these viewports:

| Viewport | Width |
|---|---|
| Mobile S | 320px |
| Mobile M | 375px |
| Mobile L | 425px |
| Tablet | 768px |
| Laptop | 1024px |
| Desktop | 1440px |
| Wide | 1920px |

Checks include: no horizontal overflow, responsive images, minimum font size (12px), touch target sizing (44x44px per WCAG 2.5.5), and mobile navigation toggle behavior.

#### Accessibility (ARIA) Testing

| Check | What's Verified |
|---|---|
| Landmarks | `banner`, `navigation`, `main`, `contentinfo` present |
| Images | All `<img>` elements have `alt` text |
| Form Labels | All inputs have associated `<label>`, `aria-label`, or `aria-labelledby` |
| Heading Hierarchy | No skipped levels (h1 → h3 without h2) |
| Keyboard Navigation | Focus moves to interactive elements, focus indicator visible |
| Accessible Names | All buttons/links have text, `aria-label`, or `title` |
| Color Contrast | WCAG AA ratios (4.5:1 normal text, 3:1 large text) |
| ARIA Roles | Only valid WAI-ARIA roles used |

> **Note:** Automated accessibility checks are approximations. Full WCAG compliance requires manual testing with assistive technologies and expert review.

#### Console & Error Tracking

```typescript
// Example: Catch JS errors during page load
test('page loads without JavaScript errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (error) => {
        errors.push(`Uncaught: ${error.message}`);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors).toEqual([]);
});
```

Tracked issues:
- JavaScript runtime errors and uncaught exceptions
- Failed network requests (4xx/5xx on page load)
- Deprecated API usage warnings
- Mixed content warnings (HTTP resources on HTTPS pages)
- Unhandled promise rejections
- Errors across multi-page navigation flows

#### Performance Monitoring

| Metric | Threshold |
|---|---|
| Page load time | < 3 seconds (DOM content loaded) |
| Cumulative Layout Shift (CLS) | < 0.25 |
| Resource size | Flag resources > 1MB |
| Memory growth | < 10MB after repeated navigation |

## Custom Fixtures

The framework supports creating custom fixtures that integrate with the existing architecture. See [docs/custom-fixtures.md](docs/custom-fixtures.md) for the full guide on creating custom fixtures, including setup/teardown patterns, dependency declaration, and a working example.

## AI-Assisted Test Generation

This project includes documentation for AI agents to generate tests following the framework's patterns:

- **[AGENTS.md](AGENTS.md)** — Reference documentation: project structure, fixture APIs, configuration, conventions
- **[SKILLS.md](SKILLS.md)** — Step-by-step recipes for creating tests (13 skills covering all test types)

AI agents can use these files to produce tests that follow the framework's conventions, including positive/negative/security testing for APIs and responsiveness/accessibility/error-tracking for browser tests.

## License

MIT
