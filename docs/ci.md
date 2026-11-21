# Running Integration Tests in CI

Propmaster tests run against real services: a database, a broker or a cache started next to the tests for each run. Every CI system can do this. What changes between them is how services start and which hostname the tests use to reach them.

This page covers **GitHub Actions**, which Propmaster itself uses. Its workflow, [`.github/workflows/integration-tests.yml`](../.github/workflows/integration-tests.yml), is a working reference.

## Pick Your CI System

| CI system | How services run | Host the tests use | Guide |
|---|---|---|---|
| GitHub Actions | `services:` next to a container job | Service name (`postgres`) | This page |
| GitLab CI/CD | `services:` with an `alias` | The alias (`postgres`) | [GitLab CI/CD](./ci-gitlab) |
| Jenkins | Sidecar containers on a per-build Docker network | The network alias (`postgres`) | [Jenkins](./ci-jenkins) |
| Azure Pipelines | Service containers next to a container job | Service name (`postgres`) | [Azure Pipelines](./ci-azure-pipelines) |
| CircleCI | Extra images in the Docker executor | `localhost` | [CircleCI](./ci-circleci) |
| Bitbucket Pipelines | `definitions.services` | `localhost` | [Bitbucket Pipelines](./ci-bitbucket) |
| Anything else, or your laptop | `docker compose -f compose.test.yaml up --wait` | `localhost` | [Docker Compose](./ci-docker-compose) |
| Any system with Docker, no service setup | Started by the test run (`PW_<BACKEND>_CONTAINER=true`) | Set for you | [Testcontainers](./testcontainers) |

Whatever the system, the same rules apply:

- **Set `CI=true`.** The example specs call `test.skip(!process.env.CI, ...)` and skip themselves without it.
- **Wait until the service is ready, not just started.** Use a health check, or a wait loop when the system has none.
- **Point the fixtures at the service with `PW_*` variables.** They're the same everywhere; only the host changes.
- **Run one backend per job, in parallel.** A run then takes about as long as its slowest job.
- **Cache npm downloads** keyed on `package-lock.json`, and run browser tests in the `mcr.microsoft.com/playwright` image.
- **Publish JUnit results** with `--reporter=line,junit` and `PLAYWRIGHT_JUNIT_OUTPUT_FILE`, so the CI system shows each test.

The examples use the project names from Propmaster's own `playwright.config.ts`. In a project created by `propmaster init`, the [layout](./guide/project-layout) maps to jobs directly: `--project=api` needs no services, `--project=integration` gets the database, broker and cache services, and `--project='e2e-*'` runs in the Playwright image.

---

## What Propmaster's CI Runs

Every job starts at the same time, so a run takes about as long as its slowest job (around 1–1.5 minutes).

| Job | Playwright project | Service container | What it checks |
|---|---|---|---|
| `typecheck` | — | — | `tsc`, `lint:tests`, Playwright image tag matches `@playwright/test` |
| `property-tests` | `property-tests`, `unit-tests`, `otp` | — | Framework self-tests and the OTP fixture (needs no service) |
| `test-postgres` | `integration-database` | `postgres:15` | Database fixture on PostgreSQL |
| `test-mysql` | `integration-database` | `mysql:8.0` | Database fixture on MySQL |
| `test-mssql` | `integration-database` | `mcr.microsoft.com/mssql/server:2022-latest` | Database fixture on MSSQL |
| `test-sqlite` | `integration-database` | — (file on disk) | Database fixture on SQLite |
| `test-redis` | `integration-redis` | `redis:7` | Redis fixture |
| `test-mongodb` | `integration-mongodb` | `mongo:7` | MongoDB fixture |
| `test-neo4j` | `integration-neo4j` | `neo4j:5` | Neo4j fixture |
| `test-kafka` | `integration-kafka` | `apache/kafka:latest` (KRaft) | Kafka fixture |
| `test-rabbitmq` | `integration-amqp` | `rabbitmq:4` | RabbitMQ (AMQP) fixture |
| `test-inbox` | `integration-inbox` | `axllent/mailpit:latest` | Inbox fixture (email) |
| `test-mocks` | `integration-mocks` | `wiremock/wiremock:3.13.2` | Mock-server fixture (third-party APIs) |
| `test-openapi` | `openapi` | Prism mock server (started in a step) | OpenAPI fixture |
| `test-browser` | `browser-chromium`, `browser-firefox`, `browser-webkit` | — (runs in the Playwright image) | Browser tests |

