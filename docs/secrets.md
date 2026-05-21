# Secrets Management

The secrets module provides a unified interface for retrieving sensitive values (credentials, API keys, tokens) from external backends and injecting them into the framework configuration at runtime. This keeps secrets out of source control and `.env` files in shared environments.

---

## What It Does

- Resolves secrets from multiple provider backends (AWS, Vault, GitLab, Azure, env-file)
- Injects fetched secrets into `FrameworkConfig` via dot-notation key mappings
- Caches all fetched secrets for the entire test runner invocation
- Enforces configurable fetch timeouts per provider
- Falls back to local `.env` file provider when no external backend is configured

---

## Architecture

```
SecretsManager (orchestrator)
├── Registers one or more SecretsProvider implementations
├── Resolves which provider to use from config
├── Fetches secrets with timeout enforcement
├── Caches results (singleton per test run)
└── Injects values into FrameworkConfig via keyMappings

Providers:
├── aws          — AWS Secrets Manager
├── vault        — HashiCorp Vault (KV v1/v2)
├── gitlab       — GitLab CI/CD Variables API
├── azure        — Azure Key Vault
└── env-file     — Local .env file fallback
```

---

## Configuration

### `environments.json`

```json
{
  "environments": {
    "dev": {
      "database": {
        "type": "postgresql",
        "host": "db.example.com",
        "port": 5432,
        "database": "myapp",
        "username": "",
        "password": ""
      },
      "secrets": {
        "provider": "aws",
        "options": {
          "region": "us-east-1",
          "secretPrefix": "myapp/dev/"
        },
        "keyMappings": {
          "db-username": "database.username",
          "db-password": "database.password",
          "api-key": "openapi.baseUrl"
        },
        "timeout": 10000
      }
    }
  }
}
```

