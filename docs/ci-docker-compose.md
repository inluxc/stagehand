# Docker Compose (Any CI)

[`compose.test.yaml`](../compose.test.yaml) starts every service Propmaster's integration tests use, with health checks. It works anywhere Docker runs: your laptop, a self-hosted runner, TeamCity, Buildkite, Drone, Woodpecker, Travis CI, or a CI system with no service-container feature.

## Start the services

```bash
docker compose -f compose.test.yaml up -d --wait            # all of them
```

```bash
docker compose -f compose.test.yaml up -d --wait postgres redis   # only what you need
```

`--wait` returns once every started service passes its health check, so the tests can run straight after. Stop everything and delete the data with:

```bash
docker compose -f compose.test.yaml down -v
```

## Connection settings

Ports are published on `127.0.0.1`. Tests running on the host use `localhost`. Tests running in a container on the `propmaster-test_default` network use the service name instead.

| Backend | Service | `PW_*` variables (from the host) | From a container |
|---|---|---|---|
| PostgreSQL | `postgres` | `PW_DB_TYPE=postgresql` `PW_DB_HOST=localhost` `PW_DB_PORT=5432` `PW_DB_NAME=testdb` `PW_DB_USERNAME=testuser` `PW_DB_PASSWORD=testpass` | `PW_DB_HOST=postgres` |
| MySQL | `mysql` | `PW_DB_TYPE=mysql` `PW_DB_HOST=localhost` `PW_DB_PORT=3306` `PW_DB_NAME=testdb` `PW_DB_USERNAME=testuser` `PW_DB_PASSWORD=testpass` | `PW_DB_HOST=mysql` |
| MSSQL | `mssql` | `PW_DB_TYPE=mssql` `PW_DB_HOST=localhost` `PW_DB_PORT=1433` `PW_DB_NAME=master` `PW_DB_USERNAME=sa` `PW_DB_PASSWORD=TestPass123!` `PW_DB_ENCRYPT=false` `PW_DB_TRUST_SERVER_CERTIFICATE=true` | `PW_DB_HOST=mssql` |
| Redis | `redis` | `PW_REDIS_HOST=localhost` `PW_REDIS_PORT=6379` | `PW_REDIS_HOST=redis` |
| MongoDB | `mongodb` | `PW_MONGODB_HOST=localhost` `PW_MONGODB_DATABASE=testdb` | `PW_MONGODB_HOST=mongodb` |
| Neo4j | `neo4j` | `PW_NEO4J_URI=bolt://localhost:7687` `PW_NEO4J_USERNAME=neo4j` `PW_NEO4J_PASSWORD=testpassword` | `PW_NEO4J_URI=bolt://neo4j:7687` |
| Kafka | `kafka` | `PW_KAFKA_BROKERS=localhost:9092` | `PW_KAFKA_BROKERS=kafka:19092` |
| RabbitMQ | `rabbitmq` | `PW_AMQP_URL=amqp://testuser:testpass@localhost:5672` | `PW_AMQP_URL=amqp://testuser:testpass@rabbitmq:5672` |
| WireMock (mock server) | `wiremock` | `PW_MOCK_URL=http://localhost:8089` | `PW_MOCK_URL=http://wiremock:8080` |
| Mailpit (inbox) | `mailpit` | `PW_INBOX_URL=http://localhost:8025`; the app sends SMTP to `localhost:1025` | `PW_INBOX_URL=http://mailpit:8025`; SMTP `mailpit:1025` |

Kafka has two listeners because a broker tells clients which address to reconnect to. `localhost:9092` only works from the host, so containers get `kafka:19092`.

These are throwaway credentials for containers that only live for one run. Never reuse them for a shared system.

## Run the tests on the host

```bash
export CI=true
docker compose -f compose.test.yaml up -d --wait postgres
```

```bash
PW_DB_TYPE=postgresql PW_DB_HOST=localhost PW_DB_PORT=5432 PW_DB_NAME=testdb \
PW_DB_USERNAME=testuser PW_DB_PASSWORD=testpass \
npx playwright test --project=integration-database
```

For many variables, put them in a `.env.ci` file and run with `PW_ENVIRONMENT=ci`. See [Configuration](./guide/configuration#env-files).

## Run the tests in a container

When the CI agent has Docker but not Node, run the tests in `node:24` on the Compose network and use the service names:

```bash
docker run --rm \
  --network propmaster-test_default \
  -v "$PWD":/app -w /app \
  -e CI=true \
  -e PW_MONGODB_HOST=mongodb -e PW_MONGODB_DATABASE=testdb \
  -e PW_KAFKA_BROKERS=kafka:19092 \
  node:24 \
  sh -c 'npm ci --prefer-offline --no-audit --no-fund && npx playwright test --project=integration-mongodb --project=integration-kafka'
```

## A generic CI script

Any CI system that can run a shell script and has Docker can use this. It always cleans up, even when tests fail:

```bash
#!/usr/bin/env bash
set -euo pipefail

export COMPOSE_FILE=compose.test.yaml
export COMPOSE_PROJECT_NAME="propmaster-${BUILD_ID:-local}"   # isolate parallel builds
trap 'docker compose down -v' EXIT

docker compose up -d --wait postgres redis

export CI=true
export PW_DB_TYPE=postgresql PW_DB_HOST=localhost PW_DB_PORT=5432 PW_DB_NAME=testdb
export PW_DB_USERNAME=testuser PW_DB_PASSWORD=testpass
export PW_REDIS_HOST=localhost PW_REDIS_PORT=6379 PW_REDIS_KEY_PREFIX="test:${BUILD_ID:-local}:"
export PLAYWRIGHT_JUNIT_OUTPUT_FILE=results/junit.xml

npm ci --prefer-offline --no-audit --no-fund
npx playwright test --project=integration-database --project=integration-redis --reporter=line,junit
```

Replace `BUILD_ID` with your CI system's build-number variable. Point your CI's test-report feature at `results/junit.xml`.

::: warning Parallel builds on one machine
A unique `COMPOSE_PROJECT_NAME` keeps containers and networks apart, but the published ports are fixed. Two builds on the same agent that start the same service will clash on the port. Either run one build per agent, or run the tests in a container on the build's own network (`${COMPOSE_PROJECT_NAME}_default`) and leave out the `ports:` lines.
:::