GraphQL and Appium/GADS have no CI job here, because they need a server or device you provide. See [GraphQL against your own API](#graphql-against-your-own-api) for how to add one.

---

## The Pattern

Each integration job has the same four parts:

1. **A Node container**, so the job can reach the service by its name (`postgres`, `redis`, ...).
2. **A service container** with a health check. Steps start only after the service reports healthy.
3. **`PW_*` environment variables** pointing the fixture at the service. See each fixture's doc for the full list.
4. **One `npx playwright test --project=...` step**, plus report uploads when the job fails.

```yaml
test-redis:
  runs-on: ubuntu-latest
  container: node:24                    # job runs in a container → service is reachable as "redis"
  services:
    redis:
      image: redis:7
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 5s
        --health-timeout 30s
        --health-retries 5
  env:
    CI: true                            # the example specs skip themselves without CI
    PW_REDIS_HOST: redis                # the service name is the hostname
    PW_REDIS_PORT: "6379"
    PW_REDIS_KEY_PREFIX: "test:ci-${{ github.run_id }}:"
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/npm-install
    - run: npx playwright test --project=integration-redis
    - name: Upload HTML report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: html-report-redis
        path: playwright-report/
        retention-days: 7
```

> **Hostname rule:** when the job has `container:`, use the service name as the host. When the job runs directly on the runner (no `container:`), map a port with `ports: ["6379:6379"]` and use `localhost`.

### Shared install step

[`.github/actions/npm-install`](../.github/actions/npm-install/action.yml) caches `~/.npm` (keyed on `package-lock.json`) and runs `npm ci --prefer-offline`. Every job uses it. Pass `ignore-scripts: "true"` to skip native builds when a job doesn't need them:

```yaml
- uses: ./.github/actions/npm-install
  with:
    ignore-scripts: "true"
```

---

## Using This in Your Own Project

1. Copy `.github/actions/npm-install/` and the jobs you need from `integration-tests.yml` into your repository.
2. Change `--project=` to the project names in **your** `playwright.config.ts`, and give each project the fixture config it needs:

    ```typescript
    // playwright.config.ts
    {
        name: 'integration-orders',
        testMatch: '**/integration/orders/**/*.spec.ts',
        use: {
            database: config.database,
            kafka: config.kafka,
        },
    },
    ```

3. Add one service per backend the project uses. A job can have several services. A test that writes to PostgreSQL and checks a Kafka event needs both:

    ```yaml
    test-orders:
      runs-on: ubuntu-latest
      container: node:24
      services:
        postgres:
          image: postgres:15
          env:
            POSTGRES_DB: testdb
            POSTGRES_USER: testuser
            POSTGRES_PASSWORD: testpass
          options: >-
            --health-cmd "pg_isready -U testuser -d testdb"
            --health-interval 5s --health-timeout 30s --health-retries 5
        kafka:
          image: apache/kafka:latest
          env:
            # same KRaft settings as the test-kafka job
            KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
            # ...
      env:
        CI: true
        PW_DB_TYPE: postgresql
        PW_DB_HOST: postgres
        PW_DB_PORT: "5432"
        PW_DB_NAME: testdb
        PW_DB_USERNAME: testuser
        PW_DB_PASSWORD: testpass
        PW_KAFKA_BROKERS: kafka:9092
      steps:
        - uses: actions/checkout@v4
        - uses: ./.github/actions/npm-install
        - run: npx playwright test --project=integration-orders
    ```

4. Keep real credentials out of the workflow file. Throwaway service passwords like `testpass` are fine inline. For shared or staging systems, use GitHub secrets or a [secrets provider](secrets.md):

    ```yaml
    env:
      PW_ENVIRONMENT: stg
      PW_DB_PASSWORD: ${{ secrets.STG_DB_PASSWORD }}
    ```

---

## Examples by Backend

Only the parts that differ from [the pattern](#the-pattern) are shown.

### PostgreSQL, MySQL, MSSQL

```yaml
services:
  postgres:
    image: postgres:15
    env: { POSTGRES_DB: testdb, POSTGRES_USER: testuser, POSTGRES_PASSWORD: testpass }
    options: --health-cmd "pg_isready -U testuser -d testdb" --health-interval 5s --health-retries 5
env:
  PW_DB_TYPE: postgresql      # mysql | mssql
  PW_DB_HOST: postgres
  PW_DB_PORT: "5432"          # 3306 | 1433
  PW_DB_NAME: testdb
  PW_DB_USERNAME: testuser
  PW_DB_PASSWORD: testpass
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/npm-install
  - run: node .github/scripts/create-test-schema.js     # create the tables your tests expect
  - run: npx playwright test --project=integration-database
```

- **MySQL:** `mysql:8.0` with `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD`; health check `mysqladmin ping -h 127.0.0.1`.
- **MSSQL:** `mcr.microsoft.com/mssql/server:2022-latest` with `ACCEPT_EULA: "Y"` and `MSSQL_SA_PASSWORD`. Also set `PW_DB_ENCRYPT: "false"` and `PW_DB_TRUST_SERVER_CERTIFICATE: "true"`. It is slow to start, so give the health check more retries.

### SQLite

No service. The database is a file the job creates:

```yaml
env:
  PW_DB_TYPE: sqlite
  PW_DB_NAME: ${{ github.workspace }}/tmp/test.db
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/npm-install      # builds better-sqlite3; don't pass ignore-scripts
  - run: mkdir -p tmp && node .github/scripts/create-test-schema.js
  - run: npx playwright test --project=integration-database
```

### MongoDB

```yaml
services:
  mongodb:
    image: mongo:7
    options: >-
      --health-cmd "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'"
      --health-interval 5s --health-timeout 30s --health-retries 10
env:
  PW_MONGODB_HOST: mongodb
  PW_MONGODB_PORT: "27017"
  PW_MONGODB_DATABASE: testdb
```

### Neo4j

```yaml
services:
  neo4j:
    image: neo4j:5
    env: { NEO4J_AUTH: neo4j/testpassword }
    options: >-
      --health-cmd "cypher-shell -u neo4j -p testpassword 'RETURN 1'"
      --health-interval 10s --health-timeout 60s --health-retries 10
env:
  PW_NEO4J_URI: bolt://neo4j:7687
  PW_NEO4J_USERNAME: neo4j
  PW_NEO4J_PASSWORD: testpassword
```

### Kafka

A single-node KRaft broker. The advertised listener must use the service name:

```yaml
services:
  kafka:
    image: apache/kafka:latest
    env:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_NUM_PARTITIONS: 1
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    options: >-
      --health-cmd "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092"
      --health-interval 10s --health-timeout 60s --health-retries 6
env:
  PW_KAFKA_BROKERS: kafka:9092
```

### RabbitMQ

Create a user: the image's `guest` user can only connect from inside the container. `check_port_connectivity` waits for the AMQP port, which opens after `rabbitmq-diagnostics ping` already passes:

```yaml
services:
  rabbitmq:
    image: rabbitmq:4
    env:
      RABBITMQ_DEFAULT_USER: testuser
      RABBITMQ_DEFAULT_PASS: testpass
    options: >-
      --health-cmd "rabbitmq-diagnostics -q check_port_connectivity"
      --health-interval 5s --health-timeout 30s --health-retries 20
env:
  PW_AMQP_URL: amqp://testuser:testpass@rabbitmq:5672
```

### OpenAPI against a mock server

Prism is a pinned devDependency, so `npx prism` runs the local copy without downloading anything:

```yaml
env:
  PW_OPENAPI_SPEC_PATH: ./openapi.yaml       # or a URL
  PW_OPENAPI_BASE_URL: http://localhost:4010
steps:
  - uses: actions/checkout@v4
  - uses: ./.github/actions/npm-install
  - name: Start Prism mock server
    run: npx prism mock ./openapi.yaml --port 4010 --host 0.0.0.0 --errors false &
  - name: Wait for mock server
    run: |
      for i in $(seq 1 60); do
        bash -c 'echo > /dev/tcp/localhost/4010' 2>/dev/null && exit 0
        sleep 2
      done
      exit 1
  - run: npx playwright test --project=openapi
```

To test your real API instead of a mock, run it as a service container (see the next example) and point `PW_OPENAPI_BASE_URL` at it.

### GraphQL against your own API

Propmaster's CI has no GraphQL job because there is no public server to test. In your project, run your API as a service container next to its database:

```yaml
services:
  api:
    image: ghcr.io/your-org/your-api:latest     # your application image
    env:
      DATABASE_URL: postgres://testuser:testpass@postgres:5432/testdb
    options: --health-cmd "curl -fs http://localhost:4000/health" --health-interval 5s --health-retries 10
  postgres:
    image: postgres:15
    # ...
env:
  PW_GRAPHQL_ENDPOINT: http://api:4000/graphql
  PW_GRAPHQL_AUTH_TOKEN: ${{ secrets.GRAPHQL_TEST_TOKEN }}
```

A private image needs `credentials:` on the service (for GHCR: `username: ${{ github.actor }}`, `password: ${{ secrets.GITHUB_TOKEN }}`).

### OTP

The OTP fixture needs no service, so add its project to a job that already runs tests. Propmaster runs it in `property-tests`:

```yaml
- run: npx playwright test --project=property-tests --project=unit-tests --project=otp
```

The example specs generate their own secrets. If your tests use a fixed secret (for a test account in your app), pass it from a GitHub secret:

```yaml
env:
  PW_OTP_SECRET: ${{ secrets.OTP_TEST_SECRET }}
```

### Browser tests

Run the job in the official Playwright image. It ships the browsers and their system libraries, so there is no `playwright install --with-deps` step. That step downloads ~140 MB from apt and once took 14 minutes on a slow mirror.

```yaml
test-browser:
  runs-on: ubuntu-latest
  container:
    image: mcr.microsoft.com/playwright:v1.65.1-noble   # must match @playwright/test
    options: --user 1001                                # the runner's workspace owner
  env:
    CI: true
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/npm-install
      with:
        ignore-scripts: "true"    # only if the project installs better-sqlite3: this image can't compile it
    - run: npx playwright test --project=browser-chromium --project=browser-firefox --project=browser-webkit
```

When you upgrade `@playwright/test`, update the image tag too. Propmaster's `typecheck` job fails if they drift apart.

---

## Keeping CI Fast

These are already in Propmaster's workflow. Keep them when you copy it:

| Practice | How |
|---|---|
| Run jobs in parallel | Don't chain jobs with `needs:` unless one really uses another's output |
| Cancel outdated PR runs | `concurrency: { group: <workflow>-<PR or ref>, cancel-in-progress: <true on PRs> }` |
| Cache npm downloads | The `npm-install` composite action |
| Don't install browsers | Run browser jobs in `mcr.microsoft.com/playwright` |
| Pin tools as devDependencies | `npx <tool>` uses the cached local copy instead of downloading on every run |
| Upload reports only when needed | `if: failure()` on `upload-artifact` steps |
| Skip docs-only changes | `paths-ignore: [docs/**, README.md, LICENSE]` |

> **Required status checks:** if checks from this workflow are required on your default branch, a PR that only changes ignored paths never gets them and stays pending. Remove `paths-ignore` in that case.

---

## Running the Same Services Locally

[`compose.test.yaml`](../compose.test.yaml) starts every service with the same images and credentials CI uses, published on `localhost`:

```bash
docker compose -f compose.test.yaml up -d --wait postgres mongodb
```

```bash
CI=true PW_DB_TYPE=postgresql PW_DB_HOST=localhost PW_DB_PORT=5432 PW_DB_NAME=testdb PW_DB_USERNAME=testuser PW_DB_PASSWORD=testpass npx playwright test --project=integration-database
```

```bash
CI=true PW_MONGODB_HOST=localhost PW_MONGODB_DATABASE=testdb npx playwright test --project=integration-mongodb
```

See [Docker Compose](./ci-docker-compose) for the variables for every backend.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `ECONNREFUSED 127.0.0.1` in a container job | Use the service name as the host, not `localhost` |
| All tests show as skipped | The example specs call `test.skip(!process.env.CI, ...)`. Set `CI: true` in the job's `env` |
| Tests start before the service is ready | Add or tighten the service's `--health-cmd`; raise `--health-retries` for slow starters (MSSQL, Neo4j, Kafka) |
| `gyp ERR! not found: make` while installing | The job's Node has no prebuilt binary for a native module. Pass `ignore-scripts: "true"` if the job doesn't need it, or use `node:24` |
| Browser job fails after a Playwright upgrade | Update the `mcr.microsoft.com/playwright:v<version>-noble` tag to match `@playwright/test` |
| Kafka client connects, then times out | `KAFKA_ADVERTISED_LISTENERS` must use the service name (`kafka:9092`) |
