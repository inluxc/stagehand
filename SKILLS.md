# AI Skills — Playwright Framework Template

This document teaches AI agents the step-by-step skills needed to create tests with this framework. Each skill is a self-contained recipe.

**Every template below follows the mandatory conventions in Skill 0.** Templates use placeholder IDs such as `TC-API-NNN`. Replace each one with a real ID from `npm run next-id`; `npm run lint:tests` fails while any placeholder is left in a spec file.

---

## Skill 0: Assign TestCaseIDs and Test Steps (ALWAYS)

**When to use:** ALWAYS. Every generated test must have a unique TestCaseID and be broken into `test.step()` blocks. This applies to every other skill in this document.

**Workflow:**

1. Pick the category code for the domain under test (table below).
2. Get free IDs, one per test you are about to write:
   ```bash
   npm run next-id -- API        # prints e.g. TC-API-005
   npm run next-id -- API 3      # prints TC-API-005, TC-API-006, TC-API-007
   ```
3. Put the ID in square brackets at the **start** of the title, **and** as a tag in the options object (the second argument to `test()`).
4. Break the body into `await test.step('Step N: <verb phrase>', async () => { ... })` blocks, or call a step class from `src/steps/`, whose methods already wrap `test.step()`.
5. Run the checks before you finish:
   ```bash
   npm run lint:tests            # IDs, tags, uniqueness, steps, imports
   npm run lint:tests -- --json  # same, machine-readable
   npm run verify                # typecheck + lint:tests + unit + property tests
   ```

| Category Code | Domain |
|---|---|
| `API` | OpenAPI / REST API tests |
| `DB` | Database tests |
| `KFK` | Kafka tests |
| `AMQ` | RabbitMQ / AMQP tests |
| `RDS` | Redis tests |
| `MDB` | MongoDB tests |
| `NEO` | Neo4j tests |
| `GQL` | GraphQL tests |
| `BRW` | Browser tests |
| `APM` | Appium mobile tests |
| `GDS` | GADS device farm tests |
| `OTP` | OTP/2FA tests |
| `INT` | Integration (multi-fixture) tests |
| `PROP` | Property-based tests |

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Feature Name', () => {
    test('[TC-API-NNN] POST /items — create item returns 201', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        // test.step() returns the callback's value, so results can flow between steps.
        const response = await test.step('Step 1: Send POST request with valid item data', async () => {
            return (client as any).createItem(null, { name: 'New Item', description: 'Created via test' });
        });

        await test.step('Step 2: Verify response status is 201', async () => {
            expect(response.status).toBe(201);
        });

        await test.step('Step 3: Verify response contains item with generated ID', async () => {
            expect(response.data).toHaveProperty('id');
            expect(response.data.name).toBe('New Item');
        });
    });

    // Parameterized tests: give each case its own ID in the data.
    const cases = [
        { id: 'TC-API-NNN', itemId: 'missing-1' },
        { id: 'TC-API-NNN', itemId: 'missing-2' },
    ];
    for (const c of cases) {
        test(`[${c.id}] GET /items/${c.itemId} returns 404`, { tag: [`@${c.id}`] }, async ({ openApiClient }) => {
            const { client } = openApiClient;

            const response = await test.step('Step 1: Request a non-existent item', async () => {
                return (client as any).getItemById({ id: c.itemId }, null, { validateStatus: () => true });
            });

            await test.step('Step 2: Verify response status is 404', async () => {
                expect(response.status).toBe(404);
            });
        });
    }
});
```

**Test Steps Rules:**

1. **Every test must have steps.** Wrap each logical action in `await test.step('Step N: ...', async () => { ... })`, or use a step class from `src/steps/`.
2. **Naming convention:** `Step N: <verb phrase>`, starting with a clear action verb.
3. **Granularity:** each step is one logical action or one group of related assertions, not one line of code.
4. **Pass values between steps** by returning them from the step (`const x = await test.step(..., async () => value)`), or by declaring a variable outside and assigning it inside.
5. **Steps appear in reports.** The HTML report, trace viewer and CI logs show each step, so a failure points to the exact step that broke.

**Common step patterns:**

| Step Purpose | Example Name |
|---|---|
| Setup / precondition | `Step 1: Seed test data into database` |
| Navigation | `Step 2: Navigate to login page` |
| User action | `Step 3: Fill in credentials and submit form` |
| API call | `Step 2: Send POST request with payload` |
| Assertion | `Step 4: Verify success message is displayed` |
| Cleanup | `Step 5: Delete created test record` |

**TestCaseID Rules:**

1. **Uniqueness is mandatory.** No two tests in the project may share a TestCaseID (`npm run lint:tests` enforces this).
2. **Never reuse IDs.** A deleted test's ID is retired. `next-id` only sees IDs still in the code, so never renumber.
3. **Sequential within a category.** Always take IDs from `npm run next-id`; don't guess.
4. **Title and tag.** The ID goes at the start of the title as `[TC-XXX-NNN]` **and** in the tag as `{ tag: ['@TC-XXX-NNN'] }`.
5. **Framework self-tests are exempt.** `tests/unit/` and `tests/properties/` test the framework itself and don't need IDs. Any IDs they use still count for uniqueness.

---

## Skill 1: Create an API Test (OpenAPI)

**When to use:** Testing REST API endpoints defined in an OpenAPI specification.

**Starting from nothing?** `npx propmaster generate openapi --tag <tag>` writes a test per operation and documented status code into `tests/api/<tag>.spec.ts`, with real IDs and steps ([docs/guide/generate-api-tests.md](docs/guide/generate-api-tests.md)). Then replace the example values with real data, add body assertions and resolve the `test.fixme` TODOs. Write the tests by hand, as below, for flows that span several operations.

**Steps:**

1. Create a file matching the project's `testMatch` pattern (e.g., `tests/examples/openapi.spec.ts` or add a new pattern to `playwright.config.ts`)
2. Import from the framework entry point
3. Use the `openApiClient` fixture
4. Call operations by their `operationId` from the spec
5. Always include both positive (happy path) and negative (error/edge case) scenarios
6. Include security tests for injection, auth bypass, and input abuse
7. Replace every `TC-API-NNN` with IDs from `npm run next-id -- API <count>`, then run `npm run lint:tests`
8. Turn on contract checks for the project (`use: { openapi: { ..., validateResponses: true } }`): every response is then checked against the spec, so the test needn't assert each field's type. For one response, `await new OpenApiSteps(openApiClient).verifyMatchesSchema(response)`

**Template:**

```typescript
import { test, expect } from '../../src';

/**
 * Pass as the 3rd argument to any operation so non-2xx responses are
 * returned instead of thrown. Then assert on `response.status` directly.
 * `contract: { request: false }` lets negative tests send invalid bodies
 * when `validateRequests` is on; the response is still checked.
 *
 * Do NOT use `try { call } catch (e) { expect(e.response.status)... }`:
 * if the call unexpectedly succeeds, the catch never runs and the test
 * passes without asserting anything.
 */
