# OpenAPI Client Fixture

The `openApiClient` fixture provides a typed HTTP client generated from your OpenAPI specification. It uses [openapi-client-axios](https://github.com/openapistack/openapi-client-axios) under the hood, giving you auto-generated methods for every operation defined in your spec.

---

## What It Does

- Loads an OpenAPI spec from a local file or remote URL
- Initializes an Axios-based client with typed operation methods
- Supports base URL override for targeting different environments
- Handles initialization timeouts for remote specs
- Provides both the Axios client instance and the underlying API object

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_OPENAPI_SPEC_PATH` | Yes | Path to a local OpenAPI spec file or a remote URL |
| `PW_OPENAPI_BASE_URL` | No | Override base URL for API calls (takes precedence over spec server URLs) |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "openapi": {
        "specPath": "./specs/petstore.yaml",
        "baseUrl": "https://api.dev.example.com",
        "specTimeout": 10000,
        "initTimeout": 30000
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
      name: 'api',
      testMatch: '**/api/**/*.spec.ts',
      use: {
        openapi: {
          specPath: './specs/petstore.yaml',
          baseUrl: 'https://api.dev.example.com',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `specPath` | `string` | — | Local file path or remote URL to the OpenAPI specification |
| `baseUrl` | `string` | — | Override base URL (takes precedence over spec server URLs) |
| `specTimeout` | `number` | `10000` | Timeout in ms for remote spec retrieval |
| `initTimeout` | `number` | `30000` | Timeout in ms for client initialization |

---

## Usage

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

### Accessing the API Object

The `openApiClient` fixture provides two properties:

- **`client`** — An Axios instance extended with operation methods from the spec
- **`api`** — The underlying `OpenAPIClientAxios` instance (useful for advanced configuration)

```typescript
test('access api metadata', async ({ openApiClient }) => {
  const { client, api } = openApiClient;

  // Use the client for requests
  const res = await (client as any).getHealth();
  expect(res.status).toBe(200);
});
```

---

## Lifecycle

1. **Setup** — Loads the OpenAPI spec, initializes the client with operation methods
2. **Use** — Provides `{ client, api }` to the test
3. **Teardown** — Clears internal references

---

## Error Handling

The fixture throws `FixtureInitError` when:

- `specPath` is not configured
- The spec cannot be loaded (network error, invalid file)
- Client initialization times out

```typescript
// Example error context:
// FixtureInitError: openApiClient/init — specPath: ./missing.yaml, reason: ENOENT
```
