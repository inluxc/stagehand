# Database Fixture

The `databaseClient` fixture provides a multi-dialect database client supporting PostgreSQL, MySQL, MSSQL, and SQLite. It exposes a unified interface with `query()` and `execute()` methods, handling connection pooling and lifecycle automatically.

---

## What It Does

- Connects to PostgreSQL, MySQL, MSSQL, or SQLite databases
- Manages connection pools with configurable timeouts
- Verifies connectivity on setup with a ping query
- Provides parameterized query execution (prevents SQL injection)
- Automatically normalizes parameter placeholders across dialects
- Drains connection pools on teardown

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_DB_TYPE` | Yes | Database engine: `postgresql`, `mysql`, `mssql`, or `sqlite` |
| `PW_DB_HOST` | No | Database server host (not needed for SQLite) |
| `PW_DB_PORT` | No | Database server port |
| `PW_DB_NAME` | Yes | Database name (or file path for SQLite) |
| `PW_DB_USERNAME` | No | Database username |
| `PW_DB_PASSWORD` | No | Database password |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "database": {
        "type": "postgresql",
        "host": "localhost",
        "port": 5432,
        "database": "myapp_test",
        "username": "postgres",
        "password": "postgres",
        "connectionTimeout": 10000,
        "queryTimeout": 30000
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
        database: {
          type: 'postgresql',
          host: 'localhost',
          port: 5432,
          database: 'myapp_test',
          username: 'postgres',
          password: 'postgres',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `type` | `'postgresql' \| 'mysql' \| 'mssql' \| 'sqlite'` | — | Database engine type |
| `host` | `string` | — | Database server host |
| `port` | `number` | — | Database server port |
| `database` | `string` | — | Database name (or file path for SQLite) |
| `username` | `string` | — | Database username |
| `password` | `string` | — | Database password |
| `connectionTimeout` | `number` | `10000` | Connection timeout in ms |
| `queryTimeout` | `number` | `30000` | Query execution timeout in ms |
| `encrypt` | `boolean` | `true` | Encrypt connection (MSSQL only) |
| `trustServerCertificate` | `boolean` | `false` | Trust server certificate (MSSQL, useful for local dev) |

---

## Usage

### Querying Data

```typescript
import { test, expect } from '@inluxc/stagehand';

test('query users', async ({ databaseClient }) => {
  const rows = await databaseClient.query<{ id: number; name: string }>(
    'SELECT id, name FROM users WHERE active = $1',
    [true]
  );

  expect(rows.length).toBeGreaterThan(0);
  expect(rows[0]).toHaveProperty('name');
});
```

### Executing Statements (INSERT/UPDATE/DELETE)

```typescript
test('insert a record', async ({ databaseClient }) => {
  const result = await databaseClient.execute(
    'INSERT INTO users (name, email) VALUES ($1, $2)',
    ['Bob', 'bob@example.com']
  );

  expect(result.affectedRows).toBe(1);
});
```

### Parameter Placeholders

Always use PostgreSQL-style positional parameters (`$1`, `$2`, ...) regardless of the underlying database. The fixture automatically normalizes them:

- **PostgreSQL** — Uses `$1`, `$2` natively
- **MySQL** — Converts to `?` placeholders
- **MSSQL** — Converts to `@p1`, `@p2` named parameters
- **SQLite** — Converts to `?` placeholders

---

## Lifecycle

1. **Setup** — Creates a connection pool, verifies connectivity with a ping query
2. **Use** — Provides the `databaseClient` to the test
3. **Teardown** — Drains the pool and closes all connections

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | Connection failure (includes host, port, timeout) |
| `FixtureOperationError` | Query execution failure (includes SQL statement) |

```typescript
// Connection failure example:
// FixtureInitError: database/connect — host: localhost, port: 5432, reason: Connection refused

// Query failure example:
// FixtureOperationError: database/query — sql: SELECT ..., reason: relation "users" does not exist
```

---

## Supported Drivers

| Type | Library | Notes |
|------|---------|-------|
| `postgresql` | `pg` | Connection pooling via `pg.Pool` |
| `mysql` | `mysql2/promise` | Connection pooling with `waitForConnections` |
| `mssql` | `mssql` | Connection pooling with encrypt/trust options |
| `sqlite` | `better-sqlite3` | Synchronous driver, file-based or in-memory |