const ANY_STATUS = { validateStatus: () => true, contract: { request: false } };

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIVE TESTS — Happy path, valid inputs, expected behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Positive', () => {
    test('[TC-API-NNN] GET /items — list all items returns 200', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send GET request to /items', async () => {
            return (client as any).listItems();
        });

        await test.step('Step 2: Verify 200 response with an array body', async () => {
            expect(response.status).toBe(200);
            expect(response.data).toBeInstanceOf(Array);
        });
    });

    test('[TC-API-NNN] GET /items/:id — fetch single item returns 200', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send GET request for item 123', async () => {
            return (client as any).getItemById({ id: '123' });
        });

        await test.step('Step 2: Verify 200 response for the requested item', async () => {
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('id', '123');
        });
    });

    test('[TC-API-NNN] POST /items — create item with valid body returns 201', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with valid item data', async () => {
            return (client as any).createItem(null, {
                name: 'New Item',
                description: 'Created via test',
            });
        });

        await test.step('Step 2: Verify 201 response contains the created item', async () => {
            expect(response.status).toBe(201);
            expect(response.data).toHaveProperty('id');
            expect(response.data.name).toBe('New Item');
        });
    });

    test('[TC-API-NNN] PUT /items/:id — update item returns 200', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send PUT request with updated name', async () => {
            return (client as any).updateItem({ id: '123' }, { name: 'Updated Item' });
        });

        await test.step('Step 2: Verify 200 response reflects the update', async () => {
            expect(response.status).toBe(200);
            expect(response.data.name).toBe('Updated Item');
        });
    });

    test('[TC-API-NNN] DELETE /items/:id — delete item returns 204', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send DELETE request for item 123', async () => {
            return (client as any).deleteItem({ id: '123' });
        });

        await test.step('Step 2: Verify 204 response', async () => {
            expect(response.status).toBe(204);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEGATIVE TESTS — Invalid inputs, missing fields, wrong types, edge cases
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Negative', () => {
    test('[TC-API-NNN] GET /items/:id — non-existent ID returns 404', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Request a non-existent item', async () => {
            return (client as any).getItemById({ id: 'non-existent-id-999' }, null, ANY_STATUS);
        });

        await test.step('Step 2: Verify 404 response', async () => {
            expect(response.status).toBe(404);
        });
    });

    test('[TC-API-NNN] POST /items — missing required fields returns 400', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with an empty object', async () => {
            return (client as any).createItem(null, {}, ANY_STATUS);
        });

        await test.step('Step 2: Verify 400 response with validation details', async () => {
            expect(response.status).toBe(400);
            expect(response.data).toHaveProperty('message');
        });
    });

    test('[TC-API-NNN] POST /items — invalid field types returns 400', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with wrongly typed fields', async () => {
            return (client as any).createItem(null, {
                name: 12345,              // should be string
                quantity: 'not-a-number', // should be number
            }, ANY_STATUS);
        });

        await test.step('Step 2: Verify 400 response', async () => {
            expect(response.status).toBe(400);
        });
    });

    test('[TC-API-NNN] POST /items — exceeds max length returns 400', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with oversized fields', async () => {
            return (client as any).createItem(null, {
                name: 'A'.repeat(10000),
                description: 'B'.repeat(100000),
            }, ANY_STATUS);
        });

        await test.step('Step 2: Verify 400 or 413 response', async () => {
            expect([400, 413]).toContain(response.status);
        });
    });

    test('[TC-API-NNN] PUT /items/:id — invalid ID format returns 400 or 404', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send PUT request with a malformed ID', async () => {
            return (client as any).updateItem({ id: '../../etc/passwd' }, { name: 'Hacked' }, ANY_STATUS);
        });

        await test.step('Step 2: Verify 400 or 404 response', async () => {
            expect([400, 404]).toContain(response.status);
        });
    });

    test('[TC-API-NNN] DELETE /items/:id — already deleted returns 404', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send DELETE request for an already-deleted item', async () => {
            return (client as any).deleteItem({ id: 'already-deleted-id' }, null, ANY_STATUS);
        });

        await test.step('Step 2: Verify 404 response', async () => {
            expect(response.status).toBe(404);
        });
    });

    test('[TC-API-NNN] POST /items — empty body returns 400', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with a null body', async () => {
            return (client as any).createItem(null, null, ANY_STATUS);
        });

        await test.step('Step 2: Verify 400 or 415 response', async () => {
            expect([400, 415]).toContain(response.status);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY TESTS — Injection, auth bypass, input abuse
// Rule: malicious input must NEVER produce a 5xx (indicates unhandled input).
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Security', () => {

    // --- SQL Injection ---

    test('[TC-API-NNN] SQL injection in path parameter is rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const sqlPayloads = [
            "1; DROP TABLE users;--",
            "1' OR '1'='1",
            "1 UNION SELECT * FROM users--",
            "'; DELETE FROM items WHERE '1'='1",
        ];

        const statuses = await test.step('Step 1: Send each SQL payload as the path ID', async () => {
            const result: number[] = [];
            for (const payload of sqlPayloads) {
                const response = await (client as any).getItemById({ id: payload }, null, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify every payload returned 400 or 404, never 5xx', async () => {
            for (const status of statuses) {
                expect([400, 404]).toContain(status);
            }
        });
    });

    test('[TC-API-NNN] SQL injection in request body is stored as plain text or rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const sqlPayloads = [
            "'; DROP TABLE items;--",
            "1 OR 1=1",
            "admin'--",
            "' UNION SELECT password FROM users WHERE '1'='1",
        ];

        const statuses = await test.step('Step 1: Send each SQL payload in the request body', async () => {
            const result: number[] = [];
            for (const payload of sqlPayloads) {
                const response = await (client as any).createItem(null, { name: payload, description: payload }, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify no payload caused a 5xx', async () => {
            for (const status of statuses) {
                expect(status).toBeLessThan(500);
            }
        });
    });

    test('[TC-API-NNN] SQL injection in query parameters is rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send list request with an injected search parameter', async () => {
            return (client as any).listItems(null, null, {
                ...ANY_STATUS,
                params: { search: "' OR '1'='1'; DROP TABLE items;--" },
            });
        });

        await test.step('Step 2: Verify the response is not a 5xx', async () => {
            expect(response.status).toBeLessThan(500);
        });
    });

    // --- XSS (Cross-Site Scripting) ---

    test('[TC-API-NNN] XSS payloads in input are sanitized or rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const xssPayloads = [
            '<script>alert("xss")</script>',
            '<img src=x onerror=alert(1)>',
            '"><svg onload=alert(document.cookie)>',
            "javascript:alert('XSS')",
            '<iframe src="javascript:alert(1)">',
        ];

        const responses = await test.step('Step 1: Send each XSS payload in the request body', async () => {
            const result: any[] = [];
            for (const payload of xssPayloads) {
                result.push(await (client as any).createItem(null, { name: payload, description: payload }, ANY_STATUS));
            }
            return result;
        });

        await test.step('Step 2: Verify each payload was rejected (400) or stored without raw script content', async () => {
            for (const response of responses) {
                expect([201, 400]).toContain(response.status);
                if (response.status === 201) {
                    expect(response.data.name).not.toContain('<script>');
                    expect(response.data.name).not.toContain('onerror=');
                    expect(response.data.name).not.toContain('onload=');
                }
            }
        });
    });

    // --- Command Injection ---

    test('[TC-API-NNN] OS command injection in inputs is rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const cmdPayloads = ['; ls -la', '| cat /etc/passwd', '$(whoami)', '`id`', '& net user'];

        const statuses = await test.step('Step 1: Send each command-injection payload', async () => {
            const result: number[] = [];
            for (const payload of cmdPayloads) {
                const response = await (client as any).createItem(null, { name: payload, description: 'cmd injection test' }, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify no payload caused a 5xx', async () => {
            for (const status of statuses) {
                expect(status).toBeLessThan(500);
            }
        });
    });

    // --- Path Traversal ---

    test('[TC-API-NNN] path traversal in parameters is rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const traversalPayloads = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\config\\sam',
            '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
            '....//....//....//etc/passwd',
        ];

        const statuses = await test.step('Step 1: Send each traversal payload as the path ID', async () => {
            const result: number[] = [];
            for (const payload of traversalPayloads) {
                const response = await (client as any).getItemById({ id: payload }, null, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify every payload returned 400 or 404', async () => {
            for (const status of statuses) {
                expect([400, 404]).toContain(status);
            }
        });
    });

    // --- NoSQL Injection ---

    test('[TC-API-NNN] NoSQL injection payloads are rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        const nosqlPayloads = ['{"$gt": ""}', '{"$ne": null}', '{"$where": "sleep(5000)"}'];

        const statuses = await test.step('Step 1: Send each NoSQL payload as the path ID', async () => {
            const result: number[] = [];
            for (const payload of nosqlPayloads) {
                const response = await (client as any).getItemById({ id: payload }, null, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify no payload caused a 5xx', async () => {
            for (const status of statuses) {
                expect(status).toBeLessThan(500);
            }
        });
    });

    // --- Authentication & Authorization ---

    test('[TC-API-NNN] request without auth token returns 401', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send request with the Authorization header cleared', async () => {
            return (client as any).listItems(null, null, { ...ANY_STATUS, headers: { Authorization: '' } });
        });

        await test.step('Step 2: Verify 401 response', async () => {
            expect(response.status).toBe(401);
        });
    });

    test('[TC-API-NNN] request with invalid auth token returns 401', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send request with an invalid bearer token', async () => {
            return (client as any).listItems(null, null, {
                ...ANY_STATUS,
                headers: { Authorization: 'Bearer invalid-token-abc123' },
            });
        });

        await test.step('Step 2: Verify 401 or 403 response', async () => {
            expect([401, 403]).toContain(response.status);
        });
    });

    test('[TC-API-NNN] access another users resource returns 403', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step("Step 1: Request a resource owned by another user", async () => {
            return (client as any).getItemById({ id: 'other-user-item-id' }, null, ANY_STATUS);
        });

        await test.step('Step 2: Verify 403 or 404 response', async () => {
            expect([403, 404]).toContain(response.status);
        });
    });

    // --- Rate Limiting & Abuse ---

    test('[TC-API-NNN] rapid repeated requests are rate-limited', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const statuses = await test.step('Step 1: Send 50 requests in rapid succession', async () => {
            const result: number[] = [];
            for (let i = 0; i < 50; i++) {
                const response = await (client as any).listItems(null, null, ANY_STATUS);
                result.push(response.status);
            }
            return result;
        });

        await test.step('Step 2: Verify requests were rate-limited (429) or all succeeded', async () => {
            // If there is no rate limiting, all should be 200 (still valid, but flag for review)
            const hasRateLimit = statuses.includes(429);
            const allSucceeded = statuses.every((s) => s === 200);
            expect(hasRateLimit || allSucceeded).toBe(true);
        });
    });

    // --- Header Injection ---

    test('[TC-API-NNN] CRLF injection in headers is rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const outcome = await test.step('Step 1: Send request with a CRLF sequence in a header', async () => {
            try {
                const response = await (client as any).listItems(null, null, {
                    ...ANY_STATUS,
                    headers: { 'X-Custom': 'value\r\nInjected-Header: malicious' },
                });
                return { status: response.status as number };
            } catch (error: any) {
                // Node's HTTP client refuses to send invalid header characters — also a pass.
                return { clientRejected: error.code === 'ERR_INVALID_CHAR' };
            }
        });

        await test.step('Step 2: Verify the request was refused client-side or did not cause a 5xx', async () => {
            if ('status' in outcome) expect(outcome.status).toBeLessThan(500);
            else expect(outcome.clientRejected).toBe(true);
        });
    });

    // --- Response Security Headers ---

    test('[TC-API-NNN] response includes security headers', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send GET request to /items', async () => {
            return (client as any).listItems();
        });

        await test.step('Step 2: Verify security headers have safe values', async () => {
            // Adapt to your API — not every API sets every header.
            expect(response.headers['x-content-type-options']).toBe('nosniff');
            expect(['DENY', 'SAMEORIGIN']).toContain(response.headers['x-frame-options']);
            // expect(response.headers['strict-transport-security']).toBeDefined(); // HSTS
            // expect(response.headers['content-security-policy']).toBeDefined();
        });
    });

    // --- Mass Assignment / Unexpected Fields ---

    test('[TC-API-NNN] extra/unexpected fields in body are ignored or rejected', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await test.step('Step 1: Send POST request with privileged extra fields', async () => {
            return (client as any).createItem(null, {
                name: 'Normal Item',
                description: 'Valid description',
                isAdmin: true,              // unexpected field — should be ignored
                role: 'superuser',          // unexpected field — should be ignored
                __proto__: { admin: true }, // prototype pollution attempt
            }, ANY_STATUS);
        });

        await test.step('Step 2: Verify the request was rejected or the extra fields were not persisted', async () => {
            expect([201, 400]).toContain(response.status);
            if (response.status === 201) {
                expect(response.data).not.toHaveProperty('isAdmin');
                expect(response.data).not.toHaveProperty('role');
            }
        });
    });
});
```

**Key points:**
- Operations are called by `operationId` from the OpenAPI spec
- Path params go in the first argument as an object
- Request body goes in the second argument
- Axios request config (headers, query params, `validateStatus`) goes in the third argument
- Response has `.status`, `.data`, `.headers`
- **Always include positive, negative, and security test sections**
- Positive tests verify happy-path behavior with valid inputs
- Negative tests verify proper error handling (400, 404, 422) for invalid inputs
- Security tests verify the API rejects injection attempts without 500 errors
- For requests expected to fail, pass `{ validateStatus: () => true }` and assert on `response.status`. **Never** use `try { ... } catch { expect(...) }`: if the request unexpectedly succeeds, nothing is asserted and the test passes silently
- Security assertion rule: **the server must never return 500** for malicious input (indicates unhandled injection)
- Adapt security payloads to the specific API context (e.g., add LDAP injection for directory services)

---

## Skill 2: Create a Database Test

**When to use:** Testing database queries, data integrity, or stored procedures.

**Steps:**

1. Create a file matching `**/examples/{database,kafka,redis}.spec.ts` or update `testMatch`
2. Use the `databaseClient` fixture
3. Use parameterized queries (never string interpolation)
4. Replace every `TC-DB-NNN` with IDs from `npm run next-id -- DB <count>`

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Database — [Feature/Table Name]', () => {
    test('[TC-DB-NNN] query records with filter', { tag: ['@TC-DB-NNN'] }, async ({ databaseClient }) => {
        const rows = await test.step('Step 1: Query active orders created after 2024-01-01', async () => {
            return databaseClient.query<{ id: number; name: string; status: string }>(
                'SELECT id, name, status FROM orders WHERE status = $1 AND created_at > $2',
                ['active', '2024-01-01']
            );
        });

        await test.step('Step 2: Verify only active orders were returned', async () => {
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row.status).toBe('active');
            }
        });
    });

    test('[TC-DB-NNN] insert and verify record', { tag: ['@TC-DB-NNN'] }, async ({ databaseClient }) => {
        await test.step('Step 1: Insert a test order', async () => {
            const result = await databaseClient.execute(
                'INSERT INTO orders (name, status, amount) VALUES ($1, $2, $3)',
                ['Test Order', 'pending', 99.99]
            );
            expect(result.affectedRows).toBe(1);
        });

        await test.step('Step 2: Verify the order can be read back', async () => {
            const rows = await databaseClient.query<{ name: string }>(
                'SELECT name FROM orders WHERE name = $1',
                ['Test Order']
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].name).toBe('Test Order');
        });

        await test.step('Step 3: Delete the test order', async () => {
            await databaseClient.execute('DELETE FROM orders WHERE name = $1', ['Test Order']);
        });
    });

    test('[TC-DB-NNN] update records', { tag: ['@TC-DB-NNN'] }, async ({ databaseClient }) => {
        const result = await test.step('Step 1: Mark pending orders as completed', async () => {
            return databaseClient.execute(
                'UPDATE orders SET status = $1 WHERE status = $2',
                ['completed', 'pending']
            );
        });

        await test.step('Step 2: Verify no pending orders remain', async () => {
            expect(result.affectedRows).toBeGreaterThanOrEqual(0);
            const pending = await databaseClient.query('SELECT id FROM orders WHERE status = $1', ['pending']);
            expect(pending).toEqual([]);
        });
    });

    test('[TC-DB-NNN] empty result returns empty array', { tag: ['@TC-DB-NNN'] }, async ({ databaseClient }) => {
        const rows = await test.step('Step 1: Query an ID that does not exist', async () => {
            return databaseClient.query('SELECT * FROM orders WHERE id = $1', [-999]);
        });

        await test.step('Step 2: Verify an empty array is returned', async () => {
            expect(rows).toEqual([]);
        });
    });
});
```

**Key points:**
- `query<T>()` returns typed rows as `T[]`
- `execute()` returns `{ affectedRows: number }`
- Always use `$1`, `$2`, etc. for parameters — never template literals
- Empty results return `[]`, not `null`
- Insert test rows with `databaseClient.insert()`: they are deleted after the test, pass or fail (see Skill 13). Raw `execute()` inserts need `testData.cleanup()`

---

## Skill 3: Create a Kafka Test

**When to use:** Testing event-driven flows, message production/consumption.

**Steps:**

