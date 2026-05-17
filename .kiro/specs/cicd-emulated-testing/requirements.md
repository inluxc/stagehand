# Requirements Document

## Introduction

This feature enables the existing integration example tests (database, kafka, redis) to run in CI/CD pipelines by providing containerized infrastructure services. Currently, these tests are skipped with `test.skip()` because they require running PostgreSQL, Redis, and Kafka instances. The goal is to define a CI/CD pipeline configuration that spins up emulated/containerized versions of these services, configures the test framework to connect to them, and removes the skip conditions so the tests execute automatically in CI.

## Glossary

- **Pipeline**: A GitHub Actions workflow that executes jobs in defined steps
- **Service_Container**: A Docker container running as a GitHub Actions service to provide infrastructure dependencies (PostgreSQL, MySQL, MSSQL, Redis, Kafka)
- **Integration_Tests**: The Playwright test files in `tests/examples/` that exercise database, kafka, and redis fixtures against real infrastructure
- **Pipeline_Configuration**: The `.github/workflows/integration-tests.yml` file that defines workflow triggers, jobs, services, and environment variables
- **Test_Skip_Guard**: The `test.skip()` call in example test files that prevents execution when infrastructure is unavailable
- **Environment_Variable**: A `PW_*` prefixed variable used by the framework's ConfigLoader to configure fixture connections
- **Test_Annotation**: Non-personal metadata attached to test steps via Playwright annotations that records what was tested, including operation types, queries, and request/response data
- **Mock_Server**: A lightweight HTTP server that implements API operations defined in an OpenAPI specification, returning schema-valid responses for testing purposes

## Requirements

### Requirement 1: Pipeline Configuration File

**User Story:** As a developer, I want a CI/CD pipeline configuration file, so that integration tests run automatically on code changes.

#### Acceptance Criteria

1. THE Pipeline_Configuration SHALL define a workflow triggered on push events to the `main` branch and on pull request events targeting the `main` branch
2. THE Pipeline_Configuration SHALL be a syntactically valid GitHub Actions YAML file located at `.github/workflows/integration-tests.yml` in the repository
3. THE Pipeline_Configuration SHALL specify a GitHub-hosted Ubuntu runner as the execution environment
4. WHEN the workflow is triggered, THE Pipeline_Configuration SHALL install project dependencies using `npm ci` and then execute integration tests by running Playwright with the `api-integration` project (i.e., `npx playwright test --project=api-integration`)
5. THE Pipeline_Configuration SHALL configure the runner to use Node.js version 18 or higher

### Requirement 2: PostgreSQL Service Container

**User Story:** As a developer, I want a containerized PostgreSQL instance in CI, so that database tests can execute against a real PostgreSQL engine.

#### Acceptance Criteria

1. WHILE the integration test job is running, THE Service_Container SHALL provide a PostgreSQL 15+ instance accessible on port 5432
2. THE Service_Container SHALL initialize with a database named per the `PW_DB_NAME` environment variable, a user named per the `PW_DB_USERNAME` environment variable, and a password set per the `PW_DB_PASSWORD` environment variable provided to the job
3. WHEN the PostgreSQL Service_Container starts, THE Service_Container SHALL pass a connection readiness check (successful response to a TCP connection and query execution on port 5432) within 30 seconds before test execution begins
4. IF the Service_Container fails to become ready within 30 seconds, THEN THE Service_Container SHALL cause the integration test job to fail with an error message indicating the PostgreSQL container did not reach a healthy state

### Requirement 3: MySQL Service Container

**User Story:** As a developer, I want a containerized MySQL instance in CI, so that database tests can execute against a real MySQL engine.

#### Acceptance Criteria

1. WHILE the integration test job is running, THE Service_Container SHALL provide a MySQL 8.0 instance accessible on port 3306 within the job's network
2. THE Service_Container SHALL initialize with a database name matching the `PW_DB_NAME` environment variable, a user matching `PW_DB_USERNAME`, and a password matching `PW_DB_PASSWORD`
3. WHEN the MySQL Service_Container starts, THE Service_Container SHALL pass a TCP connection health check on port 3306 within 30 seconds before test execution begins
4. IF the MySQL Service_Container does not pass the health check within 30 seconds, THEN THE Service_Container SHALL cause the job to fail with an error indicating the database service did not become ready

### Requirement 4: MSSQL Service Container

