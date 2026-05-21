# GraphQL Fixture

The `graphqlClient` fixture provides a typed GraphQL client for querying and mutating data via a GraphQL endpoint. It uses [graphql-request](https://github.com/jasonkuhrt/graphql-request) under the hood and supports custom headers, authentication tokens, and per-request options.

---

## What It Does

- Executes GraphQL queries and mutations against a configured endpoint
- Supports variables, custom headers, and operation names
- Provides `rawRequest()` for accessing full response including errors
- Allows dynamic auth token and header management
- HTTP-based — no persistent connections to manage

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_GRAPHQL_ENDPOINT` | Yes | GraphQL endpoint URL |
| `PW_GRAPHQL_AUTH_TOKEN` | No | Bearer token for authorization |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "graphql": {
        "endpoint": "https://api.dev.example.com/graphql",
        "authToken": "your-bearer-token",
        "headers": {
          "X-Custom-Header": "value"
        },
        "requestTimeout": 30000
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
      name: 'graphql',
      testMatch: '**/graphql/**/*.spec.ts',
      use: {
        graphql: {
          endpoint: 'https://api.dev.example.com/graphql',
          authToken: 'your-bearer-token',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `endpoint` | `string` | — | GraphQL endpoint URL |
| `headers` | `Record<string, string>` | — | Default headers for every request |
| `authToken` | `string` | — | Bearer token (sets `Authorization` header) |
| `requestTimeout` | `number` | `30000` | Request timeout in ms |

---

## Usage

### Executing a Query

```typescript
import { test, expect } from '@inluxc/stagehand';

test('fetch users', async ({ graphqlClient }) => {
  const data = await graphqlClient.query<{ users: Array<{ id: string; name: string }> }>(`
    query {
      users {
        id
        name
      }
    }
  `);

  expect(data.users).toBeInstanceOf(Array);
  expect(data.users[0]).toHaveProperty('name');
});
```

### Query with Variables

```typescript
test('fetch user by ID', async ({ graphqlClient }) => {
  const data = await graphqlClient.query<{ user: { id: string; name: string } }>(
    `query GetUser($id: ID!) {
      user(id: $id) {
        id
        name
      }
    }`,
    { id: '123' }
  );

  expect(data.user.name).toBeDefined();
});
```

### Executing a Mutation

```typescript
test('create a user', async ({ graphqlClient }) => {
  const data = await graphqlClient.mutate<{ createUser: { id: string } }>(
    `mutation CreateUser($input: CreateUserInput!) {
      createUser(input: $input) {
        id
      }
    }`,
    { input: { name: 'Alice', email: 'alice@example.com' } }
  );

  expect(data.createUser.id).toBeDefined();
});
```

### Raw Request (Full Response with Errors)

```typescript
test('handle GraphQL errors', async ({ graphqlClient }) => {
  const response = await graphqlClient.rawRequest<{ user: null }>(
    `{ user(id: "nonexistent") { id name } }`
  );

  if (response.errors) {
    expect(response.errors[0].message).toBeDefined();
  }
});
```

### Dynamic Auth Token

```typescript
test('authenticated request', async ({ graphqlClient }) => {
  // Set token dynamically (e.g., after a login flow)
  graphqlClient.setAuthToken('new-token-from-login');

  const data = await graphqlClient.query<{ me: { email: string } }>(`
    query { me { email } }
  `);

  expect(data.me.email).toBeDefined();
});
```

### Custom Headers Per Request

```typescript
test('request with custom headers', async ({ graphqlClient }) => {
  const data = await graphqlClient.query(
    `{ __schema { queryType { name } } }`,
    undefined,
    { headers: { 'X-Request-ID': 'test-123' } }
  );
});
```

### API Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `query` | `<T>(document, variables?, options?) => Promise<T>` | Execute a GraphQL query |
| `mutate` | `<T>(document, variables?, options?) => Promise<T>` | Execute a GraphQL mutation |
| `rawRequest` | `<T>(document, variables?, options?) => Promise<GraphQLResponse<T>>` | Execute and return full response with errors |
| `setHeader` | `(key: string, value: string) => void` | Set a default header for all requests |
| `setAuthToken` | `(token: string) => void` | Set the Authorization Bearer token |
| `getClient` | `() => GQLClient` | Get the underlying graphql-request client |

### Request Options

| Option | Type | Description |
|--------|------|-------------|
| `headers` | `Record<string, string>` | Additional headers for this request |
| `operationName` | `string` | Operation name (for multi-operation documents) |
| `signal` | `AbortSignal` | Signal for request cancellation |

---

## Lifecycle

1. **Setup** — Creates graphql-request client with configured endpoint and headers
2. **Use** — Provides `graphqlClient` to the test
3. **Teardown** — No cleanup needed (HTTP-based, stateless)

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | Endpoint not configured or client creation failure |
| `FixtureOperationError` | Query/mutation execution failure |

The `rawRequest()` method returns errors in the response object rather than throwing, making it useful for testing error scenarios.