1. Use the `kafkaClient` fixture
2. Produce messages with key/value pairs
3. Consume with timeout and count options
4. Replace every `TC-KFK-NNN` with IDs from `npm run next-id -- KFK <count>`

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Kafka — [Event/Topic Name]', () => {
    test('[TC-KFK-NNN] produce event messages', { tag: ['@TC-KFK-NNN'] }, async ({ kafkaClient }) => {
        await test.step('Step 1: Produce two user events', async () => {
            // produce() resolves when the broker acknowledges; it throws on failure.
            await kafkaClient.produce('user-events', [
                { key: 'user-1', value: JSON.stringify({ event: 'created', userId: '1', timestamp: Date.now() }) },
                { key: 'user-2', value: JSON.stringify({ event: 'updated', userId: '2', timestamp: Date.now() }) },
            ]);
        });
    });

    test('[TC-KFK-NNN] produce and consume round-trip', { tag: ['@TC-KFK-NNN'] }, async ({ kafkaClient }) => {
        const topic = 'test-notifications';
        const payload = { type: 'alert', message: 'System update', severity: 'info' };

        await test.step('Step 1: Produce an alert message', async () => {
            await kafkaClient.produce(topic, [{ key: 'alert-1', value: JSON.stringify(payload) }]);
        });

        const messages = await test.step('Step 2: Consume one message from the topic', async () => {
            return kafkaClient.consume(topic, { count: 1, timeout: 10000, fromBeginning: true });
        });

        await test.step('Step 3: Verify the consumed message matches the payload', async () => {
            expect(messages).toHaveLength(1);
            expect(messages[0].topic).toBe(topic);
            expect(JSON.parse(messages[0].value.toString())).toEqual(payload);
        });
    });

    test('[TC-KFK-NNN] consume with timeout returns empty on no messages', { tag: ['@TC-KFK-NNN'] }, async ({ kafkaClient }) => {
        const messages = await test.step('Step 1: Consume from an empty topic with a short timeout', async () => {
            return kafkaClient.consume('empty-topic', { timeout: 2000, fromBeginning: true });
        });

        await test.step('Step 2: Verify an empty array is returned', async () => {
            expect(messages).toEqual([]);
        });
    });
});
```

**Key points:**
- Messages are `{ key: string, value: string }` — serialize objects with `JSON.stringify()`
- Consumed messages have: `topic`, `value`, `key`, `partition`, `offset`
- `consume()` returns `[]` on timeout (does not throw)
- Each test gets a unique consumer group ID automatically

---

## Skill 4: Create a Redis Test

**When to use:** Testing caching, session storage, pub/sub messaging.

Replace every `TC-RDS-NNN` with IDs from `npm run next-id -- RDS <count>`. For common sequences, `RedisSteps` in `src/steps/` already wraps each call in a step.

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Redis — [Feature Name]', () => {
    test('[TC-RDS-NNN] set and get values', { tag: ['@TC-RDS-NNN'] }, async ({ redisClient }) => {
        await test.step('Step 1: Store a JSON user profile', async () => {
            await redisClient.set('user:1:profile', JSON.stringify({ name: 'Alice', role: 'admin' }));
        });

        await test.step('Step 2: Read the profile back and verify its fields', async () => {
            const raw = await redisClient.get('user:1:profile');
            expect(raw).not.toBeNull();
            const profile = JSON.parse(raw!);
            expect(profile.name).toBe('Alice');
            expect(profile.role).toBe('admin');
        });
    });

    test('[TC-RDS-NNN] set with TTL expiration', { tag: ['@TC-RDS-NNN'] }, async ({ redisClient }) => {
        await test.step('Step 1: Store a session value with a 5-minute TTL', async () => {
            await redisClient.set('session:token123', 'active', 300);
        });

        await test.step('Step 2: Verify the value is readable before expiry', async () => {
            expect(await redisClient.get('session:token123')).toBe('active');
        });
    });

    test('[TC-RDS-NNN] delete keys', { tag: ['@TC-RDS-NNN'] }, async ({ redisClient }) => {
        await test.step('Step 1: Store a temporary value', async () => {
            await redisClient.set('temp:data', 'will-be-deleted');
        });

        await test.step('Step 2: Delete the key and verify one key was removed', async () => {
            expect(await redisClient.del('temp:data')).toBe(1);
        });

        await test.step('Step 3: Verify the key no longer exists', async () => {
            expect(await redisClient.get('temp:data')).toBeNull();
        });
    });

    test('[TC-RDS-NNN] pub/sub messaging', { tag: ['@TC-RDS-NNN'] }, async ({ redisClient }) => {
        const channel = 'events:user';
        const message = JSON.stringify({ action: 'logout', userId: '42' });

        // Subscribe FIRST, then publish
        const subscribePromise = redisClient.subscribe(channel, { timeout: 5000 });

        await test.step('Step 1: Wait for the subscription to become active', async () => {
            await new Promise((r) => setTimeout(r, 100));
        });

        await test.step('Step 2: Publish a message and verify at least one receiver', async () => {
            expect(await redisClient.publish(channel, message)).toBeGreaterThanOrEqual(1);
        });

        await test.step('Step 3: Verify the subscriber received the message', async () => {
            expect(await subscribePromise).toBe(message);
        });
    });

    test('[TC-RDS-NNN] get non-existent key returns null', { tag: ['@TC-RDS-NNN'] }, async ({ redisClient }) => {
        await test.step('Step 1: Read a key that was never set and verify null', async () => {
            expect(await redisClient.get('does:not:exist')).toBeNull();
        });
    });
});
```

**Key points:**
- `set(key, value, ttl?)` — TTL is in seconds, optional
- `get(key)` returns `string | null`
- `del(key)` returns number of keys removed
- For pub/sub: subscribe before publishing, add a small delay
- Keys are automatically prefixed if `PW_REDIS_KEY_PREFIX` is set

---

## Skill 5: Create a Mobile Test (Appium)

**When to use:** Testing native iOS or Android apps through an Appium server: local Appium with an emulator, simulator or device, Selenium Grid, or a cloud farm. For a GADS device farm, see Skill 17. The test code is the same, and only the config changes.

Replace every `TC-APM-NNN` with IDs from `npm run next-id -- APM <count>`. `MOB` is retired, so don't use it.

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Mobile — [Screen/Flow Name]', () => {
    test('[TC-APM-NNN] log in and see the welcome screen', { tag: ['@TC-APM-NNN'] }, async ({ appiumDriver }) => {
        await test.step('Step 1: Open the login screen via deep link', async () => {
            await appiumDriver.url('myapp://login');
        });

        await test.step('Step 2: Fill in the credentials and submit', async () => {
            // '~id' = accessibility id. Also: 'id=...', '//xpath',
            // 'android=new UiSelector()...', '-ios predicate string:...', '-ios class chain:...'
            await appiumDriver.$('~email').setValue('user@example.com');
            await appiumDriver.$('~password').setValue('secret');
            await appiumDriver.$('~login').click();
        });

        await test.step('Step 3: Verify the welcome title is displayed', async () => {
            const title = appiumDriver.$('~welcome-title');
            await title.waitForDisplayed({ timeout: 15_000 });
            expect(await title.getText()).toContain('Welcome');
        });
    });

    test('[TC-APM-NNN] gestures and app control', { tag: ['@TC-APM-NNN'] }, async ({ appiumDriver }) => {
        const appId = 'com.example.app';

        await test.step('Step 1: Bring the app to the foreground', async () => {
            await appiumDriver.execute('mobile: activateApp', { bundleId: appId, appId });
        });

        await test.step('Step 2: Swipe up on the screen', async () => {
            await appiumDriver.execute('mobile: swipe', { direction: 'up' });
        });

        await test.step('Step 3: Press the platform back action', async () => {
            if (appiumDriver.isAndroid) {
                await appiumDriver.execute('mobile: pressKey', { keycode: 4 }); // KEYCODE_BACK
            } else {
                await appiumDriver.$('~Back').click();
            }
        });
    });
});
```

**Key points:**
- `appiumDriver` is a WebdriverIO `Browser`, so the full [WebdriverIO API](https://webdriver.io/docs/api) is available. Assert with Playwright's `expect`.
- Configure with `appium` in `environments.json` or `PW_APPIUM_*`: `serverUrl`, `platform`, plus optional `udid`, `deviceName`, `app` and `capabilities`. See [docs/appium-fixture.md](docs/appium-fixture.md).
- The session is deleted on teardown, which frees the device.
- `AppiumSteps` (`src/steps`) wraps tap, fill, expectText and attachScreenshot in `test.step()`.
- Give mobile projects a long `timeout` (e.g. `300_000`), because creating a session can include installing the app.

---

## Skill 6: Create a MongoDB Test

**When to use:** Testing document-based data operations, NoSQL queries, and aggregation pipelines.

**Steps:**

1. Create a file matching `**/examples/mongodb.spec.ts` or update `testMatch`
2. Use the `mongoDbClient` fixture
3. Use MongoDB query operators (`$set`, `$group`, etc.) for updates and aggregations
4. Replace every `TC-MDB-NNN` with IDs from `npm run next-id -- MDB <count>`

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('MongoDB — [Collection/Feature Name]', () => {
    test('[TC-MDB-NNN] find documents with filter and options', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const users = await test.step('Step 1: Find up to 10 active users sorted by name', async () => {
            return mongoDbClient.find<{ name: string; email: string; active: boolean }>(
                'users',
                { active: true },
                { limit: 10, sort: { name: 1 }, projection: { name: 1, email: 1 } }
            );
        });

        await test.step('Step 2: Verify each document has the projected fields', async () => {
            expect(Array.isArray(users)).toBe(true);
            for (const user of users) {
                expect(user).toHaveProperty('name');
                expect(user).toHaveProperty('email');
            }
        });
    });

    test('[TC-MDB-NNN] find a single document', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        await test.step('Step 1: Seed a known user', async () => {
            await mongoDbClient.insertOne('users', { name: 'Admin', email: 'admin@example.com' });
        });

        const user = await test.step('Step 2: Find the user by email', async () => {
            return mongoDbClient.findOne<{ name: string; email: string }>('users', { email: 'admin@example.com' });
        });

        await test.step('Step 3: Verify the document was found', async () => {
            // findOne returns null if no document matches
            expect(user).not.toBeNull();
            expect(user!.name).toBe('Admin');
        });

        await test.step('Step 4: Delete the seeded user', async () => {
            await mongoDbClient.deleteOne('users', { email: 'admin@example.com' });
        });
    });

    test('[TC-MDB-NNN] insert a single document', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const result = await test.step('Step 1: Insert a test user', async () => {
            return mongoDbClient.insertOne('users', {
                name: 'Test User',
                email: 'test@example.com',
                active: true,
                createdAt: new Date().toISOString(),
            });
        });

        await test.step('Step 2: Verify the insert was acknowledged with an ID', async () => {
            expect(result.acknowledged).toBe(true);
            expect(result.insertedId).toBeDefined();
        });
    });

    test('[TC-MDB-NNN] insert multiple documents', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const result = await test.step('Step 1: Insert two users', async () => {
            return mongoDbClient.insertMany('users', [
                { name: 'User A', email: 'a@example.com', active: true },
                { name: 'User B', email: 'b@example.com', active: false },
            ]);
        });

        await test.step('Step 2: Verify both inserts were acknowledged', async () => {
            expect(result.acknowledged).toBe(true);
            expect(result.insertedCount).toBe(2);
        });
    });

    test('[TC-MDB-NNN] update a document', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const result = await test.step('Step 1: Deactivate the test user', async () => {
            return mongoDbClient.updateOne(
                'users',
                { email: 'test@example.com' },
                { $set: { active: false, updatedAt: new Date().toISOString() } }
            );
        });

        await test.step('Step 2: Verify the update was acknowledged', async () => {
            expect(result.acknowledged).toBe(true);
            expect(result.matchedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-NNN] update multiple documents', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const result = await test.step('Step 1: Archive all inactive users', async () => {
            return mongoDbClient.updateMany('users', { active: false }, { $set: { archived: true } });
        });

        await test.step('Step 2: Verify the update was acknowledged', async () => {
            expect(result.acknowledged).toBe(true);
            expect(result.modifiedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-NNN] delete a document', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const result = await test.step('Step 1: Delete the test user', async () => {
            return mongoDbClient.deleteOne('users', { email: 'test@example.com' });
        });

        await test.step('Step 2: Verify the delete was acknowledged', async () => {
            expect(result.acknowledged).toBe(true);
            expect(result.deletedCount).toBeGreaterThanOrEqual(0);
        });
    });

    test('[TC-MDB-NNN] run an aggregation pipeline', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const results = await test.step('Step 1: Group users by active flag and count', async () => {
            return mongoDbClient.aggregate<{ _id: boolean; count: number }>('users', [
                { $group: { _id: '$active', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]);
        });

        await test.step('Step 2: Verify each group has an _id and a count', async () => {
            expect(Array.isArray(results)).toBe(true);
            for (const group of results) {
                expect(group).toHaveProperty('_id');
                expect(group.count).toBeGreaterThan(0);
            }
        });
    });

    test('[TC-MDB-NNN] empty result returns empty array', { tag: ['@TC-MDB-NNN'] }, async ({ mongoDbClient }) => {
        const docs = await test.step('Step 1: Find users with an email that does not exist', async () => {
            return mongoDbClient.find('users', { email: 'nonexistent@nowhere.com' });
        });

        await test.step('Step 2: Verify an empty array is returned', async () => {
            expect(docs).toEqual([]);
        });
    });
});
```