**User Story:** As a developer, I want a containerized Microsoft SQL Server instance in CI, so that database tests can execute against a real MSSQL engine.

#### Acceptance Criteria

1. WHILE the integration test job is running, THE Service_Container SHALL provide a Microsoft SQL Server 2022 instance accessible on port 1433
2. THE Service_Container SHALL initialize with a database named according to the `PW_DB_NAME` environment variable and SA credentials matching the `PW_DB_PASSWORD` environment variable
3. WHEN the MSSQL Service_Container starts, THE Service_Container SHALL be ready to accept TCP connections on port 1433 within 60 seconds
4. THE Service_Container SHALL set the `ACCEPT_EULA` environment variable to `Y`
5. IF the MSSQL Service_Container does not respond to a connection attempt within 60 seconds of starting, THEN THE CI_Job SHALL fail with an error message indicating the service container health check timed out

### Requirement 5: SQLite Database File

**User Story:** As a developer, I want a SQLite database available in CI, so that database tests can execute against a real SQLite engine.

#### Acceptance Criteria

1. WHEN the integration test job starts, THE Pipeline_Configuration SHALL create a SQLite database file at a workspace-relative path within the job's working directory (e.g., `./tmp/test.db`)
2. THE Pipeline_Configuration SHALL set `PW_DB_TYPE` to `sqlite` and `PW_DB_NAME` to the absolute path of the created SQLite file for the SQLite test job
3. THE Pipeline_Configuration SHALL ensure the SQLite database file is empty (zero tables) so that each CI run starts with no residual state from previous executions

### Requirement 6: Redis Service Container

**User Story:** As a developer, I want a containerized Redis instance in CI, so that redis tests can execute against a real Redis server.

#### Acceptance Criteria

1. WHILE the integration test job is running, THE Service_Container SHALL provide a Redis 7 instance accessible on localhost port 6379
2. WHEN the Redis Service_Container starts, THE Service_Container SHALL verify readiness by receiving a successful response to a PING command within 30 seconds
3. IF the Redis Service_Container does not respond to a PING command within 30 seconds of starting, THEN THE Service_Container SHALL cause the job to fail before test execution begins
4. THE Service_Container SHALL run Redis without authentication enabled, allowing connections without a password

### Requirement 7: Kafka Service Container

**User Story:** As a developer, I want a containerized Kafka instance in CI, so that kafka tests can execute against a real message broker.

#### Acceptance Criteria

1. WHILE the integration test job is running, THE Service_Container SHALL provide a Kafka broker accessible on port 9092
2. WHEN the Kafka Service_Container starts, THE Service_Container SHALL be ready to accept producer and consumer connections within 60 seconds of container launch
3. THE Service_Container SHALL allow automatic topic creation with a default of 1 partition per auto-created topic so tests do not require pre-provisioned topics
4. THE Service_Container SHALL run Kafka in KRaft mode (without ZooKeeper) to minimize container dependencies
5. IF the Kafka Service_Container fails to become ready within 60 seconds, THEN THE Service_Container SHALL cause the integration test job to fail with an error message indicating the broker did not start

### Requirement 8: Environment Variable Configuration for CI

**User Story:** As a developer, I want the CI job to set the correct environment variables, so that the test framework connects to the containerized services automatically.

#### Acceptance Criteria

1. THE Pipeline_Configuration SHALL set `PW_DB_TYPE` to the database type under test (`postgresql`, `mysql`, `mssql`, or `sqlite`), where each database test job sets exactly one value corresponding to the Service_Container database engine used in that job
2. THE Pipeline_Configuration SHALL set `PW_DB_HOST`, `PW_DB_PORT`, `PW_DB_NAME`, `PW_DB_USERNAME`, and `PW_DB_PASSWORD` to values identical to the host, port, database name, username, and password configured in the respective database Service_Container definition
3. THE Pipeline_Configuration SHALL set `PW_KAFKA_BROKERS` to the Kafka Service_Container address in `host:port` format (comma-separated if multiple brokers are defined)
4. THE Pipeline_Configuration SHALL set `PW_REDIS_HOST` and `PW_REDIS_PORT` to values identical to the host and port configured in the Redis Service_Container definition
5. THE Pipeline_Configuration SHALL set `PW_REDIS_KEY_PREFIX` to a non-empty string that includes the CI job identifier, ensuring keys created by concurrent pipeline runs do not collide (e.g., `test:ci-{job_id}:`)
6. IF the database test job targets MSSQL, THEN THE Pipeline_Configuration SHALL set `PW_DB_ENCRYPT` to `false` and `PW_DB_TRUST_SERVER_CERTIFICATE` to `true` to allow unencrypted connectivity to the local MSSQL Service_Container
7. IF a required environment variable (`PW_DB_TYPE`, `PW_DB_HOST`, `PW_DB_PORT`, `PW_DB_NAME`, `PW_DB_USERNAME`, `PW_DB_PASSWORD`, `PW_KAFKA_BROKERS`, `PW_REDIS_HOST`, `PW_REDIS_PORT`, `PW_REDIS_KEY_PREFIX`) is not set for a job that uses the corresponding service, THEN THE Pipeline_Configuration SHALL fail the job before test execution begins with an error message indicating the missing variable name

