# CircleCI

In CircleCI's Docker executor, the first image is where steps run. Every [image after it](https://circleci.com/docs/databases/) is a service, and all of them share one network, so the tests reach every service on `localhost`.

## How services work in CircleCI

- **Hostname:** always `localhost`, with each service on its default port. Two services that use the same port can't share a job.
- **Readiness:** CircleCI doesn't wait for services. Each job waits for the port with the `wait-for` command below.
- **`CI=true`:** CircleCI sets it for every job.
- **Kafka:** advertise `localhost:9092`, since that's where the tests connect.

## Complete `.circleci/config.yml`

All jobs are in one workflow with no `requires`, so they run in parallel. The `--project` names are the ones in Propmaster's `playwright.config.ts`; use yours.

```yaml
version: 2.1

commands:
  wait-for:
    description: Wait until a TCP port accepts connections
    parameters:
      port: { type: integer }
    steps:
      - run:
          name: Wait for port << parameters.port >>
          command: |
            for i in $(seq 1 90); do
              node -e "require('net').connect(<< parameters.port >>, 'localhost').on('connect', () => process.exit(0)).on('error', () => process.exit(1))" && exit 0
              sleep 2
            done
            echo "Port << parameters.port >> is not reachable"; exit 1

  playwright:
    description: Cached npm install, setup steps, Playwright tests, and results
    parameters:
      projects: { type: string }
      npm-flags: { type: string, default: "" }
      setup: { type: steps, default: [] }
    steps:
      - checkout
      - restore_cache:
          keys:
            - npm-v1-{{ checksum "package-lock.json" }}
            - npm-v1-
      - run: npm ci --prefer-offline --no-audit --no-fund << parameters.npm-flags >>
      - save_cache:
          key: npm-v1-{{ checksum "package-lock.json" }}
          paths: [~/.npm]
      - steps: << parameters.setup >>
      - run:
          name: Playwright tests
          command: npx playwright test << parameters.projects >> --reporter=line,junit
          environment:
            PLAYWRIGHT_JUNIT_OUTPUT_FILE: results/junit.xml
      - store_test_results:
          path: results
      - store_artifacts:
          path: playwright-report

jobs:
  checks:
    docker:
      - image: node:24
    steps:
      - checkout
      - restore_cache:
          keys:
            - npm-v1-{{ checksum "package-lock.json" }}
            - npm-v1-
      - run: npm ci --prefer-offline --no-audit --no-fund
      - run: npm run typecheck
      - run: npm run lint:tests

  postgres:
    docker:
      - image: node:24
        environment:
          PW_DB_TYPE: postgresql
          PW_DB_HOST: localhost
          PW_DB_PORT: "5432"
          PW_DB_NAME: testdb
          PW_DB_USERNAME: testuser
          PW_DB_PASSWORD: testpass
      - image: postgres:15
        environment:
          POSTGRES_DB: testdb
          POSTGRES_USER: testuser
          POSTGRES_PASSWORD: testpass
    steps:
      - playwright:
          projects: --project=integration-database
          setup:
            - wait-for: { port: 5432 }
            - run: node scripts/create-test-schema.js     # your schema setup

  redis:
    docker:
      - image: node:24
        environment:
          PW_REDIS_HOST: localhost
          PW_REDIS_PORT: "6379"
          PW_REDIS_KEY_PREFIX: "test:ci-<< pipeline.number >>:"   # ${VARS} aren't expanded here
      - image: redis:7
    steps:
      - playwright:
          projects: --project=integration-redis
          setup:
            - wait-for: { port: 6379 }

  mongodb:
    docker:
      - image: node:24
        environment:
          PW_MONGODB_HOST: localhost
          PW_MONGODB_DATABASE: testdb
      - image: mongo:7
    steps:
      - playwright:
          projects: --project=integration-mongodb
          setup:
            - wait-for: { port: 27017 }

  kafka:
    docker:
      - image: node:24
        environment:
          PW_KAFKA_BROKERS: localhost:9092
      - image: apache/kafka:latest
        environment:
          KAFKA_NODE_ID: 1
          KAFKA_PROCESS_ROLES: broker,controller
          KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
          KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
          KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
          KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
          KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
          KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
          KAFKA_NUM_PARTITIONS: 1
          KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
          CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
    steps:
      - playwright:
          projects: --project=integration-kafka
          setup:
            - wait-for: { port: 9092 }

  rabbitmq:
    docker:
      - image: node:24
        environment:
          PW_AMQP_URL: amqp://testuser:testpass@localhost:5672
      - image: rabbitmq:4
        environment:
          RABBITMQ_DEFAULT_USER: testuser
          RABBITMQ_DEFAULT_PASS: testpass
    steps:
      - playwright:
          projects: --project=integration-amqp
          setup:
            - wait-for: { port: 5672 }

  browser:
    docker:
      - image: mcr.microsoft.com/playwright:v1.65.1-noble   # must match @playwright/test
    resource_class: large
    steps:
      - playwright:
          # Skips native builds: only needed if the project installs better-sqlite3 (SQLite), which this image can't compile.
          npm-flags: --ignore-scripts
          projects: --project=browser-chromium --project=browser-firefox --project=browser-webkit

workflows:
  tests:
    jobs: [checks, postgres, redis, mongodb, kafka, rabbitmq, browser]
```

`node:24` and the Playwright image both include `git` and `ssh`, which `checkout` needs. CircleCI's `cimg/node` images work too.

## Other backends

Add a job like `redis` above with this service image:

| Backend | Service image and `environment` | Port to wait for | Variables on the first image |
|---|---|---|---|
| MySQL | `mysql:8.0`; `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | 3306 | `PW_DB_TYPE: mysql`, `PW_DB_HOST: localhost`, `PW_DB_PORT: "3306"`, name, user, password |
| MSSQL | `mcr.microsoft.com/mssql/server:2022-latest`; `ACCEPT_EULA: "Y"`, `MSSQL_SA_PASSWORD` | 1433 (then `sleep 10`) | `PW_DB_TYPE: mssql`, `PW_DB_HOST: localhost`, `PW_DB_PORT: "1433"`, `PW_DB_NAME: master`, `PW_DB_USERNAME: sa`, `PW_DB_ENCRYPT: "false"`, `PW_DB_TRUST_SERVER_CERTIFICATE: "true"` |
| Neo4j | `neo4j:5`; `NEO4J_AUTH: neo4j/testpassword` | 7687 | `PW_NEO4J_URI: bolt://localhost:7687`, `PW_NEO4J_USERNAME: neo4j`, `PW_NEO4J_PASSWORD: testpassword` |

## Secrets

Put real credentials in a [context](https://circleci.com/docs/contexts/) or in the project's environment variables. They reach every step as environment variables of the same name:

```yaml
workflows:
  tests:
    jobs:
      - staging-api:
          context: propmaster-staging        # holds PW_DB_PASSWORD, PW_GRAPHQL_AUTH_TOKEN, ...
          filters: { branches: { only: main } }
```

## Tips

- **Auto-cancel:** turn on *Project Settings → Advanced → Auto-cancel redundant workflows* so a new push cancels the older run.
- **Tests tab:** `store_test_results` adds the *Tests* tab and timing data. With timing data, `circleci tests split --split-by=timings` can split a large suite across `parallelism` containers.
- **Memory:** MSSQL needs about 2 GB. Use `resource_class: large` for its job.
- **Docs-only changes:** CircleCI has no built-in path filter. Use the [path-filtering orb](https://circleci.com/developer/orbs/orb/circleci/path-filtering) if you need one.
