# Implementation Plan: CI/CD Emulated Testing

## Overview

This implementation sets up a complete CI/CD pipeline with containerized infrastructure services, a test annotation system for observability, conditional test skip logic, browser tests, and environment variable validation. Tasks are ordered from foundational utilities through pipeline configuration, following the staged execution model: typecheck → property tests → integration/browser tests (parallel).

## Tasks

- [x] 1. Create annotation system utilities
  - [x] 1.1 Create truncation and redaction utility module at `src/annotations/truncation.ts`
    - Implement `truncate(value: string, limit: number): string` that returns the original string if within limit, or the first `limit` characters plus `[truncated]` indicator
    - Implement `redactCredentials(value: string): string` that replaces password fields, Bearer/Basic tokens, API keys, JWT tokens, and connection string secrets with `[REDACTED]`
    - Export both functions
    - _Requirements: 12.6, 12.7_

  - [x] 1.2 Create annotation recorder module at `src/annotations/recorder.ts`
    - Implement `recordDatabase(testInfo, operation, sql, rowCount)` that attaches a database annotation with SQL truncated to 2048 chars
    - Implement `recordKafka(testInfo, operation, topic, messageCount)` that attaches a Kafka annotation with topic and count
    - Implement `recordRedis(testInfo, operation, key, result)` that attaches a Redis annotation with result truncated to 1024 chars
    - Implement `recordOpenApi(testInfo, method, path, reqBody, status, resBody)` that attaches an OpenAPI annotation with bodies truncated to 4096 chars
    - All annotation values pass through `redactCredentials` before recording
    - Use Playwright's `testInfo.annotations` array to push annotation objects with type `fixture-operation`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7_

  - [x] 1.3 Create annotation barrel export at `src/annotations/index.ts`
    - Export all public functions from `truncation.ts` and `recorder.ts`
    - _Requirements: 12.1_

- [x] 2. Create environment variable validation
  - [x] 2.1 Create validation script at `.github/scripts/validate-env.sh`
    - Accept a list of required variable names as arguments
    - For each variable, check if it is set and non-empty
    - If any variable is missing, print `Missing required variable: PW_VAR_NAME` and exit with code 1
    - Make the script executable
    - _Requirements: 8.7_

  - [x] 2.2 Write property test for environment variable validation at `tests/properties/env-validation.prop.ts`
    - **Property 8: Required environment variable validation rejects incomplete configurations**
    - **Validates: Requirements 8.7**

- [x] 3. Implement conditional test skip logic
  - [x] 3.1 Update `tests/examples/database.spec.ts` to use conditional skip
    - Replace `test.skip()` with `test.skip(!process.env.CI, 'Skipped: requires CI infrastructure')`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.2 Update `tests/examples/kafka.spec.ts` to use conditional skip
    - Replace `test.skip()` with `test.skip(!process.env.CI, 'Skipped: requires CI infrastructure')`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.3 Update `tests/examples/redis.spec.ts` to use conditional skip
    - Replace `test.skip()` with `test.skip(!process.env.CI, 'Skipped: requires CI infrastructure')`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 3.4 Update `tests/examples/openapi.spec.ts` to use conditional skip
    - Replace `test.skip()` with `test.skip(!process.env.CI, 'Skipped: requires CI infrastructure')`
    - _Requirements: 14.2_

- [x] 4. Create browser test file
  - [x] 4.1 Create `tests/examples/browser.spec.ts`
    - Import `test` and `expect` from `../../src`
    - Add conditional skip: `test.skip(!process.env.CI, 'Skipped: requires CI infrastructure')`
    - Test 1: Navigate to Petstore Swagger UI, assert page title contains "Swagger", assert at least one API endpoint group heading is visible
    - Test 2: Expand an API endpoint group by clicking, click "Try it out" and "Execute", assert server response section with HTTP status code becomes visible within 10 seconds
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