### Requirement 9: Conditional Test Skip Removal

**User Story:** As a developer, I want the integration tests to detect available infrastructure and skip only when services are unavailable, so that tests run in CI but remain safe to execute locally without infrastructure.

#### Acceptance Criteria

1. WHEN the `CI` environment variable is set to any non-empty string (e.g., `true`, `1`, `yes`), THE Integration_Tests SHALL remove the `test.skip()` call at the `test.describe` level in the infrastructure-dependent example spec files (`database.spec.ts`, `kafka.spec.ts`, `redis.spec.ts`) and execute all test cases within those describe blocks
2. WHEN the `CI` environment variable is unset or set to an empty string, THE Integration_Tests SHALL retain the `test.skip()` call at the `test.describe` level in the infrastructure-dependent example spec files, causing all test cases within those describe blocks to be reported as skipped
3. THE Integration_Tests SHALL evaluate the `CI` environment variable via `process.env.CI` at test collection time, before any test case begins execution, and SHALL NOT attempt a network connection probe to determine skip behavior
4. IF the `CI` environment variable is set and an infrastructure-dependent test fails due to a connection error, THEN THE Integration_Tests SHALL report the failure as a normal test failure with the fixture's standard error (e.g., `FixtureInitError`) rather than silently skipping the test

### Requirement 10: Pipeline Dependency Installation

**User Story:** As a developer, I want the CI job to install all required dependencies, so that Playwright and the test framework are ready to execute.

#### Acceptance Criteria

1. WHEN the integration test job starts, THE Pipeline_Configuration SHALL install Node.js dependencies using `npm ci` before executing any test steps
2. IF `npm ci` fails, THEN THE Pipeline_Configuration SHALL fail the job and not proceed to test execution
3. THE Pipeline_Configuration SHALL use a Node.js 24+ Docker image as the base image for the test job
4. WHEN a test job requires browser-based test execution (browser-chromium, browser-firefox, browser-webkit projects), THE Pipeline_Configuration SHALL install Playwright browsers and their system dependencies using `npx playwright install --with-deps`
5. WHEN a test job does not require browser-based test execution (api-integration, property-tests, cli-e2e projects), THE Pipeline_Configuration SHALL skip Playwright browser installation

### Requirement 11: Test Reporting in CI

**User Story:** As a developer, I want test results to be available as pipeline artifacts, so that I can review failures without re-running the pipeline.

#### Acceptance Criteria

1. WHEN tests complete (pass or fail), THE Pipeline_Configuration SHALL upload the Playwright HTML report as a workflow artifact, using a distinct artifact name that includes the job name to avoid conflicts between parallel jobs
2. WHEN tests complete (pass or fail), THE Pipeline_Configuration SHALL upload the `test-results/` directory as a workflow artifact for trace inspection, using a distinct artifact name that includes the job name
3. THE Pipeline_Configuration SHALL retain test artifacts for a minimum of 7 days
4. THE Pipeline_Configuration SHALL configure the Playwright `html` reporter (in addition to any console reporter) so that an HTML report is generated during test execution
5. THE Pipeline_Configuration SHALL enable Playwright trace capture with `retain-on-failure` mode so that the `test-results/` directory contains trace files for failed tests

### Requirement 12: Test Annotations for Observability

**User Story:** As a developer, I want non-personal test metadata saved as annotations, so that I can understand what was tested in each run without inspecting code.

#### Acceptance Criteria

