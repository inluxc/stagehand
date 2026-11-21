# Jenkins

Jenkins has no built-in service containers. With the [Docker Pipeline](https://plugins.jenkins.io/docker-workflow/) plugin, a stage can start the service as a sidecar container, wait until it's ready, and run the tests in `node:24` on the same Docker network.

## Requirements

- Plugins: **Docker Pipeline** and **JUnit**.
- Agents with Docker, labelled `docker` in the examples below.
- Give each parallel stage its own `agent`. Parallel stages that share an agent also share a workspace, and two `npm ci` runs in one folder break each other.

## How services work here

- **Hostname:** each service gets a private network per build and stage, and joins it with `--network-alias`. The tests use that alias (`postgres`), and no host ports are published. Parallel stages and concurrent builds on the same agent can't collide.
- **Readiness:** the helper runs a check inside the service container (`docker exec ... pg_isready`) until it succeeds, for up to 3 minutes.
- **npm cache:** inside Jenkins' Docker containers `HOME` is often `/`, which isn't writable. The helper points `npm_config_cache` at the workspace, and the workspace (and so the cache) is kept between builds.
- **`CI=true`:** Jenkins doesn't set it, so the pipeline does.

## Complete `Jenkinsfile`

The `--project` names are the ones in Propmaster's `playwright.config.ts`; use yours.

```groovy
// Needs the Docker Pipeline and JUnit plugins, and agents labelled "docker".

// Starts a service container on a private network, waits until `ready` succeeds
// inside it, then runs `body` in node:24 on that network. Tests reach it by `alias`.
def withService(Map svc, Closure body) {
    def net = "propmaster-${env.BUILD_TAG}-${svc.alias}".replaceAll(/[^A-Za-z0-9_.-]/, '-')
    sh "docker network create ${net}"
    try {
        docker.image(svc.image).withRun("--network ${net} --network-alias ${svc.alias} ${svc.args ?: ''}") { c ->
            timeout(time: 3, unit: 'MINUTES') {
                waitUntil(initialRecurrencePeriod: 2000) {
                    sh(script: "docker exec ${c.id} ${svc.ready}", returnStatus: true) == 0
                }
            }
            docker.image('node:24').inside("--network ${net}") {
                runTests('', body)
            }
        }
    } finally {
        sh "docker network rm ${net} || true"
    }
}

// Cached npm install, run `body`, publish JUnit results, and keep the HTML report on failure.
def runTests(String npmFlags, Closure body) {
    withEnv(["npm_config_cache=${env.WORKSPACE}/.npm", 'PLAYWRIGHT_JUNIT_OUTPUT_FILE=results/junit.xml']) {
        try {
            sh "npm ci --prefer-offline --no-audit --no-fund ${npmFlags}"
            body()
        } catch (err) {
            archiveArtifacts artifacts: 'playwright-report/**', allowEmptyArchive: true
            throw err
        } finally {
            junit allowEmptyResults: true, testResults: 'results/junit.xml'
        }
    }
}

pipeline {
    agent none
    options {
        disableConcurrentBuilds(abortPrevious: true)   // a new push aborts the older build
        timeout(time: 20, unit: 'MINUTES')
    }
    environment {
        CI = 'true'
    }
    stages {
        stage('Tests') {
            parallel {
                stage('Checks') {
                    agent { docker { image 'node:24'; label 'docker' } }
                    steps {
                        script {
                            runTests('') {
                                sh 'npm run typecheck'
                                sh 'npm run lint:tests'
                            }
                        }
                    }
                }

                stage('PostgreSQL') {
                    agent { label 'docker' }
                    steps {
                        script {
                            withService(image: 'postgres:15', alias: 'postgres',
                                        args: '-e POSTGRES_DB=testdb -e POSTGRES_USER=testuser -e POSTGRES_PASSWORD=testpass',
                                        ready: 'pg_isready -U testuser -d testdb') {
                                withEnv(['PW_DB_TYPE=postgresql', 'PW_DB_HOST=postgres', 'PW_DB_PORT=5432',
                                         'PW_DB_NAME=testdb', 'PW_DB_USERNAME=testuser', 'PW_DB_PASSWORD=testpass']) {
                                    sh 'node scripts/create-test-schema.js'   // your schema setup
                                    sh 'npx playwright test --project=integration-database --reporter=line,junit'
                                }
                            }
                        }
                    }
                }

                stage('Redis') {
                    agent { label 'docker' }
                    steps {
                        script {
                            withService(image: 'redis:7', alias: 'redis', ready: 'redis-cli ping') {
                                withEnv(['PW_REDIS_HOST=redis', 'PW_REDIS_PORT=6379', "PW_REDIS_KEY_PREFIX=test:${env.BUILD_TAG}:"]) {
                                    sh 'npx playwright test --project=integration-redis --reporter=line,junit'
                                }
                            }
                        }
                    }
                }

                stage('MongoDB') {
                    agent { label 'docker' }
                    steps {
                        script {
                            withService(image: 'mongo:7', alias: 'mongodb',
                                        ready: "mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok'") {
                                withEnv(['PW_MONGODB_HOST=mongodb', 'PW_MONGODB_DATABASE=testdb']) {
                                    sh 'npx playwright test --project=integration-mongodb --reporter=line,junit'
                                }
                            }
                        }
                    }
                }

                stage('Kafka') {
                    agent { label 'docker' }
                    steps {
                        script {
                            withService(image: 'apache/kafka:latest', alias: 'kafka',
                                        args: [
                                            '-e KAFKA_NODE_ID=1',
                                            '-e KAFKA_PROCESS_ROLES=broker,controller',
                                            '-e KAFKA_LISTENERS=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093',
                                            '-e KAFKA_ADVERTISED_LISTENERS=PLAINTEXT://kafka:9092',
                                            '-e KAFKA_CONTROLLER_LISTENER_NAMES=CONTROLLER',
                                            '-e KAFKA_LISTENER_SECURITY_PROTOCOL_MAP=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT',
                                            '-e KAFKA_CONTROLLER_QUORUM_VOTERS=1@localhost:9093',
                                            '-e KAFKA_AUTO_CREATE_TOPICS_ENABLE=true',
                                            '-e KAFKA_NUM_PARTITIONS=1',
                                            '-e KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR=1',
                                            '-e CLUSTER_ID=MkU3OEVBNTcwNTJENDM2Qk',
                                        ].join(' '),
                                        ready: '/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:9092') {
                                withEnv(['PW_KAFKA_BROKERS=kafka:9092']) {
                                    sh 'npx playwright test --project=integration-kafka --reporter=line,junit'
                                }
                            }
                        }
                    }
                }

                stage('RabbitMQ') {
                    agent { label 'docker' }
                    steps {
                        script {
                            withService(image: 'rabbitmq:4', alias: 'rabbitmq',
                                        args: '-e RABBITMQ_DEFAULT_USER=testuser -e RABBITMQ_DEFAULT_PASS=testpass',
                                        ready: 'rabbitmq-diagnostics -q check_port_connectivity') {
                                withEnv(['PW_AMQP_URL=amqp://testuser:testpass@rabbitmq:5672']) {
                                    sh 'npx playwright test --project=integration-amqp --reporter=line,junit'
                                }
                            }
                        }
                    }
                }

                stage('Browsers') {
                    agent {
                        docker {
                            image 'mcr.microsoft.com/playwright:v1.65.1-noble'   // must match @playwright/test
                            args '--ipc=host'                                    // Chromium needs shared memory
                            label 'docker'
                        }
                    }
                    steps {
                        script {
                            // Skips native builds: only needed if the project installs better-sqlite3 (SQLite), which this image can't compile.
                            runTests('--ignore-scripts') {
                                sh 'npx playwright test --project=browser-chromium --project=browser-firefox --project=browser-webkit --reporter=line,junit'
                            }
                        }
                    }
                }
            }
        }
    }
}
```

## Other backends

Add a stage like `Redis` with these `withService` arguments and variables:

| Backend | `image`, `alias` | `args` | `ready` | Variables |
|---|---|---|---|---|
| MySQL | `mysql:8.0`, `mysql` | `-e MYSQL_DATABASE=testdb -e MYSQL_USER=testuser -e MYSQL_PASSWORD=testpass -e MYSQL_ROOT_PASSWORD=rootpass` | `mysqladmin ping -h 127.0.0.1` | `PW_DB_TYPE=mysql`, `PW_DB_HOST=mysql`, `PW_DB_PORT=3306`, plus name, user and password |
| MSSQL | `mcr.microsoft.com/mssql/server:2022-latest`, `mssql` | `-e ACCEPT_EULA=Y -e MSSQL_SA_PASSWORD=TestPass123!` | `/opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P TestPass123! -C -Q "SELECT 1"` | `PW_DB_TYPE=mssql`, `PW_DB_HOST=mssql`, `PW_DB_PORT=1433`, `PW_DB_NAME=master`, `PW_DB_USERNAME=sa`, `PW_DB_ENCRYPT=false`, `PW_DB_TRUST_SERVER_CERTIFICATE=true` |
| Neo4j | `neo4j:5`, `neo4j` | `-e NEO4J_AUTH=neo4j/testpassword` | `cypher-shell -u neo4j -p testpassword "RETURN 1"` | `PW_NEO4J_URI=bolt://neo4j:7687`, `PW_NEO4J_USERNAME=neo4j`, `PW_NEO4J_PASSWORD=testpassword` |

## Credentials

Store real credentials in Jenkins and bind them only where needed. Values bound this way are masked in the console log:

```groovy
stage('Staging API') {
    agent { docker { image 'node:24'; label 'docker' } }
    when { branch 'main' }
    environment {
        PW_ENVIRONMENT = 'stg'                          // the "stg" block of environments.json
        PW_DB_PASSWORD = credentials('stg-db-password') // a "Secret text" credential
    }
    steps {
        script {
            runTests('') {
                sh 'npx playwright test --project=openapi --reporter=line,junit'
            }
        }
    }
}
```

## Using Docker Compose instead

If you'd rather start all services with one file, use [`compose.test.yaml`](./ci-docker-compose) with a unique `COMPOSE_PROJECT_NAME` per build. Its ports are fixed, so allow only one such build per agent.

## Tips

- **Blue Ocean / Test Results:** the `junit` step lists every test with its steps' output, and marks the build *Unstable* or *Failed*.
- **Shared memory:** without `--ipc=host` (or `--shm-size=1g`), Chromium can crash on large pages.
- **Script approval:** `withService` and `runTests` are plain pipeline steps, so they need no in-process script approval. If you move them into a [Shared Library](https://www.jenkins.io/doc/book/pipeline/shared-libraries/), every Jenkinsfile can call them.