**Key points:**
- `find<T>(collection, filter?, options?)` returns `T[]` — empty array if no matches
- `findOne<T>(collection, filter?)` returns `T | null`
- `insertOne()` returns `{ insertedId, acknowledged }`
- `insertMany()` returns `{ insertedIds, insertedCount, acknowledged }`
- `updateOne()` / `updateMany()` returns `{ matchedCount, modifiedCount, upsertedId, acknowledged }`
- `deleteOne()` / `deleteMany()` returns `{ deletedCount, acknowledged }`
- `aggregate<T>(collection, pipeline, options?)` returns `T[]`
- Find options: `limit`, `skip`, `sort` (1 asc / -1 desc), `projection` (1 include / 0 exclude)
- Use MongoDB update operators (`$set`, `$unset`, `$inc`, `$push`, etc.)

---

## Skill 7: Create a GraphQL Test

**When to use:** Testing GraphQL APIs — queries, mutations, error handling, and authentication flows.

**Steps:**

1. Create a file matching your project's `testMatch` pattern (e.g., `tests/examples/graphql.spec.ts`)
2. Use the `graphqlClient` fixture
3. Use `query()` for reads, `mutate()` for writes, `rawRequest()` for error inspection
4. Replace every `TC-GQL-NNN` with IDs from `npm run next-id -- GQL <count>`

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('GraphQL — [Feature Name]', () => {
    test('[TC-GQL-NNN] execute a query', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        const data = await test.step('Step 1: Query all users', async () => {
            return graphqlClient.query<{ users: Array<{ id: string; name: string; email: string }> }>(`
                query {
                    users { id name email }
                }
            `);
        });

        await test.step('Step 2: Verify a non-empty list of users with names', async () => {
            expect(data.users).toBeInstanceOf(Array);
            expect(data.users[0]).toHaveProperty('name');
        });
    });

    test('[TC-GQL-NNN] query with variables', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        const data = await test.step('Step 1: Query user 123 using a variable', async () => {
            return graphqlClient.query<{ user: { id: string; name: string } | null }>(
                `query GetUser($id: ID!) {
                    user(id: $id) { id name }
                }`,
                { id: '123' }
            );
        });

        await test.step('Step 2: Verify the user was returned', async () => {
            expect(data.user).not.toBeNull();
            expect(data.user!.name).toBeDefined();
        });
    });

    test('[TC-GQL-NNN] execute a mutation', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        const data = await test.step('Step 1: Create a user via mutation', async () => {
            return graphqlClient.mutate<{ createUser: { id: string; name: string } }>(
                `mutation CreateUser($input: CreateUserInput!) {
                    createUser(input: $input) { id name }
                }`,
                { input: { name: 'Alice', email: 'alice@example.com' } }
            );
        });

        await test.step('Step 2: Verify the created user has an ID and the given name', async () => {
            expect(data.createUser.id).toBeDefined();
            expect(data.createUser.name).toBe('Alice');
        });
    });

    test('[TC-GQL-NNN] handle errors with rawRequest', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        const response = await test.step('Step 1: Query a non-existent user with rawRequest', async () => {
            // rawRequest returns errors in the response instead of throwing
            return graphqlClient.rawRequest<{ user: null }>(`{ user(id: "nonexistent") { id name } }`);
        });

        await test.step('Step 2: Verify the response carries a GraphQL error', async () => {
            expect(response.errors).toBeDefined();
            expect(response.errors![0].message).toBeDefined();
            expect(response.errors![0]).toHaveProperty('locations');
        });
    });

    test('[TC-GQL-NNN] authenticated request with dynamic token', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Set the auth token (e.g. from a login mutation)', async () => {
            graphqlClient.setAuthToken('jwt-token-from-login');
        });

        await test.step('Step 2: Query the current user and verify the email', async () => {
            const data = await graphqlClient.query<{ me: { email: string } }>(`query { me { email } }`);
            expect(data.me.email).toBeDefined();
        });
    });

    test('[TC-GQL-NNN] request with custom headers', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        await test.step('Step 1: Send a query with a correlation-ID header and verify data', async () => {
            const data = await graphqlClient.query(
                `{ __schema { queryType { name } } }`,
                undefined,
                { headers: { 'X-Request-ID': 'test-correlation-123' } }
            );
            expect(data).toBeDefined();
        });
    });

    test('[TC-GQL-NNN] introspection query works', { tag: ['@TC-GQL-NNN'] }, async ({ graphqlClient }) => {
        const data = await test.step('Step 1: Run an introspection query', async () => {
            return graphqlClient.query<{ __schema: { queryType: { name: string } } }>(
                `{ __schema { queryType { name } } }`
            );
        });

        await test.step('Step 2: Verify the root query type is named Query', async () => {
            expect(data.__schema.queryType.name).toBe('Query');
        });
    });
});
```

**Key points:**
- `query<T>(document, variables?, options?)` — executes a query, returns typed data directly
- `mutate<T>(document, variables?, options?)` — executes a mutation, same return pattern
- `rawRequest<T>(document, variables?, options?)` — returns `{ data, errors }` (does not throw on GraphQL errors)
- `setAuthToken(token)` — sets `Authorization: Bearer <token>` for all subsequent requests
- `setHeader(key, value)` — sets a default header for all subsequent requests
- Per-request options: `headers`, `operationName`, `signal` (AbortSignal)
- Use `rawRequest()` when testing error scenarios — it returns errors in the response object
- The client is HTTP-based (stateless) — no connection teardown needed

---

## Skill 8: Create a Browser Test

**When to use:** Testing web UI in Chromium, Firefox, or WebKit.

**Steps:**

1. Create a file matching `**/examples/browser.spec.ts` or add a new `testMatch`
2. Use the standard Playwright `page` fixture
3. Always include functional tests, responsiveness checks, accessibility (ARIA) coverage, and console error tracking
4. Replace every `TC-BRW-NNN` with IDs from `npm run next-id -- BRW <count>`, including the IDs inside parameterized test data

**Template:**

```typescript
import { test, expect } from '../../src';
import type { ConsoleMessage } from '@playwright/test'; // type-only imports from @playwright/test are fine

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL TESTS — Core user interactions and navigation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Functional', () => {
    test('[TC-BRW-NNN] navigate and interact with page', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to login page', async () => {
            await page.goto('/login');
        });

        await test.step('Step 2: Fill in credentials and submit', async () => {
            await page.getByLabel('Email').fill('user@example.com');
            await page.getByLabel('Password').fill('secret123');
            await page.getByRole('button', { name: 'Sign In' }).click();
        });

        await test.step('Step 3: Verify redirect to dashboard', async () => {
            await expect(page).toHaveURL('/dashboard');
            await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
        });
    });

    test('[TC-BRW-NNN] form validation shows error messages', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to login page', async () => {
            await page.goto('/login');
        });

        await test.step('Step 2: Submit the empty form', async () => {
            await page.getByRole('button', { name: 'Sign In' }).click();
        });

        await test.step('Step 3: Verify validation messages are displayed', async () => {
            await expect(page.getByText('Email is required')).toBeVisible();
            await expect(page.getByText('Password is required')).toBeVisible();
        });
    });

    test('[TC-BRW-NNN] API response validation via network', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const response = await test.step('Step 1: Navigate to /users and capture the users API call', async () => {
            const responsePromise = page.waitForResponse('**/api/users');
            await page.goto('/users');
            return responsePromise;
        });

        await test.step('Step 2: Verify the API call returned 200', async () => {
            expect(response.status()).toBe(200);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSIVENESS TESTS — Viewport sizes, layout breakpoints, mobile behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Responsiveness', () => {
    // Parameterized: each generated test needs its own ID in the data.
    const viewports = [
        { id: 'TC-BRW-NNN', name: 'Mobile S (320px)', width: 320, height: 568 },
        { id: 'TC-BRW-NNN', name: 'Mobile M (375px)', width: 375, height: 667 },
        { id: 'TC-BRW-NNN', name: 'Mobile L (425px)', width: 425, height: 812 },
        { id: 'TC-BRW-NNN', name: 'Tablet (768px)', width: 768, height: 1024 },
        { id: 'TC-BRW-NNN', name: 'Laptop (1024px)', width: 1024, height: 768 },
        { id: 'TC-BRW-NNN', name: 'Desktop (1440px)', width: 1440, height: 900 },
        { id: 'TC-BRW-NNN', name: 'Wide (1920px)', width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
        test(`[${viewport.id}] renders correctly at ${viewport.name}`, { tag: [`@${viewport.id}`] }, async ({ page }) => {
            await test.step(`Step 1: Load the home page at ${viewport.width}x${viewport.height}`, async () => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                await page.goto('/');
            });

            await test.step('Step 2: Verify content fits the viewport with no horizontal overflow', async () => {
                const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
                expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding
            });

            await test.step('Step 3: Verify key landmarks are visible', async () => {
                await expect(page.getByRole('navigation')).toBeVisible();
                await expect(page.getByRole('main')).toBeVisible();
            });
        });
    }

    test('[TC-BRW-NNN] mobile navigation menu toggles correctly', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page at mobile width', async () => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
        });

        await test.step('Step 2: Verify the desktop navigation is hidden', async () => {
            await expect(page.getByTestId('desktop-nav')).toBeHidden();
        });

        await test.step('Step 3: Open the hamburger menu and verify navigation is shown', async () => {
            await page.getByRole('button', { name: /menu|toggle/i }).click();
            await expect(page.getByRole('navigation')).toBeVisible();
        });
    });

    test('[TC-BRW-NNN] images and media are responsive', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page at mobile width', async () => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
        });

        await test.step('Step 2: Verify no image is wider than the viewport', async () => {
            const overflowingImages = await page.evaluate(() =>
                Array.from(document.querySelectorAll('img')).filter(
                    (img) => img.getBoundingClientRect().width > window.innerWidth
                ).length
            );
            expect(overflowingImages).toBe(0);
        });
    });

    test('[TC-BRW-NNN] text remains readable at small viewports', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page at 320px width', async () => {
            await page.setViewportSize({ width: 320, height: 568 });
            await page.goto('/');
        });

        await test.step('Step 2: Verify no visible text is smaller than 12px', async () => {
            const tooSmallText = await page.evaluate(() =>
                Array.from(document.querySelectorAll('body *')).filter((el) => {
                    const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
                    return el.textContent?.trim() && fontSize < 12;
                }).length
            );
            expect(tooSmallText).toBe(0);
        });
    });

    test('[TC-BRW-NNN] touch targets meet minimum size on mobile', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page at mobile width', async () => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
        });

        await test.step('Step 2: Verify interactive elements are at least 44x44px (WCAG 2.5.5)', async () => {
            const smallTargets = await page.evaluate(() =>
                Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'))
                    .map((el) => el.getBoundingClientRect())
                    .filter((r) => r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44)).length
            );
            // Use expect.soft to report without stopping the test, if strict enforcement is not required.
            expect.soft(smallTargets, 'touch targets smaller than 44x44px').toBe(0);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY (ARIA) TESTS — Roles, labels, landmarks, keyboard navigation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Accessibility', () => {
    test('[TC-BRW-NNN] page has correct landmark structure', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        await test.step('Step 2: Verify banner, navigation, main and contentinfo landmarks are visible', async () => {
            await expect(page.getByRole('banner')).toBeVisible();       // <header>
            await expect(page.getByRole('navigation')).toBeVisible();   // <nav>
            await expect(page.getByRole('main')).toBeVisible();         // <main>
            await expect(page.getByRole('contentinfo')).toBeVisible();  // <footer>
        });
    });

    test('[TC-BRW-NNN] all images have alt text', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        await test.step('Step 2: Verify every non-presentational image has an alt attribute', async () => {
            const imagesWithoutAlt = await page.evaluate(() =>
                Array.from(document.querySelectorAll('img')).filter(
                    (img) => !img.hasAttribute('alt') && !img.getAttribute('role')?.includes('presentation')
                ).length
            );
            expect(imagesWithoutAlt).toBe(0);
        });
    });

    test('[TC-BRW-NNN] all form inputs have associated labels', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to login page', async () => {
            await page.goto('/login');
        });

        await test.step('Step 2: Verify every visible input has a label, aria-label or aria-labelledby', async () => {
            const unlabeledInputs = await page.evaluate(() =>
                Array.from(document.querySelectorAll('input, select, textarea')).filter((input) => {
                    const id = input.getAttribute('id');
                    const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                    const isHidden = input.getAttribute('type') === 'hidden';
                    return !isHidden && !hasLabel && !input.getAttribute('aria-label') && !input.getAttribute('aria-labelledby');
                }).length
            );
            expect(unlabeledInputs).toBe(0);
        });
    });

    test('[TC-BRW-NNN] heading hierarchy is correct (no skipped levels)', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        const headingIssues = await test.step('Step 2: Collect heading-level issues', async () => {
            return page.evaluate(() => {
                const levels = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).map((h) => parseInt(h.tagName[1]));
                const issues: string[] = [];
                if (levels.length > 0 && levels[0] !== 1) issues.push('First heading is not h1');
                for (let i = 1; i < levels.length; i++) {
                    if (levels[i] > levels[i - 1] + 1) issues.push(`Skipped heading level: h${levels[i - 1]} → h${levels[i]}`);
                }
                return issues;
            });
        });

        await test.step('Step 3: Verify the heading hierarchy has no issues', async () => {
            expect(headingIssues).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] interactive elements are keyboard accessible', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to login page', async () => {
            await page.goto('/login');
        });

        await test.step('Step 2: Press Tab and verify focus moved to an element', async () => {
            await page.keyboard.press('Tab');
            const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
            expect(focusedTag).not.toBe('BODY');
        });

        await test.step('Step 3: Verify the focused element has a visible focus indicator', async () => {
            const hasFocusStyle = await page.evaluate(() => {
                const el = document.activeElement;
                if (!el) return false;
                const style = window.getComputedStyle(el);
                return style.outlineStyle !== 'none' || style.boxShadow !== 'none';
            });
            expect(hasFocusStyle).toBe(true);
        });
    });

    test('[TC-BRW-NNN] buttons and links have accessible names', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        await test.step('Step 2: Verify every button and link has text, aria-label, aria-labelledby or title', async () => {
            const unlabeled = await page.evaluate(() =>
                Array.from(document.querySelectorAll('a, button, [role="button"], [role="link"]')).filter(
                    (el) => !el.textContent?.trim() && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && !el.getAttribute('title')
                ).length
            );
            expect(unlabeled).toBe(0);
        });
    });

    test('[TC-BRW-NNN] color contrast meets WCAG AA standards', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        const lowContrastElements = await test.step('Step 2: Count text elements below the WCAG AA contrast ratio', async () => {
            return page.evaluate(() => {
                const luminance = (r: number, g: number, b: number) => {
                    const [rs, gs, bs] = [r, g, b].map((c) => {
                        c = c / 255;
                        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                    });
                    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
                };
                const parse = (color: string): [number, number, number] | null => {
                    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                    return m ? [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])] : null;
                };

                let failCount = 0;
                document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button').forEach((el) => {
                    const style = window.getComputedStyle(el);
                    const fg = parse(style.color);
                    const bg = parse(style.backgroundColor);
                    if (!fg || !bg) return;
                    const [l1, l2] = [luminance(...fg), luminance(...bg)];
                    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
                    const fontSize = parseFloat(style.fontSize);
                    const isBold = parseInt(style.fontWeight) >= 700;
                    // WCAG AA: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold)
                    const threshold = fontSize >= 18 || (fontSize >= 14 && isBold) ? 3 : 4.5;
                    if (ratio < threshold) failCount++;
                });
                return failCount;
            });
        });

        await test.step('Step 3: Verify fewer than 5 low-contrast elements', async () => {
            // Allow some tolerance — complex backgrounds may cause false positives
            expect(lowContrastElements).toBeLessThan(5);
        });
    });

    test('[TC-BRW-NNN] ARIA roles are used correctly', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to the home page', async () => {
            await page.goto('/');
        });

        await test.step('Step 2: Verify every role attribute is a valid WAI-ARIA role', async () => {
            const ariaIssues = await page.evaluate(() => {
                const validRoles = new Set([
                    'alert', 'alertdialog', 'application', 'article', 'banner', 'button',
                    'cell', 'checkbox', 'columnheader', 'combobox', 'complementary',
                    'contentinfo', 'definition', 'dialog', 'directory', 'document',
                    'feed', 'figure', 'form', 'grid', 'gridcell', 'group', 'heading',
                    'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main',
                    'marquee', 'math', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox',
                    'menuitemradio', 'navigation', 'none', 'note', 'option', 'presentation',
                    'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup',
                    'rowheader', 'scrollbar', 'search', 'searchbox', 'separator', 'slider',
                    'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel',
                    'term', 'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem',
                ]);
                return Array.from(document.querySelectorAll('[role]'))
                    .filter((el) => !validRoles.has(el.getAttribute('role')!))
                    .map((el) => `Invalid role="${el.getAttribute('role')}" on <${el.tagName.toLowerCase()}>`);
            });
            expect(ariaIssues).toEqual([]);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLE ERROR TRACKING — Catch JS errors, failed requests, deprecation warnings
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Console & Error Tracking', () => {
    test('[TC-BRW-NNN] page loads without JavaScript errors', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const errors: string[] = [];

        await test.step('Step 1: Start collecting console errors and uncaught exceptions', async () => {
            page.on('console', (msg: ConsoleMessage) => {
                if (msg.type() === 'error') errors.push(msg.text());
            });
            page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify no critical errors were logged', async () => {
            // Filter out known/acceptable errors (e.g., third-party scripts)
            const critical = errors.filter((e) => !e.includes('third-party-script') && !e.includes('favicon'));
            expect(critical).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] no failed network requests on page load', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const failedRequests: { url: string; status: number }[] = [];

        await test.step('Step 1: Start recording responses with status >= 400', async () => {
            page.on('response', (response) => {
                if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() });
            });
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify no unexpected failed requests', async () => {
            const unexpected = failedRequests.filter((r) => !r.url.includes('favicon') && !r.url.includes('analytics'));
            expect(unexpected).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] no console warnings about deprecated APIs', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const deprecations: string[] = [];

        await test.step('Step 1: Start collecting deprecation warnings', async () => {
            page.on('console', (msg: ConsoleMessage) => {
                if (msg.type() === 'warning' && /deprecated/i.test(msg.text())) deprecations.push(msg.text());
            });
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify no deprecation warnings were logged', async () => {
            expect(deprecations).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] no mixed content warnings (HTTP on HTTPS page)', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const mixedContent: string[] = [];

        await test.step('Step 1: Start collecting mixed-content warnings', async () => {
            page.on('console', (msg: ConsoleMessage) => {
                if (/mixed content/i.test(msg.text())) mixedContent.push(msg.text());
            });
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            // Only relevant for HTTPS pages
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify no mixed-content warnings were logged', async () => {
            expect(mixedContent).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] no unhandled promise rejections', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const rejections: string[] = [];

        await test.step('Step 1: Start collecting unhandled rejections and page errors', async () => {
            page.on('console', (msg: ConsoleMessage) => {
                if (/unhandled/i.test(msg.text())) rejections.push(msg.text());
            });
            page.on('pageerror', (error) => rejections.push(error.message));
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify no unhandled rejections occurred', async () => {
            expect(rejections).toEqual([]);
        });
    });

    test('[TC-BRW-NNN] page navigation does not produce console errors', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const errors: string[] = [];

        await test.step('Step 1: Start collecting console errors with the current URL', async () => {
            page.on('console', (msg: ConsoleMessage) => {
                if (msg.type() === 'error') errors.push(`[${page.url()}] ${msg.text()}`);
            });
        });

        await test.step('Step 2: Navigate through key routes', async () => {
            for (const route of ['/', '/login', '/about', '/contact']) {
                await page.goto(route);
                await page.waitForLoadState('domcontentloaded');
            }
        });

        await test.step('Step 3: Verify no console errors were logged on any route', async () => {
            expect(errors).toEqual([]);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE & LOADING — Core Web Vitals, resource loading, memory leaks
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Performance', () => {
    test('[TC-BRW-NNN] page loads within acceptable time', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const loadTime = await test.step('Step 1: Load the home page and measure time to DOMContentLoaded', async () => {
            const start = Date.now();
            await page.goto('/');
            await page.waitForLoadState('domcontentloaded');
            return Date.now() - start;
        });

        await test.step('Step 2: Verify the page loaded in under 3 seconds', async () => {
            expect(loadTime).toBeLessThan(3000);
        });
    });

    test('[TC-BRW-NNN] no layout shifts after initial load (CLS)', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        const cls = await test.step('Step 2: Measure Cumulative Layout Shift', async () => {
            return page.evaluate(() => new Promise<number>((resolve) => {
                let clsValue = 0;
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!(entry as any).hadRecentInput) clsValue += (entry as any).value;
                    }
                });
                observer.observe({ type: 'layout-shift', buffered: true });
                setTimeout(() => {
                    observer.disconnect();
                    resolve(clsValue);
                }, 1000);
            }));
        });

        await test.step('Step 3: Verify CLS is below 0.25', async () => {
            // CLS should be under 0.1 (good) or 0.25 (needs improvement)
            expect(cls).toBeLessThan(0.25);
        });
    });

    test('[TC-BRW-NNN] no excessively large resources loaded', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const largeResources: { url: string; size: number }[] = [];

        await test.step('Step 1: Start recording responses larger than 1MB', async () => {
            page.on('response', async (response) => {
                try {
                    const body = await response.body();
                    if (body.length > 1_000_000) largeResources.push({ url: response.url(), size: body.length });
                } catch {
                    // Some responses can't be read (e.g., redirects)
                }
            });
        });

        await test.step('Step 2: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 3: Verify fewer than 3 resources exceed 1MB', async () => {
            expect(largeResources.length, JSON.stringify(largeResources)).toBeLessThan(3);
        });
    });

    test('[TC-BRW-NNN] page does not have memory leaks on repeated navigation', { tag: ['@TC-BRW-NNN'] }, async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'performance.memory is only available in Chromium');

        const initialHeap = await test.step('Step 1: Load the home page and record the JS heap size', async () => {
            await page.goto('/');
            return page.evaluate(() => (performance as any).memory.usedJSHeapSize as number);
        });

        await test.step('Step 2: Navigate back and forth five times', async () => {
            for (let i = 0; i < 5; i++) {
                await page.goto('/about');
                await page.goto('/');
            }
        });

        const finalHeap = await test.step('Step 3: Record the JS heap size after navigation', async () => {
            return page.evaluate(() => {
                if ((window as any).gc) (window as any).gc();
                return (performance as any).memory.usedJSHeapSize as number;
            });
        });

        await test.step('Step 4: Verify the heap grew by less than 10MB', async () => {
            expect(finalHeap - initialHeap).toBeLessThan(10_000_000);
        });
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL REGRESSION — Screenshot comparison (optional, requires baseline)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Visual Regression', () => {
    test('[TC-BRW-NNN] page matches visual baseline', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page and wait for network idle', async () => {
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 2: Verify the full page matches the baseline screenshot', async () => {
            await expect(page).toHaveScreenshot('homepage.png', {
                fullPage: true,
                maxDiffPixelRatio: 0.01, // Allow 1% pixel difference
            });
        });
    });

    test('[TC-BRW-NNN] responsive layout matches baseline at mobile', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        await test.step('Step 1: Load the home page at mobile width', async () => {
            await page.setViewportSize({ width: 375, height: 667 });
            await page.goto('/');
            await page.waitForLoadState('networkidle');
        });

        await test.step('Step 2: Verify the full page matches the mobile baseline screenshot', async () => {
            await expect(page).toHaveScreenshot('homepage-mobile.png', {
                fullPage: true,
                maxDiffPixelRatio: 0.02,
            });
        });
    });
});
```

**Key points:**
- Browser tests use standard Playwright `page` fixture
- `baseURL` is set from `config.openapi.baseUrl` in the project config
- Use Playwright's built-in locators (`getByRole`, `getByLabel`, `getByText`, etc.)
- Available in `browser-chromium`, `browser-firefox`, `browser-webkit` projects
- `BrowserSteps` in `src/steps/` wraps common navigation and assertion sequences in steps
- **Always include these test categories:**
  - **Functional** — Core user flows and interactions
  - **Responsiveness** — Multiple viewports (320px–1920px), overflow checks, touch targets
  - **Accessibility (ARIA)** — Landmarks, labels, headings, keyboard nav, contrast, valid roles
  - **Console & Error Tracking** — JS errors, failed requests, deprecations, mixed content, unhandled rejections
  - **Performance** — Load time, CLS, large resources, memory leaks
  - **Visual Regression** — Screenshot baselines (optional, requires initial baseline generation)
- Parameterized tests (`for` loops) must carry an ID per case in their data: ``test(`[${c.id}] ...`, { tag: [`@${c.id}`] }, ...)``
- Register event listeners (`page.on('console')`, `page.on('pageerror')`) in an early step, before navigating
- Filter known/acceptable errors (third-party scripts, favicon) to reduce noise
- Use `expect.soft()` for checks that should be reported without failing the rest of the test
- Accessibility checks are automated approximations — note that full WCAG compliance requires manual testing with assistive technologies

---

## Skill 9: Create a Property-Based Test

**When to use:** Testing invariants that should hold for any valid input (config parsing, data transformations, validation logic).

**Steps:**

1. Create a file with `*.prop.ts` extension
2. Import `fast-check` for property generators
3. Use Playwright's `test` for the test runner
4. Replace every `TC-PROP-NNN` with IDs from `npm run next-id -- PROP <count>`

**Template:**

```typescript
import { test, expect } from '@playwright/test'; // allowed in *.prop.ts — property tests use no fixtures
import fc from 'fast-check';