1. WHEN a fixture operation (query, execute, produce, consume, get, set, del, publish, subscribe) completes, THE Integration_Tests SHALL attach a Test_Annotation to the current test recording the operation type and fixture-specific metadata
2. WHEN a database fixture operation completes, THE Integration_Tests SHALL annotate the test with the SQL statement (truncated to 2048 characters if longer), the operation type (query or execute), and the number of rows returned or affected
3. WHEN a kafka fixture operation completes, THE Integration_Tests SHALL annotate the test with the topic name, the operation type (produce or consume), the message count produced, and the message count consumed
4. WHEN a redis fixture operation completes, THE Integration_Tests SHALL annotate the test with the key or channel name, the operation type (get, set, del, publish, or subscribe), and the string representation of the result value truncated to 1024 characters
5. WHEN an API request completes via the openApiClient fixture, THE Integration_Tests SHALL annotate the test with the HTTP method, request path, request body (truncated to 4096 characters), response status code, and response body (truncated to 4096 characters)
6. THE Test_Annotation SHALL exclude credentials, secrets, authentication tokens, and connection-string passwords by replacing detected values with a "[REDACTED]" placeholder before recording metadata
7. IF an annotation value exceeds its specified truncation limit, THEN THE Integration_Tests SHALL truncate the value and append a "[truncated]" indicator to the recorded metadata

### Requirement 13: OpenAPI Mock Server for CI

**User Story:** As a developer, I want a mock API server based on the Petstore OpenAPI spec running in CI, so that OpenAPI fixture tests can execute against a realistic API.

#### Acceptance Criteria

1. THE Pipeline_Configuration SHALL use `https://petstore.swagger.io/v2/swagger.json` as the OpenAPI specification source
2. WHILE the OpenAPI test job is running, THE Pipeline_Configuration SHALL provide a mock server that implements the Petstore API operations defined in the specification
3. THE mock server SHALL return valid responses conforming to the Petstore OpenAPI schema for all defined operations
4. THE Pipeline_Configuration SHALL set `PW_OPENAPI_SPEC_PATH` to the Petstore spec URL and `PW_OPENAPI_BASE_URL` to the mock server address using the format `http://localhost:<port>`
5. WHEN the mock server starts, THE Pipeline_Configuration SHALL verify the server is accepting HTTP requests by polling a health endpoint with a maximum wait time of 30 seconds and a retry interval of 1 second before tests begin
6. IF the mock server fails to become ready within the maximum wait time of 30 seconds, THEN THE Pipeline_Configuration SHALL fail the job with an error message indicating the mock server did not start successfully

### Requirement 14: OpenAPI Test Execution in CI

**User Story:** As a developer, I want the OpenAPI example tests to run in CI against the mock server, so that the OpenAPI fixture is validated alongside other integration tests.

#### Acceptance Criteria

1. WHEN the workflow is triggered, THE Pipeline_Configuration SHALL execute OpenAPI tests using the `openapi` Playwright project
2. IF the `CI` environment variable is set to `true`, THEN THE OpenAPI Integration_Tests SHALL remove the Test_Skip_Guard and execute all test cases
3. THE OpenAPI Integration_Tests SHALL call a minimum of 3 Petstore API operations covering at least one GET operation (`findPetsByStatus` or `getPetById`) and one POST operation (`addPet`), and SHALL assert that each response returns a successful HTTP status code (2xx) and a response body conforming to the expected schema structure
4. IF the `CI` environment variable is set to `true` and the mock server is unreachable, THEN THE OpenAPI Integration_Tests SHALL fail with an error message indicating the mock server connection failure

### Requirement 15: Browser UI Testing in CI

**User Story:** As a developer, I want browser-based UI tests to run in CI, so that the browser fixture projects (Chromium, Firefox, WebKit) are validated in the pipeline.

#### Acceptance Criteria

1. WHEN the CI pipeline executes the test stage, THE Pipeline_Configuration SHALL run Playwright with the `browser-chromium`, `browser-firefox`, and `browser-webkit` projects, targeting test files matching the `**/examples/browser.spec.ts` pattern
2. THE Pipeline_Configuration SHALL run `npx playwright install --with-deps chromium firefox webkit` to install Playwright browsers and their system dependencies before executing any browser project tests
3. THE Pipeline_Configuration SHALL set the `baseURL` for each browser project to the value resolved from the OpenAPI base URL configuration (`config.openapi.baseUrl`), so that browser tests target the Petstore UI served by the mock server
4. IF the `CI` environment variable is set to `true`, THEN THE browser Integration_Tests SHALL omit the `test.skip()` call at describe level and execute all test cases defined in the browser spec file
5. IF Playwright browser installation fails, THEN THE Pipeline_Configuration SHALL fail the pipeline stage and report an error message indicating which browser failed to install

