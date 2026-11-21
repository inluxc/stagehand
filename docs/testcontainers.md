# Testcontainers

Turn on `container` for a backend and Stagehand starts it in a throwaway Docker container **from the test run itself**, using [Testcontainers](https://node.testcontainers.org/). There's no `services:` block in CI and no `docker compose up` before running tests: the same command works on a laptop and on any CI agent that has Docker.

```bash
PW_DB_CONTAINER=true PW_KAFKA_CONTAINER=true npx playwright test --project=integration
```

Supported: **PostgreSQL, MySQL, MSSQL, Redis, MongoDB, Neo4j, Kafka, RabbitMQ, Mailpit** (the [inbox](./inbox-fixture) mail server) **and WireMock** (the [mock server](./mock-server-fixture)). SQLite needs no server.

## Setup

1. **Docker**, or any Docker-compatible runtime (Docker Desktop, Colima, Podman with its Docker socket, Rancher Desktop). Testcontainers finds it the same way the `docker` CLI does, including `DOCKER_HOST`.
2. **The `testcontainers` package**, an optional peer dependency like the drivers:

    ```bash
    npm install --save-dev testcontainers
    ```

3. **Turn it on per backend**, with an environment variable or in config:

    ```bash
    PW_DB_CONTAINER=true          # databaseClient (PostgreSQL, MySQL or MSSQL: PW_DB_TYPE picks)
    PW_REDIS_CONTAINER=true       # redisClient
    PW_MONGODB_CONTAINER=true     # mongoDbClient
    PW_NEO4J_CONTAINER=true       # neo4jClient
    PW_KAFKA_CONTAINER=true       # kafkaClient
    PW_AMQP_CONTAINER=true        # amqpClient (RabbitMQ)
    PW_INBOX_CONTAINER=true       # inboxClient (Mailpit; inboxClient.smtp has its SMTP host and port)
    PW_MOCK_CONTAINER=true        # mockServer (WireMock; mockServer.url is its address)
    ```

    A value other than `true`/`false` is used as the image, e.g. `PW_DB_CONTAINER=postgres:16-alpine`.

    ```jsonc
    // environments.json
    {
        "environments": {
            "local": {
                "database": { "type": "postgresql", "database": "app", "container": { "initScripts": ["db/schema.sql"] } },
                "redis": { "host": "", "port": 6379, "container": true },
                "kafka": { "brokers": [], "container": { "image": "apache/kafka:3.9.0" } }
            }
        }
    }
    ```

When `container` is on, `host`, `port`, `uri` and `brokers` are ignored: the fixture connects to the container. Everything else in the config still applies.

## How it works

- **One container per backend per worker.** A container starts the first time a test in a Playwright worker uses the fixture. The worker's later tests share it, and it stops when the worker exits. A test that doesn't use a fixture never starts its container.
- **Ready means healthy.** Each container uses the same image and health check as Stagehand's CI and [`compose.test.yaml`](./ci-docker-compose), so tests start only once the service accepts connections. For databases, that's after the init scripts have run.
- **Random ports.** Containers get free host ports, so parallel workers, parallel CI jobs and anything else on your machine don't collide.
- **Nothing left behind.** Containers are removed when the worker exits. If the process crashes, Testcontainers' cleanup container (Ryuk) removes them.

With 4 workers, a backend runs in 4 containers, one per worker, so tests in different workers don't share data. Lower `workers` in a project's `projects.ts` if a heavy image (MSSQL, Neo4j) strains the machine.

## Options

`container` takes `true`, or an object:

| Option | Default | What it does |
|---|---|---|
| `image` | See the table below | Image to run |
| `initScripts` | none | SQL files run once after the database starts, in order (PostgreSQL, MySQL, MSSQL). Paths are relative to the working directory |
| `startupTimeout` | `60` (`120` for MSSQL and Neo4j) | Seconds to wait for the health check |
| `reuse` | `false` | Keep the container running between runs and reuse it (Testcontainers' reuse mode; also set `TESTCONTAINERS_REUSE_ENABLE=true`). Not available for Kafka |

| Backend | Default image | Credentials used |
|---|---|---|
| PostgreSQL | `postgres:15` | The config's `database`/`username`/`password`, or `testdb`/`testuser`/`testpass` |
| MySQL | `mysql:8.0` | Same as PostgreSQL; `username: root` sets the root password instead |
| MSSQL | `mcr.microsoft.com/mssql/server:2022-latest` | `sa` with the config's password (it must meet SQL Server's policy), or `TestPass123!`. A non-`master` database is created for you |
| Redis | `redis:7` | The config's `password`, if set |
| MongoDB | `mongo:7` | A root user when the config sets `username`; otherwise no auth |
| Neo4j | `neo4j:5` | `neo4j` with the config's password (8+ characters), or `testpassword` |
| Kafka | `apache/kafka:latest` | Single KRaft broker, no auth |
| RabbitMQ | `rabbitmq:4` | The config's `username`/`password`/`vhost`, or `testuser`/`testpass` on `/` |
| WireMock | `wiremock/wiremock:3.13.2` | No auth; stubs and admin API on one port, `mockServer.url` |
| Mailpit | `axllent/mailpit:latest` | No auth; SMTP on a second mapped port, exposed as `inboxClient.smtp` |

### Schema and seed data

Databases start empty. Give them a schema with `initScripts`, or with `PW_DB_CONTAINER_INIT` (comma-separated) when using variables:

```bash
PW_DB_TYPE=postgresql PW_DB_CONTAINER=true PW_DB_CONTAINER_INIT=db/schema.sql,db/seed.sql npx playwright test
```

PostgreSQL and MySQL run the scripts with their image's `/docker-entrypoint-initdb.d`. MSSQL runs them with `sqlcmd` against the configured database.

## In CI

No `services:` block, and no container job: run on a VM runner that has Docker, which GitHub's `ubuntu-latest` does.

```yaml
test-integration:
  runs-on: ubuntu-latest
  env:
    CI: true
    PW_DB_TYPE: postgresql
    PW_DB_CONTAINER: "true"
    PW_DB_CONTAINER_INIT: db/schema.sql
    PW_KAFKA_CONTAINER: "true"
    PW_REDIS_CONTAINER: "true"
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with: { node-version: "24" }
    - run: npm ci
    - run: npx playwright test --project=integration
```

The same works on GitLab (a Docker-in-Docker service, or a shell runner with Docker), Jenkins agents with Docker, Azure Pipelines and CircleCI `machine` executors, and Bitbucket with the `docker` service. See [Testcontainers' CI guides](https://node.testcontainers.org/) for each system's Docker settings.

Stagehand's own CI runs every example suite this way in the `test-testcontainers` job, next to the service-container jobs.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `MissingPackageError` for `testcontainers` | Run `npm install --save-dev testcontainers` |
| `... is Docker running?` | Testcontainers can't reach a Docker runtime. Start it, or set `DOCKER_HOST` |
| `... never became healthy` | The service exited at start-up, usually because of credentials. Run the image by hand with the same settings and read `docker logs` |
| `password is too weak for the SQL Server container` | An environment's config sets a simple password (like `test`). Set a stronger `PW_DB_PASSWORD`, or remove it to use the default |
| Kafka tests time out on a remote Docker host | The broker advertises the Docker host's address. Make sure the tests can reach it on the mapped port |
| Slow first run | Images are being pulled. Later runs reuse them; `reuse: true` also keeps containers running between runs |
