# Azure Pipelines

Azure Pipelines can run a job in a container with [service containers](https://learn.microsoft.com/azure/devops/pipelines/process/service-containers) next to it. The tests reach each service by its name in the job's `services:` map.

## How services work in Azure Pipelines

- **Hostname:** the key in the job's `services:` map (`postgres: postgres_svc` → host `postgres`). This only works for **container jobs** (`container:` set). Jobs that run directly on the VM use `localhost` and mapped `ports:`.
- **Readiness:** give each service container a Docker health check in `options:`. The agent waits for it before running steps.
- **`CI=true`:** Azure sets `TF_BUILD`, not `CI`, so the pipeline sets `CI` itself.
- **Secret variables** are not passed to scripts automatically. Map each one into the step's `env:` (see [Secrets](#secrets)).
- Azure Pipelines doesn't support YAML anchors. Shared steps go in a [template](https://learn.microsoft.com/azure/devops/pipelines/process/templates) instead.

## Shared steps: `ci/playwright-steps.yml`

Every job uses this template: a cached `npm ci`, optional setup steps, the tests, published results and the report on failure.

```yaml
parameters:
  - name: projects          # e.g. "--project=integration-redis"
    type: string
  - name: npmFlags
    type: string
    default: ''
  - name: setup             # steps to run after npm ci (schema setup, ...)
    type: stepList
    default: []

steps:
  - task: Cache@2
    displayName: Cache npm downloads
    inputs:
      key: 'npm | "$(Agent.OS)" | package-lock.json'
      restoreKeys: 'npm | "$(Agent.OS)"'
      path: $(npm_config_cache)

  - script: npm ci --prefer-offline --no-audit --no-fund ${{ parameters.npmFlags }}
    displayName: npm ci

  - ${{ each step in parameters.setup }}:
      - ${{ step }}

  - script: npx playwright test ${{ parameters.projects }} --reporter=line,junit
    displayName: Playwright tests

  - task: PublishTestResults@2
    displayName: Publish test results
    condition: succeededOrFailed()
    inputs:
      testResultsFormat: JUnit
      testResultsFiles: results/junit.xml
      testRunTitle: $(Agent.JobName)

  - task: PublishPipelineArtifact@1
    displayName: Upload HTML report
    condition: failed()
    inputs:
      targetPath: playwright-report
      artifact: playwright-report-$(Agent.JobName)-$(System.JobAttempt)
```

## Complete `azure-pipelines.yml`

Jobs have no `dependsOn`, so they run in parallel. The `--project` names are the ones in Propmaster's `playwright.config.ts`; use yours.

```yaml
trigger:
  branches: { include: [main] }
pr:
  branches: { include: [main] }
  autoCancel: true                 # a new push cancels the older PR run

variables:
  CI: 'true'
  npm_config_cache: $(Pipeline.Workspace)/.npm
  PLAYWRIGHT_JUNIT_OUTPUT_FILE: results/junit.xml

resources:
  containers:
    - container: node
      image: node:24
    - container: playwright
      image: mcr.microsoft.com/playwright:v1.65.1-noble   # must match @playwright/test
      options: --ipc=host
    - container: postgres_svc
      image: postgres:15
      env:
        POSTGRES_DB: testdb
        POSTGRES_USER: testuser
        POSTGRES_PASSWORD: testpass
      options: --health-cmd "pg_isready -U testuser -d testdb" --health-interval 5s --health-retries 20
    - container: redis_svc
      image: redis:7
      options: --health-cmd "redis-cli ping" --health-interval 5s --health-retries 20
    - container: mongodb_svc
      image: mongo:7
      options: >-
        --health-cmd "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'"
        --health-interval 5s --health-retries 20
    - container: kafka_svc
      image: apache/kafka:latest
      env:
        KAFKA_NODE_ID: 1
        KAFKA_PROCESS_ROLES: broker,controller
        KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
        KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
        KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
        KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT
        KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
        KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'
        KAFKA_NUM_PARTITIONS: 1
        KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
        CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk
      options: --health-cmd "/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092" --health-interval 10s --health-retries 12
    - container: rabbitmq_svc
      image: rabbitmq:4
      env:
        RABBITMQ_DEFAULT_USER: testuser
        RABBITMQ_DEFAULT_PASS: testpass
      options: --health-cmd "rabbitmq-diagnostics -q check_port_connectivity" --health-interval 5s --health-retries 20

pool:
  vmImage: ubuntu-latest

jobs:
  - job: checks
    container: node
    steps:
      - task: Cache@2
        inputs:
          key: 'npm | "$(Agent.OS)" | package-lock.json'
          restoreKeys: 'npm | "$(Agent.OS)"'
          path: $(npm_config_cache)
      - script: npm ci --prefer-offline --no-audit --no-fund
      - script: npm run typecheck
      - script: npm run lint:tests

  - job: postgres
    container: node
    services:
      postgres: postgres_svc
    variables:
      PW_DB_TYPE: postgresql
      PW_DB_HOST: postgres
      PW_DB_PORT: 5432
      PW_DB_NAME: testdb
      PW_DB_USERNAME: testuser
      PW_DB_PASSWORD: testpass
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          projects: --project=integration-database
          setup:
            - script: node scripts/create-test-schema.js     # your schema setup
              displayName: Create test schema

  - job: redis
    container: node
    services:
      redis: redis_svc
    variables:
      PW_REDIS_HOST: redis
      PW_REDIS_PORT: 6379
      PW_REDIS_KEY_PREFIX: 'test:ci-$(Build.BuildId):'
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          projects: --project=integration-redis

  - job: mongodb
    container: node
    services:
      mongodb: mongodb_svc
    variables:
      PW_MONGODB_HOST: mongodb
      PW_MONGODB_DATABASE: testdb
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          projects: --project=integration-mongodb

  - job: kafka
    container: node
    services:
      kafka: kafka_svc
    variables:
      PW_KAFKA_BROKERS: kafka:9092
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          projects: --project=integration-kafka

  - job: rabbitmq
    container: node
    services:
      rabbitmq: rabbitmq_svc
    variables:
      PW_AMQP_URL: amqp://testuser:testpass@rabbitmq:5672
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          projects: --project=integration-amqp

  - job: browser
    container: playwright
    steps:
      - template: ci/playwright-steps.yml
        parameters:
          # Skips native builds: only needed if the project installs better-sqlite3 (SQLite), which this image can't compile.
          npmFlags: --ignore-scripts
          projects: --project=browser-chromium --project=browser-firefox --project=browser-webkit
```

## Other backends

Add a container resource and a job like `redis` above:

| Backend | Resource `image` and `env` | Health check (`options`) | Job variables |
|---|---|---|---|
| MySQL | `mysql:8.0`; `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_ROOT_PASSWORD` | `--health-cmd "mysqladmin ping -h 127.0.0.1"` | `PW_DB_TYPE: mysql`, `PW_DB_HOST: mysql`, `PW_DB_PORT: 3306`, name, user, password |
| MSSQL | `mcr.microsoft.com/mssql/server:2022-latest`; `ACCEPT_EULA: 'Y'`, `MSSQL_SA_PASSWORD` | `--health-cmd "/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P TestPass123! -C -Q 'SELECT 1'"` | `PW_DB_TYPE: mssql`, `PW_DB_HOST: mssql`, `PW_DB_PORT: 1433`, `PW_DB_NAME: master`, `PW_DB_USERNAME: sa`, `PW_DB_ENCRYPT: 'false'`, `PW_DB_TRUST_SERVER_CERTIFICATE: 'true'` |
| Neo4j | `neo4j:5`; `NEO4J_AUTH: neo4j/testpassword` | `--health-cmd "cypher-shell -u neo4j -p testpassword 'RETURN 1'"` | `PW_NEO4J_URI: bolt://neo4j:7687`, `PW_NEO4J_USERNAME: neo4j`, `PW_NEO4J_PASSWORD: testpassword` |

## Secrets

Keep real credentials in a variable group (optionally linked to Azure Key Vault) or as secret pipeline variables. Secret variables don't become environment variables on their own. Map them on the step:

```yaml
- job: staging_api
  condition: eq(variables['Build.SourceBranch'], 'refs/heads/main')
  container: node
  variables:
    - group: propmaster-staging          # holds the secret STG_DB_PASSWORD
    - name: PW_ENVIRONMENT
      value: stg
  steps:
    - script: npm ci --prefer-offline --no-audit --no-fund
    - script: npx playwright test --project=openapi --reporter=line,junit
      env:
        PW_DB_PASSWORD: $(STG_DB_PASSWORD)
```

Propmaster's [Azure Key Vault provider](./secrets) can also read secrets directly at test time.

## Tips

- **Tests tab:** `PublishTestResults@2` with `succeededOrFailed()` shows every test, including failures, in the run's *Tests* tab.
- **Docs-only changes:** add `paths: { exclude: [docs/*, README.md] }` under `trigger` and `pr`.
- **Self-hosted agents** need Docker, and the agent user must be able to run it.