### Requirement 16: Browser Test File Creation

**User Story:** As a developer, I want a browser example test file, so that UI interactions can be validated against the Petstore Swagger UI in CI.

#### Acceptance Criteria

1. THE Integration_Tests SHALL include a `tests/examples/browser.spec.ts` file that imports `test` and `expect` from the framework entry point (`../../src`) and contains at least 2 test cases exercising browser-based page interactions
2. THE browser test file SHALL navigate to the Petstore Swagger UI page and verify the page has loaded by asserting that the page title contains "Swagger" and at least one API endpoint group heading is visible on the page
3. THE browser test file SHALL expand an API endpoint group section by clicking on it, trigger a request using the "Try it out" and "Execute" controls, and assert that a server response section containing an HTTP status code becomes visible within 10 seconds
4. WHEN the `CI` environment variable is set to `true`, THE browser test file SHALL omit the `test.skip()` guard at the describe level and execute all test cases
5. IF the `CI` environment variable is not set or is set to a value other than `true`, THEN THE browser test file SHALL apply the `test.skip()` guard at the describe level to skip all test cases

### Requirement 17: Property-Based Tests in CI

**User Story:** As a developer, I want property-based tests to run in CI, so that logic invariants are continuously validated on every change.

#### Acceptance Criteria

1. WHEN a push or pull request event occurs on the repository, THE Pipeline_Configuration SHALL execute property tests using the `property-tests` Playwright project targeting all `**/*.prop.ts` test files
2. THE property test job SHALL run without requiring database, message broker, cache, or API service connections, relying only on in-process logic and the fast-check library
3. IF a property test fails, THEN THE Pipeline_Configuration SHALL include the fast-check counterexample values in the test output so the failing input combination is visible in the CI job log
4. THE Pipeline_Configuration SHALL complete the property test job within 10 minutes or terminate with a timeout failure

### Requirement 18: CLI End-to-End Tests in CI

**User Story:** As a developer, I want CLI integration tests to run in CI, so that the scaffolding tool is validated on every change.

#### Acceptance Criteria

1. WHEN a push or pull request targets the main branch, THE Pipeline_Configuration SHALL execute CLI E2E tests by running Playwright with the test file matching `tests/integration/cli-e2e.spec.ts`
2. THE CLI E2E test job SHALL run using Node.js 18 or higher without requiring network access to external services such as databases, message brokers, or cloud providers
3. THE Pipeline_Configuration SHALL provide filesystem write access to the operating system temporary directory so that CLI tests can create and remove temporary project scaffolds
4. IF the CLI E2E test job exits with a non-zero exit code, THEN THE Pipeline_Configuration SHALL fail the pipeline and block the merge
5. THE Pipeline_Configuration SHALL install project dependencies before executing the CLI E2E tests

### Requirement 19: Type Checking in CI

**User Story:** As a developer, I want TypeScript type checking to run in CI, so that type errors are caught before merging.

#### Acceptance Criteria

1. WHEN the workflow is triggered, THE Pipeline_Configuration SHALL run `npm run typecheck` as a dedicated step that executes `tsc --noEmit` against the project's TypeScript configuration
2. THE Pipeline_Configuration SHALL configure the type checking step to complete before integration test steps begin, such that a type checking failure prevents integration tests from executing
3. IF the `npm run typecheck` command exits with a non-zero exit code, THEN THE Pipeline_Configuration SHALL fail the workflow and surface the TypeScript compiler error output in the workflow run logs

### Requirement 20: Pipeline Execution Order

**User Story:** As a developer, I want tests to run in a logical order from fastest to slowest, so that failures are detected early and CI time is minimized.

#### Acceptance Criteria

1. THE Pipeline_Configuration SHALL execute type checking as the first stage, before all property test, integration test, and browser test jobs
2. THE Pipeline_Configuration SHALL execute property tests as the second stage, after type checking completes successfully and before integration and browser test jobs
3. IF type checking or property tests exit with a non-zero exit code, THEN THE Pipeline_Configuration SHALL skip all downstream integration and browser test jobs and report those jobs as skipped
4. THE Pipeline_Configuration SHALL allow integration test jobs (database, redis, kafka, openapi) and browser test jobs to run in parallel with each other in the third stage
