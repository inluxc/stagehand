# Bitbucket Pipelines

Bitbucket runs [service containers](https://support.atlassian.com/bitbucket-cloud/docs/databases-and-service-containers/) defined under `definitions.services` next to a step. They share the step's network, so the tests reach every service on `localhost`.

## How services work in Bitbucket

- **Hostname:** always `localhost`, with each service on its default port.
- **Readiness:** Bitbucket doesn't wait for services. Each step waits for the port first, as in the example below.
- **Memory:** each service gets 1 GB by default, out of 4 GB for the whole step. Raise a service's `memory:` and the step's `size:` for heavy services (MSSQL needs 2 GB).
- **`CI=true`:** Bitbucket sets it for every step.
- **Test reports:** Bitbucket picks up JUnit XML from `test-results/` folders on its own. Write Playwright's JUnit file there.

## Complete `bitbucket-pipelines.yml`

Steps in a `parallel` block run at the same time. The `--project` names are the ones in Propmaster's `playwright.config.ts`; use yours.

```yaml
image: node:24

definitions:
  caches:
    npm: ~/.npm

  services:
    postgres:
      image: postgres:15
      variables:
        POSTGRES_DB: testdb
        POSTGRES_USER: testuser
        POSTGRES_PASSWORD: testpass
    redis:
      image: redis:7
    mongodb:
      image: mongo:7
    kafka:
      image: apache/kafka:latest
      memory: 1536
      variables:
        KAFKA_NODE_ID: "1"
        KAFKA_PROCESS_ROLES: broker,controller
        KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
        KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
        KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
        KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
        KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
        KAFKA_NUM_PARTITIONS: "1"
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
        CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    rabbitmq:
      image: rabbitmq:4
      memory: 1024
      variables:
        RABBITMQ_DEFAULT_USER: testuser
        RABBITMQ_DEFAULT_PASS: testpass


pipelines:
  default:
    - parallel:
        fail-fast: true
        steps:
          - step:
              name: Checks
              caches: [npm]
              script:
                - &npm-ci npm ci --prefer-offline --no-audit --no-fund    # anchors: reused below
                - npm run typecheck
                - npm run lint:tests

          - step:
              name: PostgreSQL
              caches: [npm]
              services: [postgres]
              script:
                - &wait-for |
                  wait_for() {
                    for i in $(seq 1 90); do
                      node -e "require('net').connect(+process.argv[1], 'localhost').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" "$1" && return 0
                      sleep 2
                    done
                    echo "Port $1 is not reachable"; return 1
                  }
                - &junit export PLAYWRIGHT_JUNIT_OUTPUT_FILE=test-results/junit.xml
                - export PW_DB_TYPE=postgresql PW_DB_HOST=localhost PW_DB_PORT=5432 PW_DB_NAME=testdb
                - export PW_DB_USERNAME=testuser PW_DB_PASSWORD=testpass
                - *npm-ci
                - wait_for 5432
                - node scripts/create-test-schema.js        # your schema setup
                - npx playwright test --project=integration-database --reporter=line,junit
              artifacts: [playwright-report/**]

          - step:
              name: Redis
              caches: [npm]
              services: [redis]
              script:
                - *wait-for
                - *junit
                - export PW_REDIS_HOST=localhost PW_REDIS_PORT=6379 PW_REDIS_KEY_PREFIX="test:ci-$BITBUCKET_BUILD_NUMBER:"
                - *npm-ci
                - wait_for 6379
                - npx playwright test --project=integration-redis --reporter=line,junit
              artifacts: [playwright-report/**]

          - step:
              name: MongoDB
              caches: [npm]
              services: [mongodb]
              script:
                - *wait-for
                - *junit
                - export PW_MONGODB_HOST=localhost PW_MONGODB_DATABASE=testdb
                - *npm-ci
                - wait_for 27017
                - npx playwright test --project=integration-mongodb --reporter=line,junit
              artifacts: [playwright-report/**]

          - step:
              name: Kafka
              caches: [npm]
              services: [kafka]
              script:
                - *wait-for
                - *junit
                - export PW_KAFKA_BROKERS=localhost:9092
                - *npm-ci
                - wait_for 9092
                - npx playwright test --project=integration-kafka --reporter=line,junit
              artifacts: [playwright-report/**]

          - step:
              name: RabbitMQ
              caches: [npm]
              services: [rabbitmq]
              script:
                - *wait-for
                - *junit
                - export PW_AMQP_URL=amqp://testuser:testpass@localhost:5672
                - *npm-ci
                - wait_for 5672
                - npx playwright test --project=integration-amqp --reporter=line,junit
              artifacts: [playwright-report/**]

          - step:
              name: Browsers
              image: mcr.microsoft.com/playwright:v1.65.1-noble   # must match @playwright/test
              size: 2x
              caches: [npm]
              script:
                - *junit
                # Skips native builds: only needed if the project installs better-sqlite3 (SQLite), which this image can't compile.
                - npm ci --prefer-offline --no-audit --no-fund --ignore-scripts
                - npx playwright test --project=browser-chromium --project=browser-firefox --project=browser-webkit --reporter=line,junit
              artifacts: [playwright-report/**]
```

The anchors (`&npm-ci`, `&wait-for`, `&junit`) are defined where they're first used and reused with `*name`. `wait_for` and the `export` lines stay in effect for the rest of the step, because Bitbucket runs a step's script lines in one shell.

## Other backends

Add a service under `definitions.services` and a step like `Redis`:

::: code-group

```yaml [MySQL]
mysql:
  image: mysql:8.0
  variables:
    MYSQL_DATABASE: testdb
    MYSQL_USER: testuser
    MYSQL_PASSWORD: testpass
    MYSQL_ROOT_PASSWORD: rootpass
# step: export PW_DB_TYPE=mysql PW_DB_HOST=localhost PW_DB_PORT=3306 ...; wait_for 3306
```

```yaml [MSSQL]
mssql:
  image: mcr.microsoft.com/mssql/server:2022-latest
  memory: 2048
  variables:
    ACCEPT_EULA: "Y"
    MSSQL_SA_PASSWORD: "TestPass123!"
# step: size: 2x; export PW_DB_TYPE=mssql PW_DB_HOST=localhost PW_DB_PORT=1433 PW_DB_NAME=master
#       PW_DB_USERNAME=sa PW_DB_ENCRYPT=false PW_DB_TRUST_SERVER_CERTIFICATE=true; wait_for 1433; sleep 10
```

```yaml [Neo4j]
neo4j:
  image: neo4j:5
  memory: 1536
  variables:
    NEO4J_AUTH: neo4j/testpassword
# step: export PW_NEO4J_URI=bolt://localhost:7687 PW_NEO4J_USERNAME=neo4j PW_NEO4J_PASSWORD=testpassword; wait_for 7687
```

:::

## Secrets

Add real credentials under *Repository settings → Pipelines → Repository variables* (or *Deployments* for per-environment values), marked **Secured**. They reach the script as environment variables, so a variable named `PW_DB_PASSWORD` needs no mapping:

```yaml
branches:
  main:
    - step:
        name: Staging API
        deployment: staging          # uses the "staging" deployment variables
        caches: [npm]
        script:
          - export PW_ENVIRONMENT=stg
          - npm ci --prefer-offline --no-audit --no-fund
          - npx playwright test --project=openapi --reporter=line,junit
```

## Tips

- **Artifacts** are kept for 14 days and can be downloaded from the step.
- **Docs-only changes:** add `condition: { changesets: { includePaths: ["src/**", "tests/**", "package-lock.json"] } }` to a step to skip it otherwise.
- **The `npm` cache** is saved by successful builds and expires after a week, so the first build after that is slower.