test.describe('Property — [Invariant Name]', () => {
    test('[TC-PROP-NNN] invariant description', { tag: ['@TC-PROP-NNN'] }, async () => {
        await test.step('Step 1: Verify the invariant holds for 100 generated inputs', async () => {
            fc.assert(
                fc.property(
                    fc.string({ minLength: 1 }),  // arbitrary generator
                    fc.integer({ min: 1, max: 100 }),
                    (inputString, inputNumber) => {
                        // Property that must hold for ALL generated inputs
                        const result = myFunction(inputString, inputNumber);
                        expect(result).toBeDefined();
                        expect(result.length).toBeGreaterThan(0);
                    }
                ),
                { numRuns: 100 }
            );
        });
    });

    test('[TC-PROP-NNN] roundtrip: encode then decode returns original', { tag: ['@TC-PROP-NNN'] }, async () => {
        await test.step('Step 1: Verify decode(encode(x)) equals x for generated records', async () => {
            fc.assert(
                fc.property(
                    fc.record({ name: fc.string(), age: fc.integer({ min: 0, max: 150 }) }),
                    (original) => {
                        expect(decode(encode(original))).toEqual(original);
                    }
                )
            );
        });
    });
});
```

**Key points:**
- Property tests may import from `@playwright/test` (not `../../src`) since they don't use fixtures
- Use `fc.assert(fc.property(...))` pattern
- Common arbitraries: `fc.string()`, `fc.integer()`, `fc.boolean()`, `fc.record()`, `fc.array()`, `fc.oneof()`
- Default 100 runs; increase with `{ numRuns: 1000 }` for critical invariants
- File must end in `.prop.ts` to match the `property-tests` project
- `tests/properties/` holds the framework's own property tests (exempt from TestCaseIDs). Put property tests for your application elsewhere, e.g. `tests/app-properties/`, where `npm run lint:tests` checks them

---

## Skill 10: Create a Custom Fixture

**When to use:** Adding a new integration (S3, Elasticsearch, gRPC, etc.) to the framework.

**Steps:**

1. Define the client interface
2. Create the fixture file in `src/fixtures/`
3. Register in `src/fixtures/index.ts`
4. Optionally add config to `environments.json` and `src/config/schema.ts`
5. Add an example spec in `tests/examples/` and a matching project in `playwright.config.ts`

**Template:**

```typescript
// src/fixtures/my-service.fixture.ts
import { ConfigLoader } from '../config/loader.js';
import { FixtureInitError } from '../errors.js';

