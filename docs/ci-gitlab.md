# GitLab CI/CD

GitLab runs [service containers](https://docs.gitlab.com/ci/services/) next to each job's container. The tests reach each service by its `alias`.

## How services work in GitLab

- **Hostname:** the service's `alias` (`postgres`), or a name derived from the image if you leave the alias out. Always set one.
- **Readiness:** the runner waits up to 30 seconds for the service's port to open, then starts the job anyway. Slow services (MSSQL, Neo4j, Kafka) need a wait loop in the job. The example below includes one.
- **Variables:** job-level `variables` are passed to the job **and** to its services. Put service-only settings under the service's own `variables:`.
- **`CI=true`:** GitLab sets it for every job, so the example specs run without extra setup.

## Complete `.gitlab-ci.yml`

All jobs are in one stage, so they run in parallel. The `--project` names are the ones in Propmaster's `playwright.config.ts`; use yours.

```yaml
stages: [test]

workflow:
  auto_cancel:
    on_new_commit: interruptible      # a new push cancels the older pipeline

default:
  image: node:24
  interruptible: true

variables:
  npm_config_cache: "$CI_PROJECT_DIR/.npm"
  PLAYWRIGHT_JUNIT_OUTPUT_FILE: results/junit.xml

# Shared setup: cached npm install, a wait helper, JUnit results in the MR widget.
.playwright:
  cache:
    key:
      files: [package-lock.json]
    paths: [.npm/]
  before_script:
    - |
      wait_for() {
        for i in $(seq 1 90); do
          node -e "require('net').connect(+process.argv[2], process.argv[1]).on('connect', () => process.exit(0)).on('error', () => process.exit(1))" "$1" "$2" && return 0
          sleep 2
        done
        echo "$1:$2 is not reachable"; return 1
      }
    - npm ci --prefer-offline --no-audit --no-fund
  artifacts:
    when: always
    expire_in: 7 days
    reports:
      junit: results/junit.xml
    paths:
      - playwright-report/
      - test-results/

checks:
  extends: .playwright
  artifacts: { when: on_failure, paths: [playwright-report/] }
  script:
    - npm run typecheck        # tsc --noEmit
    - npm run lint:tests       # propmaster check: test IDs, tags, steps, imports

postgres:
  extends: .playwright
  services:
    - name: postgres:15
      alias: postgres
      variables:
        POSTGRES_DB: testdb
        POSTGRES_USER: testuser
        POSTGRES_PASSWORD: testpass
  variables:
    PW_DB_TYPE: postgresql
    PW_DB_HOST: postgres
    PW_DB_PORT: "5432"
    PW_DB_NAME: testdb
    PW_DB_USERNAME: testuser
    PW_DB_PASSWORD: testpass
  script:
    - wait_for postgres 5432
    - node scripts/create-test-schema.js        # your schema setup
    - npx playwright test --project=integration-database --reporter=line,junit

redis:
  extends: .playwright
  services:
    - name: redis:7
      alias: redis
  variables:
    PW_REDIS_HOST: redis
    PW_REDIS_PORT: "6379"
    PW_REDIS_KEY_PREFIX: "test:ci-$CI_PIPELINE_ID:"
  script:
    - wait_for redis 6379
    - npx playwright test --project=integration-redis --reporter=line,junit

mongodb:
  extends: .playwright
  services:
    - name: mongo:7
      alias: mongodb
  variables:
    PW_MONGODB_HOST: mongodb
    PW_MONGODB_DATABASE: testdb
  script:
    - wait_for mongodb 27017
    - npx playwright test --project=integration-mongodb --reporter=line,junit

kafka:
  extends: .playwright
  services:
    - name: apache/kafka:latest
      alias: kafka
      variables:
        KAFKA_NODE_ID: "1"
        KAFKA_PROCESS_ROLES: broker,controller
        KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
        KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
        KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
        KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
        KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
        KAFKA_NUM_PARTITIONS: "1"
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: "1"
        CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
  variables:
    PW_KAFKA_BROKERS: kafka:9092
  script:
    - wait_for kafka 9092
    - npx playwright test --project=integration-kafka --reporter=line,junit

rabbitmq:
  extends: .playwright
  services:
    - name: rabbitmq:4
      alias: rabbitmq
      variables:
        RABBITMQ_DEFAULT_USER: testuser
        RABBITMQ_DEFAULT_PASS: testpass
  variables:
    PW_AMQP_URL: amqp://testuser:testpass@rabbitmq:5672
  script:
    - wait_for rabbitmq 5672
    - npx playwright test --project=integration-amqp --reporter=line,junit

browser:
  extends: .playwright
  image: mcr.microsoft.com/playwright:v1.65.1-noble   # must match @playwright/test
  before_script:
    # Skips native builds: only needed if the project installs better-sqlite3 (SQLite), which this image can't compile.
    - npm ci --prefer-offline --no-audit --no-fund --ignore-scripts
  script:
    - npx playwright test --project=browser-chromium --project=browser-firefox --project=browser-webkit --reporter=line,junit
```

The `browser` job replaces `before_script`, so it has no `wait_for`. It doesn't need one.

## Other backends

Add a job like `redis` above with these services and variables:

::: code-group

```yaml [MySQL]
services:
  - name: mysql:8.0
    alias: mysql
    variables:
      MYSQL_DATABASE: testdb
      MYSQL_USER: testuser
      MYSQL_PASSWORD: testpass
      MYSQL_ROOT_PASSWORD: rootpass
variables:
  PW_DB_TYPE: mysql
  PW_DB_HOST: mysql
  PW_DB_PORT: "3306"
  PW_DB_NAME: testdb
  PW_DB_USERNAME: testuser
  PW_DB_PASSWORD: testpass
script:
  - wait_for mysql 3306
  - npx playwright test --project=integration-database --reporter=line,junit
```

```yaml [MSSQL]
services:
  - name: mcr.microsoft.com/mssql/server:2022-latest
    alias: mssql
    variables:
      ACCEPT_EULA: "Y"
      MSSQL_SA_PASSWORD: "TestPass123!"
variables:
  PW_DB_TYPE: mssql
  PW_DB_HOST: mssql
  PW_DB_PORT: "1433"
  PW_DB_NAME: master
  PW_DB_USERNAME: sa
  PW_DB_PASSWORD: "TestPass123!"
  PW_DB_ENCRYPT: "false"
  PW_DB_TRUST_SERVER_CERTIFICATE: "true"
script:
  - wait_for mssql 1433
  - sleep 10        # the port opens a little before logins are accepted
  - npx playwright test --project=integration-database --reporter=line,junit
```

```yaml [Neo4j]
services:
  - name: neo4j:5
    alias: neo4j
    variables:
      NEO4J_AUTH: neo4j/testpassword
variables:
  PW_NEO4J_URI: bolt://neo4j:7687
  PW_NEO4J_USERNAME: neo4j
  PW_NEO4J_PASSWORD: testpassword
script:
  - wait_for neo4j 7687
  - npx playwright test --project=integration-neo4j --reporter=line,junit
```

:::

## Secrets and environments

Keep real credentials in **Settings → CI/CD → Variables**, marked *Masked* and *Protected*. They reach the job as environment variables with the same name, so a variable named `PW_DB_PASSWORD` needs no mapping. To target a shared environment instead of service containers:

```yaml
staging-api:
  extends: .playwright
  variables:
    PW_ENVIRONMENT: stg           # reads the "stg" block of environments.json
  script:
    - npx playwright test --project=openapi --reporter=line,junit
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
```

For Vault or OpenBao, Propmaster's [secrets providers](./secrets) read `VAULT_ADDR` / `BAO_ADDR` and a token, or log in with a GitLab CI JWT (`id_tokens:` plus the `jwt` auth method).

## Tips

- **Merge request widget:** `artifacts:reports:junit` shows new failures in the MR. `when: always` uploads results from failed runs too.
- **Docs-only changes:** to skip integration jobs, add `rules: [{ changes: { paths: ["src/**/*", "tests/**/*", "package-lock.json"] } }]` to `.playwright`.
- **Runner memory:** MSSQL needs about 2 GB. On small shared runners, give MSSQL its own job, as above.
- **`FF_NETWORK_PER_BUILD`:** only needed when services must reach each other, for example an API service that talks to the database service.