- [x] 5. Checkpoint - Ensure annotation system and test files compile
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Write property tests for annotation system
  - [x] 6.1 Write property test for CI skip guard evaluation at `tests/properties/ci-skip-guard.prop.ts`
    - **Property 1: CI skip guard evaluates correctly for any non-empty string**
    - **Validates: Requirements 9.1, 14.2, 15.4, 16.4**

  - [x] 6.2 Write property test for annotation truncation at `tests/properties/annotation-truncation.prop.ts`
    - **Property 2: Annotation value truncation preserves prefix and appends indicator**
    - **Validates: Requirements 12.7**

  - [x] 6.3 Write property test for credential redaction at `tests/properties/credential-redaction.prop.ts`
    - **Property 3: Credential redaction replaces all sensitive patterns**
    - **Validates: Requirements 12.6**

  - [x] 6.4 Write property test for database annotation at `tests/properties/database-annotation.prop.ts`
    - **Property 4: Database annotation contains required metadata**
    - **Validates: Requirements 12.2**

  - [x] 6.5 Write property test for Kafka annotation at `tests/properties/kafka-annotation.prop.ts`
    - **Property 5: Kafka annotation contains required metadata**
    - **Validates: Requirements 12.3**

  - [x] 6.6 Write property test for Redis annotation at `tests/properties/redis-annotation.prop.ts`
    - **Property 6: Redis annotation contains required metadata**
    - **Validates: Requirements 12.4**

  - [x] 6.7 Write property test for OpenAPI annotation at `tests/properties/openapi-annotation.prop.ts`
    - **Property 7: OpenAPI annotation contains required metadata**
    - **Validates: Requirements 12.5**