export interface MyServiceClient {
    doSomething(input: string): Promise<string>;
    close(): Promise<void>;
}

interface MyServiceConfig {
    endpoint: string;
    apiKey?: string;
    timeout?: number;
}

export const myServiceFixture = {
    myServiceClient: async (
        {}: Record<string, never>,
        use: (client: MyServiceClient) => Promise<void>,
    ) => {
        // --- Setup ---
        const loader = new ConfigLoader();
        const config = loader.load();
        const myConfig = (config as any).myService as MyServiceConfig | undefined;

        if (!myConfig?.endpoint) {
            throw new FixtureInitError('myServiceClient', 'connect', {
                reason: 'myService.endpoint is required. Add to environments.json or set PW_MY_SERVICE_ENDPOINT.',
            });
        }

        const client: MyServiceClient = {
            async doSomething(input) {
                // Implementation using myConfig.endpoint
                return `result for ${input}`;
            },
            async close() {
                // Cleanup connections
            },
        };

        // --- Provide to test ---
        await use(client);

        // --- Teardown ---
        await client.close();
    },
};
```

**Registration in `src/fixtures/index.ts`:**

```typescript
import { myServiceFixture, type MyServiceClient } from './my-service.fixture.js';

// Add the client type to FixtureTypes, then add to the allFixtures spread:
const allFixtures = {
    ...configOptionFixtures,
    ...openApiFixture,
    // ...existing fixtures...
    ...graphqlFixture,
    ...myServiceFixture,  // ← Add here
};
```

---

## Skill 11: Add Configuration for a New Environment

**When to use:** Setting up a new target environment (e.g., `qa`, `perf`).

**Steps:**

1. Add the environment block to `environments.json`
2. Create a `.env.{name}` file (optional, for secrets)
3. Run with `PW_ENVIRONMENT={name}`

**Template for `environments.json`:**

```json
{
    "environments": {
        "qa": {
            "openapi": {
                "specPath": "https://api.qa.example.com/openapi.json",
                "baseUrl": "https://api.qa.example.com"
            },
            "database": {
                "type": "postgresql",
                "host": "qa-db.example.com",
                "port": 5432,
                "database": "testdb",
                "username": "qa_user",
                "password": ""
            },
            "kafka": {
                "brokers": ["kafka.qa.example.com:9092"],
                "ssl": true
            },
            "redis": {
                "host": "redis.qa.example.com",
                "port": 6379
            },
            "secrets": {
                "provider": "aws",
                "options": { "region": "us-east-1" },
                "keyMappings": {
                    "qa/db-password": "database.password",
                    "qa/redis-password": "redis.password"
                },
                "timeout": 10000
            }
        }
    }
}
```

**Secrets providers:** `secrets.provider` is one of `aws`, `vault`, `openbao`, `gitlab`, `azure` or `env-file`. For OpenBao (or Vault), set the KV path prefix and let the token, URL and TLS settings come from env vars (`PW_OPENBAO_*` → `BAO_*` → `VAULT_*`):

```json
"secrets": {
    "provider": "openbao",
    "options": { "mountPath": "secret/data/qa", "authMethod": "kubernetes", "role": "playwright-qa" },
    "keyMappings": { "db-password": "database.password" }
}
```

Never put tokens, secret_ids or JWTs in `environments.json`. See [docs/secrets.md](docs/secrets.md) for every provider's options.

---

## Skill 12: Add a New Playwright Project

**When to use:** Creating a new test suite with its own configuration and test matching.

**Steps:**

1. Add the project to `playwright.config.ts`
2. Create test files matching the `testMatch` pattern
3. Pass relevant fixture configs in the `use` block

**Template addition to `playwright.config.ts`:**

```typescript
{
    name: 'my-new-suite',
    testMatch: '**/my-suite/**/*.spec.ts',
    use: {
        openapi: config.openapi,
        database: config.database,
        // Only include configs for fixtures your tests actually use
    },
},
```

---

## Skill 13: Handle Test Data Setup and Cleanup

**When to use:** Tests that need specific data before running. Data created through the clients is removed after each test, pass or fail, so **don't write `afterEach` cleanup for it**.

**Steps:**

1. Define a factory for each kind of record (in `tests/factories.ts` when several spec files share it). Build every unique column with `f.unique()` or `f.email()`. These values never collide across parallel workers.
2. Store records through a tracked call:
   - `databaseClient.insert(table, rows)`
   - `mongoDbClient.insertOne` / `insertMany`
   - `redisClient.set`
   - `neo4jClient.write` with `{ runId: testData.runId }`
3. For anything else (an API call, raw SQL, a browser flow), register the undo with `testData.cleanup(label, fn)` right after creating the data.
4. Only data meant to stay (a seeding setup project) opts out, with `{ keep: true }` or `use: { autoCleanup: false }`.

**Template:**

```typescript
import { test, expect, defineFactory } from '../../src';

const order = defineFactory('order', (f) => ({
    ref: f.unique('ord'),          // ord-t3-9f2a1c0b-1
    customer_email: f.email('buyer'),
    status: 'active',
    total: 4999,
}));

test.describe('Orders API', () => {
    test('[TC-API-NNN] fetch order by reference', { tag: ['@TC-API-NNN'] }, async ({ databaseClient, testData, openApiClient }) => {
        const seeded = testData.build(order, { status: 'shipped' });

        await test.step('Step 1: Seed the order (deleted again after the test)', async () => {
            await databaseClient.insert('orders', seeded, { key: 'ref' });
        });

        const response = await test.step('Step 2: Fetch the order via the API', async () => {
            return (openApiClient.client as any).getOrder({ ref: seeded.ref });
        });

        await test.step('Step 3: Verify the order data matches the seed', async () => {
            expect(response.status).toBe(200);
            expect(response.data.status).toBe('shipped');
        });
    });

    test('[TC-API-NNN] create an order via the API', { tag: ['@TC-API-NNN'] }, async ({ testData, openApiClient }) => {
        const { client } = openApiClient as any;

        const created = await test.step('Step 1: Create an order and register its cleanup', async () => {
            const res = await client.createOrder(null, testData.build(order));
            testData.cleanup('delete the order', () => client.deleteOrder({ ref: res.data.ref }));
            return res;
        });

        await test.step('Step 2: Verify it was created', async () => {
            expect(created.status).toBe(201);
        });
    });
});
```

**Key points:**
- Undo actions run newest first, before the clients disconnect. Children inserted after their parents are deleted first.
- `databaseClient.execute()` (raw SQL) is **not** tracked. Prefer `insert()`, or call `testData.cleanup()`.
- SQL rows with a generated `id` are deleted by matching every inserted column: include a unique value, or pass `{ key: 'col' }`.
- Redis keys that existed before the test get their old value back. Neo4j nodes are deleted by the `runId` they were written with.
- `testData.flushCleanups()` runs the cleanups mid-test, to assert that something was removed.
- Faker (`f.faker`) needs `@faker-js/faker` installed. Its values aren't unique: use `f.unique()` for keys.
- Full guide: [docs/test-data.md](docs/test-data.md).

---

## Skill 14: Tag and Filter Tests

**When to use:** Organizing tests by category (smoke, regression, critical).

**Pattern:**

```typescript
import { test, expect } from '../../src';

