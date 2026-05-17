# Creating Custom Fixtures

This guide explains how to create custom fixtures that integrate with the Playwright Framework Template's fixture architecture.

## Fixture Definition Pattern

Every fixture follows the same lifecycle pattern:

1. **Setup** — Initialize resources (connections, clients, sessions)
2. **Use** — Provide the initialized resource to the test via `await use(resource)`
3. **Teardown** — Clean up resources after the test completes (runs regardless of test outcome)

```typescript
export const myFixture = {
  myClient: async ({}, use: (client: MyClient) => Promise<void>) => {
    // 1. Setup
    const client = await MyClient.connect({ host: 'localhost' });

    // 2. Provide to test
    await use(client);

    // 3. Teardown (always runs)
    await client.disconnect();
  },
};
```

## Declaring Dependencies

Fixtures can depend on other fixtures by listing them as parameters. Playwright resolves the dependency graph automatically — dependent fixtures are initialized first.

```typescript
import type { DatabaseClient } from './database.fixture';

export const myFixture = {
  myClient: async (
    { databaseClient }: { databaseClient: DatabaseClient },
    use: (client: MyClient) => Promise<void>,
  ) => {
    // databaseClient is already initialized when this fixture runs
    const client = new MyClient(databaseClient);
    await use(client);
    await client.close();
  },
};
```

Dependencies are declared by name. The fixture system ensures:

- Dependencies are initialized before dependents
- Circular dependencies are detected and reported at startup
- Missing dependencies produce clear error messages

## Registering in the Fixture Registry

To make your fixture available in tests, add it to the fixture registry at `src/fixtures/index.ts`:

```typescript
// src/fixtures/index.ts
import { test as base } from '@playwright/test';
import { openApiFixture } from './openapi.fixture';
import { databaseFixture } from './database.fixture';
import { kafkaFixture } from './kafka.fixture';
import { redisFixture } from './redis.fixture';
import { mobilewrightFixture } from './mobilewright.fixture';
import { myCustomFixture } from './my-custom.fixture'; // Add your import

export const test = base.extend({
  ...openApiFixture,
  ...databaseFixture,
  ...kafkaFixture,
  ...redisFixture,
  ...mobilewrightFixture,
  ...myCustomFixture, // Spread your fixture definitions
});
```

After registration, your fixture is available as a named parameter in any test:

```typescript
import { test, expect } from '../src/fixtures';

test('uses my custom fixture', async ({ myClient }) => {
  // myClient is ready to use
});
```

## Loading Configuration

Use the `ConfigLoader` to read environment-based configuration for your fixture:

```typescript
import { ConfigLoader } from '../config/loader';
import { FixtureInitError } from '../errors';

export const myFixture = {
  myClient: async ({}, use: (client: MyClient) => Promise<void>) => {
    const loader = new ConfigLoader();
    const config = loader.load();

    // Access your custom config section (add it to environments.json)
    const myConfig = (config as any).myService;
    if (!myConfig) {
      throw new FixtureInitError('myClient', 'connect', {
        reason: 'myService configuration is missing from environments.json or environment variables.',
      });
    }

    const client = await MyClient.connect(myConfig);
    await use(client);
    await client.disconnect();
  },
};
```

## Error Handling

Use the framework's error classes for consistent error reporting:

```typescript
import { FixtureInitError, FixtureOperationError } from '../errors';

// Connection/setup failures
throw new FixtureInitError('myClient', 'connect', {
  host: config.host,
  port: config.port,
  reason: 'Connection refused',
});

// Runtime operation failures
throw new FixtureOperationError('myClient', 'query', {
  operation: 'fetchData',
  reason: error.message,
});
```

## Complete Working Example

Here's a full example of a custom HTTP client fixture with configuration, setup, teardown, and error handling:

```typescript
// src/fixtures/http-client.fixture.ts
import { ConfigLoader } from '../config/loader';
import { FixtureInitError } from '../errors';

/**
 * Client interface exposed to tests.
 */
export interface HttpClient {
  get<T = unknown>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>>;
  post<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>>;
  put<T = unknown>(path: string, body: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>>;
  delete<T = unknown>(path: string, headers?: Record<string, string>): Promise<HttpResponse<T>>;
}

export interface HttpResponse<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

interface HttpClientConfig {
  baseUrl: string;
  timeout?: number;
  defaultHeaders?: Record<string, string>;
}

/**
 * Creates an HTTP client with the given configuration.
 */
async function createHttpClient(config: HttpClientConfig): Promise<HttpClient> {
  const { baseUrl, timeout = 10000, defaultHeaders = {} } = config;

  async function request<T>(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<HttpResponse<T>> {
    const url = `${baseUrl}${path}`;
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...defaultHeaders, ...headers },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeout),
    });

    const data = await response.json() as T;
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

    return { status: response.status, data, headers: responseHeaders };
  }

  return {
    get: <T>(path: string, headers?: Record<string, string>) => request<T>('GET', path, undefined, headers),
    post: <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>('POST', path, body, headers),
    put: <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>('PUT', path, body, headers),
    delete: <T>(path: string, headers?: Record<string, string>) => request<T>('DELETE', path, undefined, headers),
  };
}

/**
 * Fixture definition — follows the setup / use / teardown pattern.
 */
export const httpClientFixture = {
  httpClient: async (
    {}: Record<string, never>,
    use: (client: HttpClient) => Promise<void>,
  ) => {
    // --- Setup ---
    const loader = new ConfigLoader();
    const config = loader.load();

    const httpConfig = (config as any).httpClient as HttpClientConfig | undefined;
    if (!httpConfig?.baseUrl) {
      throw new FixtureInitError('httpClient', 'init', {
        reason: 'httpClient.baseUrl is required. Add httpClient config to environments.json or set PW_HTTP_BASE_URL.',
      });
    }

    const client = await createHttpClient(httpConfig);

    // --- Provide to test ---
    await use(client);

    // --- Teardown ---
    // No persistent connections to close (fetch is stateless),
    // but this is where you'd release connection pools, close sockets, etc.
  },
};
```

### Using the fixture in a test

```typescript
import { test, expect } from '../src/fixtures';

test('GET /api/health returns 200', async ({ httpClient }) => {
  const response = await httpClient.get('/api/health');
  expect(response.status).toBe(200);
  expect(response.data).toHaveProperty('status', 'ok');
});

test('POST /api/users creates a user', async ({ httpClient }) => {
  const response = await httpClient.post('/api/users', {
    name: 'Alice',
    email: 'alice@example.com',
  });

  expect(response.status).toBe(201);
  expect(response.data).toHaveProperty('id');
});
```

### Adding configuration to environments.json

```json
{
  "environments": {
    "local": {
      "httpClient": {
        "baseUrl": "http://localhost:8080",
        "timeout": 5000,
        "defaultHeaders": {
          "X-Test-Run": "true"
        }
      }
    }
  }
}
```

## Summary

| Step | What to do |
|---|---|
| 1. Define the fixture | Create a file in `src/fixtures/` with setup, use, teardown |
| 2. Declare dependencies | List other fixture names as parameters |
| 3. Register | Import and spread into `src/fixtures/index.ts` |
| 4. Use in tests | Request by name in your test function signature |
| 5. Handle errors | Use `FixtureInitError` / `FixtureOperationError` for clear diagnostics |