### `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'integration',
      testMatch: '**/integration/**/*.spec.ts',
      use: {
        secrets: {
          provider: 'vault',
          options: {
            url: 'https://vault.example.com',
            mountPath: 'secret/data/playwright',
          },
          keyMappings: {
            'db-password': 'database.password',
            'redis-password': 'redis.password',
          },
          timeout: 15000,
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | `string` | — | Provider backend name: `aws`, `vault`, `gitlab`, `azure`, `env-file` |
| `options` | `object` | — | Provider-specific options (see each provider below) |
| `keyMappings` | `Record<string, string>` | — | Maps secret key → config field path (dot-notation) |
| `timeout` | `number` | `10000` | Fetch timeout in ms for all secret operations |

---

## Key Mappings

Key mappings define which secrets to fetch and where to inject them in the framework config. The key is the secret identifier in the backend, and the value is the dot-notation path in `FrameworkConfig`.

```json
{
  "keyMappings": {
    "db-password": "database.password",
    "db-username": "database.username",
    "kafka-sasl-password": "kafka.sasl.password",
    "redis-auth": "redis.password",
    "api-token": "graphql.authToken"
  }
}
```

The target field must exist in the config object. If the path is invalid, a `SecretsError` with operation `mapping` is thrown.

---

## Providers

### AWS Secrets Manager

Retrieves secrets from AWS Secrets Manager using the AWS SDK.

#### Prerequisites

```bash
npm install @aws-sdk/client-secrets-manager
```

#### Authentication

Uses the standard AWS credential chain (environment variables, shared credentials file, IAM role, etc.):

| Method | Variables |
|--------|-----------|
| Environment | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN` |
| Shared credentials | `~/.aws/credentials` with profile |
| IAM Role | Automatic on EC2/ECS/Lambda |
| SSO | `aws sso login` then use profile |

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `region` | `string` | Yes | AWS region (e.g., `us-east-1`, `eu-west-1`) |
| `secretPrefix` | `string` | No | Prefix prepended to all secret keys when fetching |

#### Configuration Example

```json
{
  "secrets": {
    "provider": "aws",
    "options": {
      "region": "us-east-1",
      "secretPrefix": "myapp/prod/"
    },
    "keyMappings": {
      "db-credentials": "database.password"
    }
  }
}
```

With `secretPrefix: "myapp/prod/"`, a key mapping of `"db-credentials"` fetches the secret named `myapp/prod/db-credentials` from AWS.

#### Notes

- Only string secrets are supported (binary secrets throw an error)
- Secrets are fetched individually (no native batch API for arbitrary names)
- The SDK is loaded dynamically — the provider throws a clear error if the package is missing

---

### HashiCorp Vault

Retrieves secrets from HashiCorp Vault via the HTTP API. Supports KV v1 and KV v2 secrets engines.

#### Prerequisites

A running Vault instance accessible over HTTPS. No additional npm packages required (uses native `fetch`).

#### Authentication

| Method | Configuration | Environment Variables |
|--------|--------------|---------------------|
| Token | `options.token` | `VAULT_TOKEN` |
| AppRole | `options.roleId` + `options.secretId` | `VAULT_ROLE_ID` + `VAULT_SECRET_ID` |

AppRole is recommended for CI/CD pipelines. Token-based auth is suitable for local development.

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `url` | `string` | Yes | Vault server URL (e.g., `https://vault.example.com`) |
| `mountPath` | `string` | Yes | KV engine mount path (e.g., `secret/data/playwright`) |
| `token` | `string` | No | Vault token. Falls back to `VAULT_TOKEN` env var |
| `roleId` | `string` | No | AppRole role_id. Falls back to `VAULT_ROLE_ID` env var |
| `secretId` | `string` | No | AppRole secret_id. Falls back to `VAULT_SECRET_ID` env var |
| `namespace` | `string` | No | Vault Enterprise namespace. Falls back to `VAULT_NAMESPACE` env var |
| `kvVersion` | `1 \| 2` | No | KV secrets engine version (default: `2`) |

#### Configuration Example

```json
{
  "secrets": {
    "provider": "vault",
    "options": {
      "url": "https://vault.example.com",
      "mountPath": "secret/data/playwright",
      "namespace": "admin/team-qa",
      "kvVersion": 2
    },
    "keyMappings": {
      "db-password": "database.password",
      "redis-password": "redis.password"
    }
  }
}
```

#### Secret Resolution Logic

When fetching a secret by key, the provider looks for the value in this order:

1. A `value` field in the secret data
2. A field matching the key name
3. The first value in the data object

#### Notes

- Supports Vault Enterprise namespaces via the `X-Vault-Namespace` header
- AppRole authentication is performed lazily on first secret fetch
- The token is cached for the lifetime of the provider instance

---

### GitLab CI/CD Variables

Retrieves secrets from GitLab project CI/CD variables via the GitLab REST API.

#### Prerequisites

- A GitLab project with CI/CD variables configured
- A private token or `CI_JOB_TOKEN` (automatically available in GitLab CI pipelines)

#### Authentication

| Method | Configuration | Environment Variables |
|--------|--------------|---------------------|
| Private Token | `options.token` | — |
| Job Token | — | `CI_JOB_TOKEN` (auto-set in GitLab CI) |

In GitLab CI pipelines, `CI_JOB_TOKEN` is automatically available and used as the fallback.

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `projectId` | `string` | Yes | GitLab project ID (numeric) or URL-encoded path |
| `apiUrl` | `string` | Yes | GitLab API base URL (e.g., `https://gitlab.com/api/v4`) |
| `token` | `string` | No | Private token. Falls back to `CI_JOB_TOKEN` env var |

#### Configuration Example

```json
{
  "secrets": {
    "provider": "gitlab",
    "options": {
      "projectId": "12345678",
      "apiUrl": "https://gitlab.com/api/v4",
      "token": ""
    },
    "keyMappings": {
      "DB_PASSWORD": "database.password",
      "REDIS_PASSWORD": "redis.password"
    }
  }
}
```

#### Notes

- Secret keys must match the exact CI/CD variable key name in GitLab
- Variables are fetched individually via the GitLab API
- Protected and masked variables are supported
- For self-hosted GitLab, update `apiUrl` to your instance URL

---

### Azure Key Vault

Retrieves secrets from Azure Key Vault using the Azure SDK with `DefaultAzureCredential`.

#### Prerequisites

```bash
npm install @azure/keyvault-secrets @azure/identity
```

#### Authentication

Uses `DefaultAzureCredential` from `@azure/identity`, which tries these methods in order:

| Method | Environment Variables |
|--------|---------------------|
| Environment | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| Managed Identity | Automatic on Azure VMs, App Service, Functions |
| Azure CLI | `az login` (local development) |
| Visual Studio Code | Azure Account extension |

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `vaultUrl` | `string` | Yes | Key Vault URL (e.g., `https://my-vault.vault.azure.net`) |

#### Configuration Example

```json
{
  "secrets": {
    "provider": "azure",
    "options": {
      "vaultUrl": "https://my-vault.vault.azure.net"
    },
    "keyMappings": {
      "db-password": "database.password",
      "api-key": "openapi.baseUrl"
    }
  }
}
```

#### Notes

- Only string secrets are supported (empty values throw an error)
- The SDK is loaded dynamically — the provider throws a clear error if packages are missing
- Secret names in Azure Key Vault use hyphens (not underscores): `my-secret-name`

---

### Env File (Local Fallback)

Reads secrets from local `.env.{environment}` files. This is the default provider when no external backend is configured. Intended for local development only.

#### Prerequisites

None — uses the built-in `EnvLoader`.

#### Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `projectRoot` | `string` | No | Directory containing `.env` files (default: `process.cwd()`) |
| `environment` | `string` | No | Environment name to load (default: `local`) |

#### Configuration Example

```json
{
  "secrets": {
    "provider": "env-file",
    "options": {
      "environment": "dev"
    },
    "keyMappings": {
      "PW_DB_PASSWORD": "database.password",
      "PW_REDIS_PASSWORD": "redis.password"
    }
  }
}
```

This reads from `.env.dev` and maps the specified keys into the framework config.

#### `.env.dev` Example

```env
PW_DB_PASSWORD=my-local-password
PW_REDIS_PASSWORD=redis-secret
PW_API_KEY=sk-test-12345
```

#### Notes

- The env file is loaded once and cached for the test run
- Keys must exist in the file — missing keys throw a `SecretsError`
- This provider is automatically used when no other provider is configured

---

## Programmatic Usage

You can use the `SecretsManager` directly in custom fixtures or setup scripts:

```typescript
import { SecretsManager, AwsSecretsProvider } from '@inluxc/stagehand';

const manager = new SecretsManager();

// Register a provider
manager.registerProvider(new AwsSecretsProvider({ region: 'us-east-1' }));

// Fetch a single secret
const password = await manager.getSecret('db-password', 'aws');

// Fetch multiple secrets
const secrets = await manager.getSecrets(
  ['db-password', 'api-key', 'redis-auth'],
  'aws',
  15000 // timeout in ms
);

// Resolve and inject into config
const resolvedConfig = await manager.resolve(frameworkConfig);
```

---

## Error Handling

All secrets errors use the `SecretsError` class with structured context:

| Operation | When |
|-----------|------|
| `resolve` | Provider not registered or not found |
| `fetch` | Secret retrieval failed (network, auth, missing key) |
| `timeout` | Fetch exceeded the configured timeout |
| `mapping` | Key mapping path is invalid (field doesn't exist in config) |

```typescript
// Provider not found:
// SecretsError: aws/resolve — reason: Provider "aws" is not registered

// Fetch failure:
// SecretsError: vault/fetch [db-password] — reason: Vault API returned 403: permission denied

// Timeout:
// SecretsError: aws/timeout [db-password] — timeoutMs: 10000

// Invalid mapping:
// SecretsError: aws/mapping [db-password] — invalidField: database.nonexistent, reason: Field "nonexistent" does not exist
```

---

## Provider Comparison

| Provider | Auth Method | Best For | Dependencies |
|----------|------------|----------|--------------|
| `aws` | IAM / env credentials | AWS-hosted infrastructure | `@aws-sdk/client-secrets-manager` |
| `vault` | Token / AppRole | Multi-cloud, on-prem | None (native `fetch`) |
| `gitlab` | Private token / Job token | GitLab CI/CD pipelines | None (native `fetch`) |
| `azure` | DefaultAzureCredential | Azure-hosted infrastructure | `@azure/keyvault-secrets`, `@azure/identity` |
| `env-file` | File system | Local development | None (built-in) |

---

## Recommended Setup by Environment

| Environment | Provider | Notes |
|-------------|----------|-------|
| Local | `env-file` | Use `.env.local` with dummy/dev credentials |
| CI/CD (GitLab) | `gitlab` | Leverages `CI_JOB_TOKEN` automatically |
| CI/CD (GitHub) | `env-file` or `vault` | Map GitHub secrets to env vars, or use Vault |
| Staging/Prod (AWS) | `aws` | Use IAM roles for zero-config auth |
| Staging/Prod (Azure) | `azure` | Use Managed Identity for zero-config auth |
| Multi-cloud | `vault` | Central secrets management across providers |

---

## Security Best Practices

1. **Never commit secrets** — Use `.gitignore` to exclude `.env.*` files (already configured in this template)
2. **Use key mappings** — Let the framework inject secrets rather than reading them in test code
3. **Prefer IAM/Managed Identity** — Avoid long-lived tokens when running in cloud environments
4. **Set timeouts** — Prevent test hangs if a secrets backend is unreachable
5. **Use secret prefixes** — Namespace secrets per application/environment (e.g., `myapp/prod/db-password`)
6. **Rotate regularly** — The caching layer means secrets are fetched once per test run, so rotations take effect on next run
7. **Limit scope** — Use protected/masked variables in GitLab, or scoped policies in Vault

---

## Custom Provider

You can implement the `SecretsProvider` interface to add support for any backend:

```typescript
import { SecretsProvider } from '@inluxc/stagehand';

export class MyCustomProvider implements SecretsProvider {
  readonly name = 'my-provider';

  async getSecret(key: string): Promise<string> {
    // Fetch from your backend
    const value = await myBackend.fetch(key);
    return value;
  }

  async getSecrets(keys: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    for (const key of keys) {
      results.set(key, await this.getSecret(key));
    }
    return results;
  }
}
```

Register it with the `SecretsManager`:

```typescript
import { SecretsManager } from '@inluxc/stagehand';
import { MyCustomProvider } from './my-custom-provider';

const manager = new SecretsManager();
manager.registerProvider(new MyCustomProvider());
```