// Tag a whole group via the describe options
test.describe('Critical Path', { tag: ['@smoke', '@critical'] }, () => {
    test('[TC-API-NNN] login flow', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        await test.step('Step 1: Log in with valid credentials', async () => {
            // ...
        });
    });
});

// Or add category tags next to the TestCaseID tag
test('[TC-API-NNN] health check', { tag: ['@TC-API-NNN', '@smoke'] }, async ({ openApiClient }) => {
    const { client } = openApiClient;

    await test.step('Step 1: Call the health endpoint and verify 200', async () => {
        const response = await (client as any).healthCheck();
        expect(response.status).toBe(200);
    });
});
```

**Run by tag:**
```bash
npm run test:tag -- @smoke
npx playwright test --grep @critical
npx playwright test --grep @TC-API-007     # a single test case by ID
npx playwright test --grep-invert @slow    # exclude slow tests
```

---

## Skill 15: Combine Multiple Fixtures in One Test

**When to use:** Integration tests that span multiple systems.

Replace every `TC-INT-NNN` with IDs from `npm run next-id -- INT <count>`.

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Integration — End-to-End Order Flow', () => {
    test('[TC-INT-NNN] create order via API, verify in DB, check event in Kafka', { tag: ['@TC-INT-NNN'] }, async ({
        openApiClient,
        databaseClient,
        kafkaClient,
    }) => {
        const { client } = openApiClient;

        const orderId = await test.step('Step 1: Create an order via the API', async () => {
            const response = await (client as any).createOrder(null, { product: 'Widget', quantity: 5 });
            expect(response.status).toBe(201);
            return response.data.id as string;
        });

        await test.step('Step 2: Verify the order was persisted in the database', async () => {
            const rows = await databaseClient.query<{ id: string; product: string }>(
                'SELECT id, product FROM orders WHERE id = $1',
                [orderId]
            );
            expect(rows).toHaveLength(1);
            expect(rows[0].product).toBe('Widget');
        });

        await test.step('Step 3: Verify an order.created event was published to Kafka', async () => {
            const messages = await kafkaClient.consume('order-events', { count: 1, timeout: 10000, fromBeginning: true });
            expect(messages).toHaveLength(1);
            const event = JSON.parse(messages[0].value.toString());
            expect(event.orderId).toBe(orderId);
            expect(event.type).toBe('order.created');
        });
    });
});
```

---

## Skill 16: Create an OTP/2FA Test

**When to use:** Testing two-factor authentication (2FA) or multi-factor authentication (MFA) flows that require TOTP or HOTP token generation/verification.

**Steps:**

1. Use the `otpClient` fixture in your test
2. Generate a secret (or use a pre-configured one from your test user setup)
3. Generate tokens and verify them, or use them in login flows
4. Replace every `TC-OTP-NNN` with IDs from `npm run next-id -- OTP <count>`

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('OTP — 2FA Authentication Flow', () => {
    test('[TC-OTP-NNN] generate and verify a TOTP token', { tag: ['@TC-OTP-NNN'] }, async ({ otpClient }) => {
        const secret = await test.step('Step 1: Generate a base32 secret (simulates enabling 2FA)', async () => {
            const s = otpClient.generateSecret();
            expect(s).toMatch(/^[A-Z2-7]+$/);
            return s;
        });

        const token = await test.step('Step 2: Generate a 6-digit TOTP token', async () => {
            const t = await otpClient.generateTotp(secret);
            expect(t).toMatch(/^\d{6}$/);
            return t;
        });

        await test.step('Step 3: Verify the token is accepted', async () => {
            expect(await otpClient.verifyTotp(token, secret)).toBe(true);
        });
    });

    test('[TC-OTP-NNN] reject an invalid TOTP token', { tag: ['@TC-OTP-NNN'] }, async ({ otpClient }) => {
        await test.step('Step 1: Verify a wrong token is rejected for a fresh secret', async () => {
            const secret = otpClient.generateSecret();
            expect(await otpClient.verifyTotp('000000', secret)).toBe(false);
        });
    });

    test('[TC-OTP-NNN] HOTP tokens are counter-specific', { tag: ['@TC-OTP-NNN'] }, async ({ otpClient }) => {
        const secret = otpClient.generateSecret();

        const token = await test.step('Step 1: Generate an HOTP token for counter 1', async () => {
            const t = await otpClient.generateHotp(1, secret);
            expect(t).toMatch(/^\d{6}$/);
            return t;
        });

        await test.step('Step 2: Verify the token is accepted for counter 1', async () => {
            expect(await otpClient.verifyHotp(token, 1, secret)).toBe(true);
        });

        await test.step('Step 3: Verify the token is rejected for counter 2', async () => {
            expect(await otpClient.verifyHotp(token, 2, secret)).toBe(false);
        });
    });

    test('[TC-OTP-NNN] generate otpauth URI for QR code provisioning', { tag: ['@TC-OTP-NNN'] }, async ({ otpClient }) => {
        const uri = await test.step('Step 1: Generate a key URI for user@example.com', async () => {
            return otpClient.generateKeyUri('user@example.com', 'MyApp', otpClient.generateSecret());
        });

        await test.step('Step 2: Verify the URI has the otpauth scheme, secret and issuer', async () => {
            expect(uri).toContain('otpauth://totp/');
            expect(uri).toContain('secret=');
            expect(uri).toContain('issuer=MyApp');
        });
    });
});

// Integration example: OTP + API login flow
test.describe('OTP — Login with 2FA', () => {
    test('[TC-OTP-NNN] complete 2FA login flow', { tag: ['@TC-OTP-NNN'] }, async ({ otpClient, openApiClient }) => {
        const { client } = openApiClient;
        const secret = 'JBSWY3DPEHPK3PXP'; // pre-configured test user secret

        const sessionId = await test.step('Step 1: Log in and receive a 2FA challenge', async () => {
            const response = await (client as any).login(null, { email: 'test@example.com', password: 'password123' });
            expect(response.status).toBe(200);
            expect(response.data.requires2FA).toBe(true);
            return response.data.sessionId;
        });

        await test.step('Step 2: Submit a TOTP token and verify an access token is issued', async () => {
            const token = await otpClient.generateTotp(secret);
            const response = await (client as any).verify2FA(null, { sessionId, token });
            expect(response.status).toBe(200);
            expect(response.data).toHaveProperty('accessToken');
        });
    });
});
```

**Configuration (optional):**

```typescript
// In playwright.config.ts project use block:
use: {
    otp: {
        secret: 'JBSWY3DPEHPK3PXP',  // default secret for all methods
        digits: 6,                      // token length (default: 6)
        period: 30,                     // TOTP time step in seconds (default: 30)
        window: 1,                      // verification tolerance in periods (default: 1)
        algorithm: 'sha1',              // sha1 | sha256 | sha512 (default: sha1)
        issuer: 'MyApp',               // for URI generation
    },
}
```

**Key points:**
- `generateSecret()` returns a base32-encoded string suitable for provisioning
- `generateTotp(secret?)` / `verifyTotp(token, secret?)` — time-based (RFC 6238)
- `generateHotp(counter, secret?)` / `verifyHotp(token, counter, secret?)` — counter-based (RFC 4226)
- `generateKeyUri(account, issuer?, secret?)` — produces `otpauth://` URI for QR codes
- All generate/verify methods are async (returns `Promise`)
- If a default secret is configured, the `secret` parameter is optional in all methods
- The `window` config controls time drift tolerance (1 = ±30s with default period)
- Useful for testing: 2FA enrollment, login flows, backup codes, account recovery

---

## Skill 17: Create a GADS Device Farm Test