- [x] 7. Create GitHub Actions workflow file
  - [x] 7.1 Create `.github/workflows/integration-tests.yml` with triggers and Stage 1 (typecheck)
    - Define workflow triggered on push to `main` and pull_request targeting `main`
    - Define `typecheck` job: Node.js 24 Docker image, Ubuntu runner, `npm ci`, `npm run typecheck`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 10.1, 10.3, 19.1, 19.2, 19.3_

  - [x] 7.2 Add Stage 2 (property-tests) job to the workflow
    - Define `property-tests` job with `needs: [typecheck]`
    - Install dependencies with `npm ci`
    - Run `npx playwright test --project=property-tests` with 10-minute timeout
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 20.1, 20.2_

  - [x] 7.3 Add Stage 3 PostgreSQL integration job to the workflow
    - Define `test-postgres` job with `needs: [property-tests]`
    - Configure PostgreSQL 15 service container on port 5432 with health check (30s timeout)
    - Set `PW_DB_TYPE=postgresql`, `PW_DB_HOST`, `PW_DB_PORT`, `PW_DB_NAME`, `PW_DB_USERNAME`, `PW_DB_PASSWORD` env vars
    - Run validate-env script, then `npx playwright test --project=api-integration`
    - Upload HTML report and test-results artifacts with 7-day retention
    - _Requirements: 1.4, 2.1, 2.2, 2.3, 2.4, 8.1, 8.2, 8.7, 11.1, 11.2, 11.3, 11.4, 11.5, 20.3, 20.4_

  - [x] 7.4 Add Stage 3 MySQL integration job to the workflow
    - Define `test-mysql` job with `needs: [property-tests]`
    - Configure MySQL 8.0 service container on port 3306 with health check (30s timeout)
    - Set `PW_DB_TYPE=mysql` and matching env vars
    - Run validate-env script, then `npx playwright test --project=api-integration`
    - Upload artifacts with 7-day retention
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 8.1, 8.2, 8.7, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.5 Add Stage 3 MSSQL integration job to the workflow
    - Define `test-mssql` job with `needs: [property-tests]`
    - Configure MSSQL 2022 service container on port 1433 with health check (60s timeout), `ACCEPT_EULA=Y`
    - Set `PW_DB_TYPE=mssql`, `PW_DB_ENCRYPT=false`, `PW_DB_TRUST_SERVER_CERTIFICATE=true` and matching env vars
    - Run validate-env script, then `npx playwright test --project=api-integration`
    - Upload artifacts with 7-day retention
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.2, 8.6, 8.7, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.6 Add Stage 3 SQLite integration job to the workflow
    - Define `test-sqlite` job with `needs: [property-tests]`
    - Create SQLite database file at `./tmp/test.db` (empty, no tables)
    - Set `PW_DB_TYPE=sqlite`, `PW_DB_NAME` to absolute path of the SQLite file
    - Run `npx playwright test --project=api-integration`
    - Upload artifacts with 7-day retention
    - _Requirements: 5.1, 5.2, 5.3, 8.1, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.7 Add Stage 3 Redis integration job to the workflow
    - Define `test-redis` job with `needs: [property-tests]`
    - Configure Redis 7 service container on port 6379 with PING health check (30s timeout), no auth
    - Set `PW_REDIS_HOST=localhost`, `PW_REDIS_PORT=6379`, `PW_REDIS_KEY_PREFIX=test:ci-${{ github.run_id }}:`
    - Run validate-env script, then `npx playwright test --project=api-integration`
    - Upload artifacts with 7-day retention
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 8.4, 8.5, 8.7, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.8 Add Stage 3 Kafka integration job to the workflow
    - Define `test-kafka` job with `needs: [property-tests]`
    - Configure Kafka service container in KRaft mode on port 9092 with health check (60s timeout), auto topic creation enabled
    - Set `PW_KAFKA_BROKERS=localhost:9092`
    - Run validate-env script, then `npx playwright test --project=api-integration`
    - Upload artifacts with 7-day retention
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.3, 8.7, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.9 Add Stage 3 OpenAPI + Mock Server job to the workflow
    - Define `test-openapi` job with `needs: [property-tests]`
    - Start Prism mock server as background process: `npx @stoplight/prism-cli mock https://petstore.swagger.io/v2/swagger.json --port 4010 &`
    - Poll `http://localhost:4010` for readiness (30s max, 1s interval)
    - Set `PW_OPENAPI_SPEC_PATH=https://petstore.swagger.io/v2/swagger.json`, `PW_OPENAPI_BASE_URL=http://localhost:4010`
    - Run `npx playwright test --project=openapi`
    - Upload artifacts with 7-day retention
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 14.1, 14.2, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.10 Add Stage 3 Browser tests job to the workflow
    - Define `test-browser` job with `needs: [property-tests]`
    - Start Prism mock server as background process on port 4010
    - Run `npx playwright install --with-deps chromium firefox webkit`
    - Set `PW_OPENAPI_BASE_URL=http://localhost:4010`
    - Run `npx playwright test --project=browser-chromium --project=browser-firefox --project=browser-webkit`
    - Upload artifacts with 7-day retention
    - _Requirements: 10.4, 15.1, 15.2, 15.3, 15.4, 15.5, 11.1, 11.2, 11.3, 20.4_

  - [x] 7.11 Add Stage 3 CLI E2E job to the workflow
    - Define `test-cli-e2e` job with `needs: [property-tests]`
    - Install dependencies with `npm ci`
    - Run `npx playwright test tests/integration/cli-e2e.spec.ts`
    - Upload artifacts with 7-day retention
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 10.5, 20.4_

- [x] 8. Update playwright.config.ts for CI reporters
  - [x] 8.1 Add HTML reporter and trace configuration to `playwright.config.ts`
    - Add `reporter: [['list'], ['html', { open: 'never' }]]` for CI
    - Add `use: { trace: 'retain-on-failure' }` to global config
    - _Requirements: 11.4, 11.5_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- The annotation system is decoupled from fixtures for testability in isolation
- The workflow uses `needs` dependencies to enforce staged execution order
- All integration jobs run in parallel in Stage 3 for faster CI completion

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "3.3", "3.4"] },
    { "id": 1, "tasks": ["1.2", "2.2", "4.1"] },
    { "id": 2, "tasks": ["1.3", "6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["6.4", "6.5", "6.6", "6.7"] },
    { "id": 4, "tasks": ["7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "7.5"] },
    { "id": 6, "tasks": ["7.6", "7.7", "7.8", "7.9"] },
    { "id": 7, "tasks": ["7.10", "7.11", "8.1"] }
  ]
}
```
