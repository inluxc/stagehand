# Configuration

Every fixture reads its settings from one merged configuration. You can set values in four places. When the same value is set in more than one, the higher one in this list wins:

1. The project's `use` block in `playwright.config.ts`
2. Environment variables with the `PW_` prefix
3. A `.env.{environment}` file
4. `environments.json`

## Choosing the environment

`PW_ENVIRONMENT` picks the environment block in `environments.json` and the `.env.{environment}` file to load:

```bash
PW_ENVIRONMENT=dev npx playwright test
```

Typical names are `local`, `dev`, `test`, `stg` and `prod`.

## `environments.json`

Keep non-secret settings for each environment in one file at the project root:

```json
{
    "environments": {
        "local": {
            "openapi": { "specPath": "./specs/api.yaml", "baseUrl": "http://localhost:3000" },
            "database": { "type": "postgresql", "host": "localhost", "port": 5432, "database": "testdb", "username": "test" },
            "kafka": { "brokers": ["localhost:9092"] },
            "redis": { "host": "localhost", "port": 6379 }
        },
        "stg": {
            "openapi": { "specPath": "https://stg.example.com/openapi.json", "baseUrl": "https://stg.example.com" },
            "database": { "type": "postgresql", "host": "db.stg.internal", "port": 5432, "database": "app", "username": "qa" }
        }
    }
}
```

Leave passwords and tokens out of this file. Use environment variables or a [secrets provider](../secrets).

## `.env` files

`.env.{environment}` files hold the same settings as `PW_*` variables, one per line. They are handy for local overrides you don't commit:

```bash
# .env.local
PW_DB_PASSWORD=test
PW_REDIS_KEY_PREFIX=test:alice:
```

## Environment variables

Every setting has a `PW_*` variable. These are the most common ones. Each fixture's guide lists all of its own.

| Variable | Purpose |
|---|---|
| `PW_ENVIRONMENT` | Active environment |
| `PW_OPENAPI_SPEC_PATH`, `PW_OPENAPI_BASE_URL` | OpenAPI spec (path or URL) and API base URL |
| `PW_OPENAPI_VALIDATE_RESPONSES`, `PW_OPENAPI_VALIDATE_REQUESTS` | `true` or `warn`: [contract checks](../openapi-fixture#contract-checks) against the spec |
| `PW_GRAPHQL_ENDPOINT`, `PW_GRAPHQL_AUTH_TOKEN` | GraphQL endpoint and bearer token |
| `PW_DB_TYPE` | `postgresql`, `mysql`, `mssql` or `sqlite` |
| `PW_DB_HOST`, `PW_DB_PORT`, `PW_DB_NAME`, `PW_DB_USERNAME`, `PW_DB_PASSWORD` | Database connection |
| `PW_MONGODB_URI` or `PW_MONGODB_HOST`, `PW_MONGODB_PORT`, `PW_MONGODB_DATABASE` | MongoDB connection |
| `PW_NEO4J_URI`, `PW_NEO4J_USERNAME`, `PW_NEO4J_PASSWORD` | Neo4j connection |
| `PW_KAFKA_BROKERS` | Comma-separated broker list |
| `PW_AMQP_URL` or `PW_AMQP_HOST`, `PW_AMQP_PORT`, `PW_AMQP_USERNAME`, `PW_AMQP_PASSWORD`, `PW_AMQP_VHOST` | RabbitMQ / AMQP broker |
| `PW_REDIS_HOST`, `PW_REDIS_PORT`, `PW_REDIS_PASSWORD`, `PW_REDIS_KEY_PREFIX` | Redis connection and key prefix |
| `PW_APPIUM_SERVER_URL`, `PW_APPIUM_PLATFORM`, `PW_APPIUM_UDID`, `PW_APPIUM_DEVICE_NAME` | Appium server and device |
| `PW_GADS_CLIENT_SECRET` | Turns on the GADS device-farm preset |
| `PW_OTP_SECRET`, `PW_OTP_DIGITS`, `PW_OTP_PERIOD` | OTP secret and token settings |

## Per-project settings in `playwright.config.ts`

Load the merged config once and hand each Playwright project only the fixture settings it needs. A value in a project's `use` block overrides every other source for that project:

```typescript
import { defineConfig } from '@playwright/test';
import { ConfigLoader, type ConfigOptions } from '@inluxc/propmaster';

const config = new ConfigLoader().load();

export default defineConfig<ConfigOptions>({
    projects: [
        {
            name: 'api',
            testMatch: '**/api/**/*.spec.ts',
            use: { openapi: config.openapi },
        },
        {
            name: 'integration',
            testMatch: '**/integration/**/*.spec.ts',
            use: { database: config.database, kafka: config.kafka, redis: config.redis },
        },
        {
            name: 'browser',
            testMatch: '**/browser/**/*.spec.ts',
            use: { baseURL: 'http://localhost:3000' },
        },
    ],
});
```

## Secrets

Set `secrets.provider` in `environments.json` to `aws`, `azure`, `vault`, `openbao`, `gitlab` or `env-file`, and map secret keys to config fields with `keyMappings`. See [Secrets Management](../secrets) for each provider's options.