**When to use:** Running Appium tests on real iOS/Android devices hosted in a [GADS](https://github.com/shamanec/GADS) device farm. This is the Appium fixture (Skill 5) with the GADS preset turned on.

**Steps:**

1. Point `appium.serverUrl` at the hub (`PW_APPIUM_SERVER_URL=http://gads-hub:10000`) and set `appium.gads.clientSecret` (`PW_GADS_CLIENT_SECRET`). Keep the secret in env vars or a secrets provider. See [docs/appium-fixture.md#gads-preset](docs/appium-fixture.md#gads-preset).
2. Choose the device with `platform` (any free device), `udid` (one device) or `deviceName` (regex, free devices first).
3. Request `appiumDriver` for a session on an allocated device, or only `gadsHub` to inspect devices without reserving one.
4. Give the Playwright project a long `timeout` (e.g. `300_000`), and set `gads.queueTimeout`, because the hub may queue for a free device.
5. Replace every `TC-GDS-NNN` with IDs from `npm run next-id -- GDS <count>`.

**Template:**

```typescript
import { test, expect, gadsSessionInfo } from '../../src';
import { AppiumSteps } from '../../src/steps';

test.describe('GADS — [App/Flow Name]', () => {
    test.skip(!process.env.PW_GADS_CLIENT_SECRET, 'Skipped: no GADS hub configured');

    test('[TC-GDS-NNN] farm has a free device for this platform', { tag: ['@TC-GDS-NNN'] }, async ({ gadsHub }) => {
        await test.step('Step 1: List free Android devices', async () => {
            const free = (await gadsHub.listDevices({ platform: 'android' })).filter((d) => d.available);
            expect(free.length).toBeGreaterThan(0);
        });
    });

    test('[TC-GDS-NNN] log in on a farm device', { tag: ['@TC-GDS-NNN'] }, async ({ appiumDriver }) => {
        const steps = new AppiumSteps(appiumDriver);

        await test.step('Step 1: Record which device the hub allocated', async () => {
            const { udid, name, controlUrl } = gadsSessionInfo(appiumDriver);
            expect(udid).toBeTruthy();
            test.info().annotations.push({ type: 'device', description: `${name} (${udid}) ${controlUrl ?? ''}` });
        });

        await test.step('Step 2: Launch the app and log in', async () => {
            await steps.launchApp('Launch the app', 'com.example.app');
            await steps.fill('Enter the email', '~email', 'user@example.com');
            await steps.tap('Submit the form', '~login');
        });

        await test.step('Step 3: Verify the result and attach a screenshot', async () => {
            await steps.expectText('Verify the greeting', '~welcome-title', /Welcome/);
            await steps.attachScreenshot('Attach the final screen');
        });
    });
});
```

**Key points:**
- Same `appiumDriver` and WebdriverIO API as Skill 5, so specs can move between local Appium and GADS with only a config change.
- The hub allocates the device through `<hub>/grid`, and teardown deletes the session so the device is freed even when the test fails.
- Keep `workers` at or below the number of devices, or raise `gads.queueTimeout`.
- Allocation failures raise `FixtureInitError('gads', ...)` with the client secret redacted. Command failures are WebdriverIO errors.

---

## Skill 18: Run Integration Tests in CI

**When to use:** A new fixture, backend or Playwright project needs a service (database, broker, API) in GitHub Actions.

**Steps:**

1. Make sure the tests have a Playwright project (Skill 12) and pass locally against the service in Docker.
2. Add a job to `.github/workflows/integration-tests.yml` from the template below. [docs/ci.md](docs/ci.md#examples-by-backend) has the service block for each backend.
3. Run `actionlint` on the workflow if you have it, then open a PR and check the new job passes.

**Template:**

```yaml
test-<backend>:
  runs-on: ubuntu-latest
  container: node:24
  services:
    <backend>:
      image: <image:tag>
      options: >-
        --health-cmd "<command that exits 0 once the service is ready>"
        --health-interval 5s
        --health-timeout 30s
        --health-retries 10
  env:
    CI: true
    PW_<BACKEND>_HOST: <backend>
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/npm-install
    - name: Validate environment variables
      run: bash .github/scripts/validate-env.sh PW_<BACKEND>_HOST
    - name: Run <backend> integration tests
      run: npx playwright test --project=integration-<backend>
    - name: Upload HTML report
      if: failure()
      uses: actions/upload-artifact@v4
      with:
        name: html-report-<backend>
        path: playwright-report/
        retention-days: 7
```

**Key points:**
- The service name is the hostname because the job runs in a container. `localhost` only works without `container:`.
- `CI: true` is required: the example specs call `test.skip(!process.env.CI, ...)`.
- Don't add `needs:`. Jobs run in parallel, so a run takes as long as its slowest job.
- A fixture that needs no service (like OTP) goes in an existing job instead: add `--project=<name>` to its `playwright test` command.
- Keep real credentials in GitHub secrets (`${{ secrets.NAME }}`), never in the workflow file.
- Other CI systems (GitLab, Jenkins, Azure Pipelines, CircleCI, Bitbucket) follow the same pattern: see `docs/ci-<system>.md`. For local runs, `docker compose -f compose.test.yaml up -d --wait <service>`.

---

## Skill 19: Test an Email Flow (Inbox)

**When to use:** The app sends an email the test must read: sign-up verification, password reset, a magic link or an emailed login code.

**Steps:**

1. Make sure the app under test sends to Mailpit's SMTP port (`localhost:1025` by default, or `inboxClient.smtp`), and that `PW_INBOX_URL` points at Mailpit's API (or set `PW_INBOX_CONTAINER=true`).
2. Get IDs with `npm run next-id -- EML`.
3. Use a fresh address per test from `uniqueAddress()`. Never a fixed address: parallel tests would read each other's mail.

**Template:**

```typescript
import { test, expect } from '@inluxc/propmaster';

test('[TC-EML-NNN] password reset link works', { tag: ['@TC-EML-NNN'] }, async ({ page, inboxClient }) => {
    const email = inboxClient.uniqueAddress('reset');

    await test.step('Step 1: Request a password reset', async () => {
        await page.goto('/forgot-password');
        await page.getByLabel('Email').fill(email);
        await page.getByRole('button', { name: 'Send reset link' }).click();
    });

    let link = '';
    await test.step('Step 2: Read the reset link from the email', async () => {
        const message = await inboxClient.waitForMessage({ to: email, subject: /reset/i });
        link = inboxClient.extractLink(message, '/reset');
    });

    await test.step('Step 3: Open the link and set a new password', async () => {
        await page.goto(link);
        await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
    });
});
```

**Key points:**
- `waitForMessage` filters by `to`, `from`, `subject` (substring or RegExp), `since` and `where`, and its timeout error lists the messages that did arrive. Read it before changing the test.
- `extractCode(message, pattern?)` returns the first capture group (default: a 6-digit number); `extractLink(message, match?)` returns the first link containing `match`.
- Use `since: new Date()` before triggering a resend, so an older email doesn't match.
- Mail to `uniqueAddress()` addresses is deleted after the test; no cleanup step needed.

---

## Skill 20: Run Tests as a Role (Tokens and Login State)

**When to use:** A test must act as a specific user or client: an admin API call, a viewer who can't delete, a browser test that starts logged in.

**Steps:**

1. Make sure `auth` is configured (`PW_AUTH_ISSUER` or `PW_AUTH_TOKEN_URL`, client, and `auth.roles` in environments.json). Never put passwords or secrets in files: use `PW_AUTH_*` variables or a secrets provider.
2. Pick the role with `test.use({ authRole: '<role>' })` at the `describe` level.
3. For API tests, call `openApiClient`/`graphqlClient` as usual: they send the role's token. Use `authRequest` or `authHeaders` for other HTTP calls.
4. For browser tests, check `tests/e2e/auth.setup.ts` exists (`npx propmaster auth-setup <roles…>`) and lists the role. Then the test needs **no login steps**.

**Template:**

```typescript
import { test, expect } from '@inluxc/propmaster';

test.describe('Orders — permissions', () => {
    test.describe('as viewer', () => {
        test.use({ authRole: 'viewer' });

        test('[TC-API-NNN] viewer cannot delete an order', { tag: ['@TC-API-NNN'] }, async ({ authRequest }) => {
            await test.step('Step 1: Try to delete as viewer', async () => {
                const res = await authRequest.delete('/orders/1');
                expect(res.status()).toBe(403);
            });
        });
    });

    test.describe('as admin', () => {
        test.use({ authRole: 'admin' });

        test('[TC-BRW-NNN] admin sees the delete button', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
            await test.step('Step 1: Open the order page, already logged in', async () => {
                await page.goto('/orders/1');
            });
            await test.step('Step 2: Verify the admin-only action is shown', async () => {
                await expect(page.getByRole('button', { name: 'Delete order' })).toBeVisible();
            });
        });
    });
});
```

**Key points:**
- `authRole` picks both the API token and the browser state; without it, the test uses the default role's token and the project's own `storageState`.
- A header the test sets itself (for example a bad token, to test a 401) is never overwritten.
- `Error reading storage state from .auth/<role>.json` means the role wasn't logged in by the setup project. Add it to `setupAuth({ roles })`.
- Login flows that need `otpClient` or `inboxClient` use a hand-written setup test with `authCredentials(role)` and `saveAuthState(context, role)`; see the Auth docs page.

---

## Skill 21: Stub a Third-Party API Your Backend Calls

**When to use:** The flow under test makes the backend call an outside service (payments, email/SMS API, shipping, a partner API) that tests must not hit, or whose failures you need to simulate.

**Steps:**

1. Make sure the app's test environment points that provider's base URL at WireMock (`mockServer.url`; `PW_MOCK_URL` or `PW_MOCK_CONTAINER=true`).
2. Get IDs with `npm run next-id -- MCK` (or the category of the flow you're testing).
3. Create a value unique to the test (`randomUUID()`) and use it in the flow, so the stub and `verify` only match this test's calls.

**Template:**

```typescript
import { randomUUID } from 'node:crypto';
import { test, expect } from '@inluxc/propmaster';

test('[TC-MCK-NNN] a declined card shows an error and is not retried', { tag: ['@TC-MCK-NNN'] }, async ({ page, mockServer }) => {
    const orderId = randomUUID();

    await test.step('Step 1: Stub a declined charge for this order', async () => {
        await mockServer.stub(
            { method: 'POST', path: '/v1/charges', body: { metadata: { orderId } } },
            { status: 402, json: { error: { code: 'card_declined' } } },
        );
    });

    await test.step('Step 2: Pay in the browser', async () => {
        await page.goto(`/checkout?order=${orderId}`);
        await page.getByRole('button', { name: 'Pay' }).click();
        await expect(page.getByText('Your card was declined')).toBeVisible();
    });

    await test.step('Step 3: Verify the backend tried exactly once', async () => {
        await mockServer.verify({ method: 'POST', path: '/v1/charges', body: { metadata: { orderId } } }, { times: 1 });
    });
});
```

**Key points:**
- `stubSequence` answers in turn (e.g. `[503, 503, 201]`) to test retries; `{ fault: 'CONNECTION_RESET_BY_PEER' }` and `delayMs` test broken and slow providers.
- `verify(match, { times: 0 })` checks a call never happened. A failed `verify` lists the closest calls that did arrive: read it before changing the test.
- A `RegExp` in `pathPattern`, `query` or `headers` matches anywhere, as in JavaScript.
- Stubs are removed after the test; don't clean up by hand. Without a test-unique value to match on, run the clashing tests serially.

---

## Skill 22: Test a RabbitMQ (AMQP) Flow

**When to use:** The application publishes events to, or consumes commands from, RabbitMQ (or another AMQP 0-9-1 broker).

**Steps:**

1. Use the `amqpClient` fixture (`PW_AMQP_URL`, or `PW_AMQP_CONTAINER=true`). `AmqpSteps` from `src/steps` wraps the calls in `test.step()`.
2. To check what the app publishes, `listen(exchange, bindingKey)` **before** the action. The listener is a temporary queue of the test's own, so the app's queues keep their messages. Never `consume()` from the app's own queues.
3. Match messages on a value unique to the test (an ID it created, a correlation ID): parallel tests share the exchange.
4. Declare test-owned queues and exchanges with `assertQueue` / `assertExchange` / `bindQueue`; they're removed after the test. On RabbitMQ 4 don't pass `durable: false` to `assertQueue` (refused unless `exclusive`).
5. Get IDs with `npm run next-id -- AMQ <count>`.

**Template:**

```typescript
import { test, expect } from '@inluxc/propmaster';

test.describe('RabbitMQ — Orders', () => {
    test('[TC-AMQ-NNN] placing an order publishes order.created', { tag: ['@TC-AMQ-NNN'] }, async ({ amqpClient, openApiClient }) => {
        const listener = await amqpClient.listen('orders', 'order.*');
        let orderId = '';

        await test.step('Step 1: Place an order through the API', async () => {
            const response = await (openApiClient.client as any).createOrder(null, { sku: 'SKU-1', quantity: 2 });
            expect(response.status).toBe(201);
            orderId = response.data.id;
        });

        await test.step('Step 2: Verify the order.created event for this order', async () => {
            const event = await listener.waitForMessage((m) => m.json<{ orderId: string }>().orderId === orderId);
            expect(event.routingKey).toBe('order.created');
            expect(event.json()).toMatchObject({ orderId, quantity: 2 });
        });
    });

    test('[TC-AMQ-NNN] a payment event marks the order paid', { tag: ['@TC-AMQ-NNN'] }, async ({ amqpClient, databaseClient, testData }) => {
        const orderId = testData.unique('ord');

        await test.step('Step 1: Publish the payment.captured event', async () => {
            // Waits for the broker's confirm; throws if no queue is bound for the routing key
            await amqpClient.publish('payments', 'payment.captured', { orderId, amount: 4200 }, { correlationId: orderId });
        });

        await test.step('Step 2: Verify the order is marked paid', async () => {
            await expect.poll(async () => {
                const [row] = await databaseClient.query<{ status: string }>('SELECT status FROM orders WHERE id = $1', [orderId]);
                return row?.status;
            }, { timeout: 10_000 }).toBe('paid');
        });
    });
});
```

**Key points:**
- `waitForMessage()` throws on timeout and lists what arrived instead: read it before changing the test. `listener.messages({ count })` returns what arrived without throwing.
- A string body is sent as `text/plain`, an object as JSON; `m.body` is the UTF-8 text, `m.json()` parses it, `m.headers` / `m.properties` hold the rest.
- `consume(queue, { count })` takes and acknowledges messages; `purge(queue)` empties a queue; `checkQueue(queue)` gives `{ messageCount, consumerCount }` or `null`.
- Headers exchanges: `listen(exchange, '', { arguments: { 'x-match': 'all', type: 'order' } })`.

---

## Quick Decision Guide

| I want to... | Use Skill |
|---|---|
| Assign TestCaseIDs & test steps (**always**) | Skill 0 |
| Test a REST API endpoint | Skill 1 (OpenAPI) |
| Query or modify database records | Skill 2 (Database) |
| Test event publishing/consuming | Skill 3 (Kafka) |
| Test RabbitMQ events or commands | Skill 22 (RabbitMQ) |
| Test caching or pub/sub | Skill 4 (Redis) |
| Test a native mobile app (Appium) | Skill 5 (Appium) |
| Test document storage or aggregations | Skill 6 (MongoDB) |
| Test a GraphQL API | Skill 7 (GraphQL) |
| Test a web page in a browser | Skill 8 (Browser) |
| Verify an invariant for all inputs | Skill 9 (Property) |
| Add a new service integration | Skill 10 (Custom Fixture) |
| Target a new environment | Skill 11 (Environment) |
| Create a new test suite | Skill 12 (Project) |
| Set up/tear down test data | Skill 13 (Data Lifecycle) |
| Organize tests by category | Skill 14 (Tags) |
| Test across multiple systems | Skill 15 (Multi-Fixture) |
| Test 2FA/MFA with OTP tokens | Skill 16 (OTP) |
| Test a mobile app on a GADS device farm | Skill 17 (GADS) |
| Test a sign-up, reset or emailed-code flow | Skill 19 (Inbox) |
| Act as a specific user, or start logged in | Skill 20 (Auth roles) |
| Stub or verify a third-party API the backend calls | Skill 21 (Mock server) |
| Run a new backend's tests in CI | Skill 18 (CI) |
| Test a Neo4j graph | AGENTS.md → "Neo4j Client" quick reference |

**Before finishing any task:** run `npm run verify` (typecheck + `lint:tests` + unit + property tests).
