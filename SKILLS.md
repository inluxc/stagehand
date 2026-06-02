# AI Skills — Playwright Framework Template

This document teaches AI agents the step-by-step skills needed to create tests with this framework. Each skill is a self-contained recipe.

---

## Skill 1: Create an API Test (OpenAPI)

**When to use:** Testing REST API endpoints defined in an OpenAPI specification.

**Steps:**

1. Create a file matching the project's `testMatch` pattern (e.g., `tests/examples/openapi.spec.ts` or add a new pattern to `playwright.config.ts`)
2. Import from the framework entry point
3. Use the `openApiClient` fixture
4. Call operations by their `operationId` from the spec
5. Always include both positive (happy path) and negative (error/edge case) scenarios
6. Include security tests for injection, auth bypass, and input abuse

**Template:**

```typescript
import { test, expect } from '../../src';

// ═══════════════════════════════════════════════════════════════════════════════
// POSITIVE TESTS — Happy path, valid inputs, expected behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Positive', () => {
    test('GET /items — list all items returns 200', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).listItems();
        expect(response.status).toBe(200);
        expect(response.data).toBeInstanceOf(Array);
    });

    test('GET /items/:id — fetch single item returns 200', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).getItemById({ id: '123' });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('id', '123');
    });

    test('POST /items — create item with valid body returns 201', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).createItem(null, {
            name: 'New Item',
            description: 'Created via test',
        });
        expect(response.status).toBe(201);
        expect(response.data).toHaveProperty('id');
        expect(response.data.name).toBe('New Item');
    });

    test('PUT /items/:id — update item returns 200', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).updateItem(
            { id: '123' },
            { name: 'Updated Item' }
        );
        expect(response.status).toBe(200);
        expect(response.data.name).toBe('Updated Item');
    });

    test('DELETE /items/:id — delete item returns 204', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).deleteItem({ id: '123' });
        expect(response.status).toBe(204);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEGATIVE TESTS — Invalid inputs, missing fields, wrong types, edge cases
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Negative', () => {
    test('GET /items/:id — non-existent ID returns 404', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).getItemById({ id: 'non-existent-id-999' });
        } catch (error: any) {
            expect(error.response.status).toBe(404);
        }
    });

    test('POST /items — missing required fields returns 400', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).createItem(null, {});
        } catch (error: any) {
            expect(error.response.status).toBe(400);
            // Verify error response includes validation details
            expect(error.response.data).toHaveProperty('message');
        }
    });

    test('POST /items — invalid field types returns 400', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).createItem(null, {
                name: 12345,           // should be string
                quantity: 'not-a-number', // should be number
            });
        } catch (error: any) {
            expect(error.response.status).toBe(400);
        }
    });

    test('POST /items — exceeds max length returns 400', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).createItem(null, {
                name: 'A'.repeat(10000), // exceed max length
                description: 'B'.repeat(100000),
            });
        } catch (error: any) {
            expect([400, 413]).toContain(error.response.status);
        }
    });

    test('PUT /items/:id — invalid ID format returns 400 or 404', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).updateItem(
                { id: '../../etc/passwd' },
                { name: 'Hacked' }
            );
        } catch (error: any) {
            expect([400, 404]).toContain(error.response.status);
        }
    });

    test('DELETE /items/:id — already deleted returns 404', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).deleteItem({ id: 'already-deleted-id' });
        } catch (error: any) {
            expect(error.response.status).toBe(404);
        }
    });

    test('POST /items — empty body returns 400', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).createItem(null, null);
        } catch (error: any) {
            expect([400, 415]).toContain(error.response.status);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SECURITY TESTS — Injection, auth bypass, input abuse
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('API — [Feature Name] — Security', () => {

    // --- SQL Injection ---

    test('SQL injection in path parameter is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const sqlPayloads = [
            "1; DROP TABLE users;--",
            "1' OR '1'='1",
            "1 UNION SELECT * FROM users--",
            "'; DELETE FROM items WHERE '1'='1",
        ];

        for (const payload of sqlPayloads) {
            try {
                await (client as any).getItemById({ id: payload });
            } catch (error: any) {
                // Should return 400 (bad request) or 404 (not found), never 500
                expect(error.response.status).toBeLessThan(500);
            }
        }
    });

    test('SQL injection in request body is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const sqlPayloads = [
            "'; DROP TABLE items;--",
            "1 OR 1=1",
            "admin'--",
            "' UNION SELECT password FROM users WHERE '1'='1",
        ];

        for (const payload of sqlPayloads) {
            try {
                const response = await (client as any).createItem(null, {
                    name: payload,
                    description: payload,
                });
                // If it succeeds, the payload was stored as plain text (safe)
                // Verify it was NOT interpreted as SQL
                expect(response.status).toBeLessThan(500);
            } catch (error: any) {
                // Rejection is also acceptable
                expect(error.response.status).toBeLessThan(500);
            }
        }
    });

    test('SQL injection in query parameters is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).listItems(null, null, {
                params: { search: "' OR '1'='1'; DROP TABLE items;--" },
            });
        } catch (error: any) {
            expect(error.response.status).toBeLessThan(500);
        }
    });

    // --- XSS (Cross-Site Scripting) ---

    test('XSS payloads in input are sanitized or rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const xssPayloads = [
            '<script>alert("xss")</script>',
            '<img src=x onerror=alert(1)>',
            '"><svg onload=alert(document.cookie)>',
            "javascript:alert('XSS')",
            '<iframe src="javascript:alert(1)">',
        ];

        for (const payload of xssPayloads) {
            try {
                const response = await (client as any).createItem(null, {
                    name: payload,
                    description: payload,
                });
                // If stored, verify the response does NOT reflect raw script tags
                if (response.status === 201) {
                    const stored = response.data.name;
                    expect(stored).not.toContain('<script>');
                    expect(stored).not.toContain('onerror=');
                    expect(stored).not.toContain('onload=');
                }
            } catch (error: any) {
                // Rejection (400) is acceptable
                expect(error.response.status).toBe(400);
            }
        }
    });

    // --- Command Injection ---

    test('OS command injection in inputs is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const cmdPayloads = [
            '; ls -la',
            '| cat /etc/passwd',
            '$(whoami)',
            '`id`',
            '& net user',
        ];

        for (const payload of cmdPayloads) {
            try {
                const response = await (client as any).createItem(null, {
                    name: payload,
                    description: 'cmd injection test',
                });
                // Should not cause server error
                expect(response.status).toBeLessThan(500);
            } catch (error: any) {
                expect(error.response.status).toBeLessThan(500);
            }
        }
    });

    // --- Path Traversal ---

    test('path traversal in parameters is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const traversalPayloads = [
            '../../../etc/passwd',
            '..\\..\\..\\windows\\system32\\config\\sam',
            '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
            '....//....//....//etc/passwd',
        ];

        for (const payload of traversalPayloads) {
            try {
                await (client as any).getItemById({ id: payload });
            } catch (error: any) {
                expect([400, 404]).toContain(error.response.status);
            }
        }
    });

    // --- NoSQL Injection ---

    test('NoSQL injection payloads are rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const nosqlPayloads = [
            '{"$gt": ""}',
            '{"$ne": null}',
            '{"$where": "sleep(5000)"}',
        ];

        for (const payload of nosqlPayloads) {
            try {
                await (client as any).getItemById({ id: payload });
            } catch (error: any) {
                expect(error.response.status).toBeLessThan(500);
            }
        }
    });

    // --- Authentication & Authorization ---

    test('request without auth token returns 401', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            // Override headers to remove auth
            await (client as any).listItems(null, null, {
                headers: { Authorization: '' },
            });
        } catch (error: any) {
            expect(error.response.status).toBe(401);
        }
    });

    test('request with invalid auth token returns 401', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).listItems(null, null, {
                headers: { Authorization: 'Bearer invalid-token-abc123' },
            });
        } catch (error: any) {
            expect([401, 403]).toContain(error.response.status);
        }
    });

    test('access another users resource returns 403', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            // Attempt to access a resource belonging to another user
            await (client as any).getItemById({ id: 'other-user-item-id' });
        } catch (error: any) {
            expect([403, 404]).toContain(error.response.status);
        }
    });

    // --- Rate Limiting & Abuse ---

    test('rapid repeated requests are rate-limited', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const responses: number[] = [];

        // Send many requests rapidly
        for (let i = 0; i < 50; i++) {
            try {
                const response = await (client as any).listItems();
                responses.push(response.status);
            } catch (error: any) {
                responses.push(error.response.status);
            }
        }

        // At least some should be rate-limited (429) if rate limiting is enabled
        // If no rate limiting, all should be 200 (still valid, but flag for review)
        const hasRateLimit = responses.includes(429);
        const allSucceeded = responses.every((s) => s === 200);
        expect(hasRateLimit || allSucceeded).toBe(true);
    });

    // --- Header Injection ---

    test('CRLF injection in headers is rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            await (client as any).listItems(null, null, {
                headers: { 'X-Custom': 'value\r\nInjected-Header: malicious' },
            });
        } catch (error: any) {
            expect(error.response.status).toBeLessThan(500);
        }
    });

    // --- Response Security Headers ---

    test('response includes security headers', async ({ openApiClient }) => {
        const { client } = openApiClient;

        const response = await (client as any).listItems();
        const headers = response.headers;

        // Common security headers to verify (adapt to your API)
        // These are recommendations — not all APIs implement all of them
        const securityHeaders = [
            'x-content-type-options',   // should be 'nosniff'
            'x-frame-options',          // should be 'DENY' or 'SAMEORIGIN'
            // 'strict-transport-security', // HSTS
            // 'content-security-policy',
        ];

        for (const header of securityHeaders) {
            if (headers[header]) {
                expect(headers[header]).toBeDefined();
            }
        }
    });

    // --- Mass Assignment / Unexpected Fields ---

    test('extra/unexpected fields in body are ignored or rejected', async ({ openApiClient }) => {
        const { client } = openApiClient;

        try {
            const response = await (client as any).createItem(null, {
                name: 'Normal Item',
                description: 'Valid description',
                isAdmin: true,          // unexpected field — should be ignored
                role: 'superuser',      // unexpected field — should be ignored
                __proto__: { admin: true }, // prototype pollution attempt
            });

            if (response.status === 201) {
                // Verify unexpected fields were NOT persisted
                expect(response.data).not.toHaveProperty('isAdmin');
                expect(response.data).not.toHaveProperty('role');
            }
        } catch (error: any) {
            // Rejection is also acceptable
            expect(error.response.status).toBe(400);
        }
    });
});
```

**Key points:**
- Operations are called by `operationId` from the OpenAPI spec
- Path params go in the first argument as an object
- Request body goes in the second argument
- Response has `.status`, `.data`, `.headers`
- **Always include positive, negative, and security test sections**
- Positive tests verify happy-path behavior with valid inputs
- Negative tests verify proper error handling (400, 404, 422) for invalid inputs
- Security tests verify the API rejects injection attempts without 500 errors
- Use `try/catch` for requests expected to fail — check `error.response.status`
- Security assertion rule: **the server must never return 500** for malicious input (indicates unhandled injection)
- Adapt security payloads to the specific API context (e.g., add LDAP injection for directory services)

---

## Skill 2: Create a Database Test

**When to use:** Testing database queries, data integrity, or stored procedures.

**Steps:**

1. Create a file matching `**/examples/{database,kafka,redis}.spec.ts` or update `testMatch`
2. Use the `databaseClient` fixture
3. Use parameterized queries (never string interpolation)

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Database — [Feature/Table Name]', () => {
    test('query records with filter', async ({ databaseClient }) => {
        const rows = await databaseClient.query<{ id: number; name: string; status: string }>(
            'SELECT id, name, status FROM orders WHERE status = $1 AND created_at > $2',
            ['active', '2024-01-01']
        );

        expect(rows.length).toBeGreaterThan(0);
        for (const row of rows) {
            expect(row.status).toBe('active');
        }
    });

    test('insert and verify record', async ({ databaseClient }) => {
        const insertResult = await databaseClient.execute(
            'INSERT INTO orders (name, status, amount) VALUES ($1, $2, $3)',
            ['Test Order', 'pending', 99.99]
        );
        expect(insertResult.affectedRows).toBe(1);

        // Verify the insert
        const rows = await databaseClient.query<{ name: string }>(
            'SELECT name FROM orders WHERE name = $1',
            ['Test Order']
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe('Test Order');
    });

    test('update records', async ({ databaseClient }) => {
        const result = await databaseClient.execute(
            'UPDATE orders SET status = $1 WHERE status = $2',
            ['completed', 'pending']
        );
        expect(result.affectedRows).toBeGreaterThanOrEqual(0);
    });

    test('empty result returns empty array', async ({ databaseClient }) => {
        const rows = await databaseClient.query(
            'SELECT * FROM orders WHERE id = $1',
            [-999]
        );
        expect(rows).toEqual([]);
    });
});
```

**Key points:**
- `query<T>()` returns typed rows as `T[]`
- `execute()` returns `{ affectedRows: number }`
- Always use `$1`, `$2`, etc. for parameters — never template literals
- Empty results return `[]`, not `null`

---

## Skill 3: Create a Kafka Test

**When to use:** Testing event-driven flows, message production/consumption.

**Steps:**

1. Use the `kafkaClient` fixture
2. Produce messages with key/value pairs
3. Consume with timeout and count options

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Kafka — [Event/Topic Name]', () => {
    test('produce event messages', async ({ kafkaClient }) => {
        await kafkaClient.produce('user-events', [
            { key: 'user-1', value: JSON.stringify({ event: 'created', userId: '1', timestamp: Date.now() }) },
            { key: 'user-2', value: JSON.stringify({ event: 'updated', userId: '2', timestamp: Date.now() }) },
        ]);
        // produce() resolves when broker acknowledges
    });

    test('produce and consume round-trip', async ({ kafkaClient }) => {
        const topic = 'test-notifications';
        const payload = { type: 'alert', message: 'System update', severity: 'info' };

        // Produce
        await kafkaClient.produce(topic, [
            { key: 'alert-1', value: JSON.stringify(payload) },
        ]);

        // Consume
        const messages = await kafkaClient.consume(topic, {
            count: 1,
            timeout: 10000,
            fromBeginning: true,
        });

        expect(messages).toHaveLength(1);
        expect(messages[0].topic).toBe(topic);

        const received = JSON.parse(messages[0].value.toString());
        expect(received).toEqual(payload);
    });

    test('consume with timeout returns empty on no messages', async ({ kafkaClient }) => {
        const messages = await kafkaClient.consume('empty-topic', {
            timeout: 2000,
            fromBeginning: true,
        });
        expect(messages).toEqual([]);
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

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Redis — [Feature Name]', () => {
    test('set and get values', async ({ redisClient }) => {
        await redisClient.set('user:1:profile', JSON.stringify({ name: 'Alice', role: 'admin' }));

        const raw = await redisClient.get('user:1:profile');
        expect(raw).not.toBeNull();

        const profile = JSON.parse(raw!);
        expect(profile.name).toBe('Alice');
        expect(profile.role).toBe('admin');
    });

    test('set with TTL expiration', async ({ redisClient }) => {
        await redisClient.set('session:token123', 'active', 300); // 5 min TTL
        const value = await redisClient.get('session:token123');
        expect(value).toBe('active');
    });

    test('delete keys', async ({ redisClient }) => {
        await redisClient.set('temp:data', 'will-be-deleted');
        const removed = await redisClient.del('temp:data');
        expect(removed).toBe(1);

        const value = await redisClient.get('temp:data');
        expect(value).toBeNull();
    });

    test('pub/sub messaging', async ({ redisClient }) => {
        const channel = 'events:user';
        const message = JSON.stringify({ action: 'logout', userId: '42' });

        // Subscribe FIRST, then publish
        const subscribePromise = redisClient.subscribe(channel, { timeout: 5000 });
        await new Promise((r) => setTimeout(r, 100)); // ensure subscription is active

        const receivers = await redisClient.publish(channel, message);
        expect(receivers).toBeGreaterThanOrEqual(1);

        const received = await subscribePromise;
        expect(received).toBe(message);
    });

    test('get non-existent key returns null', async ({ redisClient }) => {
        const value = await redisClient.get('does:not:exist');
        expect(value).toBeNull();
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

## Skill 5: Create a Mobile Test (Mobilewright)

**When to use:** Testing native mobile app interactions on iOS or Android.

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Mobile — [Screen/Flow Name]', () => {
    test('navigate and interact with elements', async ({ mobilewrightDevice, mobilewrightScreen }) => {
        // Navigate via deep link
        await mobilewrightDevice.openUrl('myapp://home');

        // Find elements by different strategies
        const title = mobilewrightScreen.getByText('Welcome');
        const emailInput = mobilewrightScreen.getByLabel('Email Address');
        const submitBtn = mobilewrightScreen.getByTestId('submit-button');
        const header = mobilewrightScreen.getByRole('header');

        // Interactions
        await mobilewrightScreen.fill(emailInput, 'user@example.com');
        await mobilewrightScreen.tap(submitBtn);

        // Verify
        expect(title).toBeDefined();
    });

    test('gesture interactions', async ({ mobilewrightScreen }) => {
        // Swipe directions: 'up', 'down', 'left', 'right'
        await mobilewrightScreen.swipe('down'); // pull to refresh

        // Long press for context menu
        const item = mobilewrightScreen.getByText('Document.pdf');
        await mobilewrightScreen.longPress(item);

        // Double tap
        const image = mobilewrightScreen.getByTestId('photo');
        await mobilewrightScreen.doubleTap(image);

        // Hardware buttons: 'home', 'back', 'volumeUp', 'volumeDown'
        await mobilewrightScreen.pressButton('back');
    });
});
```

**Key points:**
- `mobilewrightDevice` — device-level control (deep links, device state)
- `mobilewrightScreen` — UI interactions (tap, fill, swipe, locators)
- Locator methods: `getByText`, `getByLabel`, `getByTestId`, `getByRole`, `getByType`
- Session lifecycle (boot, install, teardown) is automatic

---

## Skill 6: Create a MongoDB Test

**When to use:** Testing document-based data operations, NoSQL queries, and aggregation pipelines.

**Steps:**

1. Create a file matching `**/examples/mongodb.spec.ts` or update `testMatch`
2. Use the `mongoDbClient` fixture
3. Use MongoDB query operators (`$set`, `$group`, etc.) for updates and aggregations

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('MongoDB — [Collection/Feature Name]', () => {
    test('find documents with filter and options', async ({ mongoDbClient }) => {
        const users = await mongoDbClient.find<{ name: string; email: string; active: boolean }>(
            'users',
            { active: true },
            { limit: 10, sort: { name: 1 }, projection: { name: 1, email: 1 } }
        );

        expect(users).toBeDefined();
        expect(Array.isArray(users)).toBe(true);

        for (const user of users) {
            expect(user).toHaveProperty('name');
            expect(user).toHaveProperty('email');
        }
    });

    test('find a single document', async ({ mongoDbClient }) => {
        const user = await mongoDbClient.findOne<{ name: string; email: string }>(
            'users',
            { email: 'admin@example.com' }
        );

        // findOne returns null if no document matches
        if (user) {
            expect(user).toHaveProperty('name');
        } else {
            expect(user).toBeNull();
        }
    });

    test('insert a single document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.insertOne('users', {
            name: 'Test User',
            email: 'test@example.com',
            active: true,
            createdAt: new Date().toISOString(),
        });

        expect(result.acknowledged).toBe(true);
        expect(result.insertedId).toBeDefined();
    });

    test('insert multiple documents', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.insertMany('users', [
            { name: 'User A', email: 'a@example.com', active: true },
            { name: 'User B', email: 'b@example.com', active: false },
        ]);

        expect(result.acknowledged).toBe(true);
        expect(result.insertedCount).toBe(2);
    });

    test('update a document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.updateOne(
            'users',
            { email: 'test@example.com' },
            { $set: { active: false, updatedAt: new Date().toISOString() } }
        );

        expect(result.acknowledged).toBe(true);
        expect(result.matchedCount).toBeGreaterThanOrEqual(0);
    });

    test('update multiple documents', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.updateMany(
            'users',
            { active: false },
            { $set: { archived: true } }
        );

        expect(result.acknowledged).toBe(true);
        expect(result.modifiedCount).toBeGreaterThanOrEqual(0);
    });

    test('delete a document', async ({ mongoDbClient }) => {
        const result = await mongoDbClient.deleteOne('users', {
            email: 'test@example.com',
        });

        expect(result.acknowledged).toBe(true);
        expect(result.deletedCount).toBeGreaterThanOrEqual(0);
    });

    test('run an aggregation pipeline', async ({ mongoDbClient }) => {
        const results = await mongoDbClient.aggregate<{ _id: boolean; count: number }>(
            'users',
            [
                { $group: { _id: '$active', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]
        );

        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        if (results.length > 0) {
            expect(results[0]).toHaveProperty('_id');
            expect(results[0]).toHaveProperty('count');
        }
    });

    test('empty result returns empty array', async ({ mongoDbClient }) => {
        const docs = await mongoDbClient.find('users', { email: 'nonexistent@nowhere.com' });
        expect(docs).toEqual([]);
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

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('GraphQL — [Feature Name]', () => {
    test('execute a query', async ({ graphqlClient }) => {
        const data = await graphqlClient.query<{
            users: Array<{ id: string; name: string; email: string }>;
        }>(`
            query {
                users {
                    id
                    name
                    email
                }
            }
        `);

        expect(data.users).toBeInstanceOf(Array);
        expect(data.users[0]).toHaveProperty('name');
    });

    test('query with variables', async ({ graphqlClient }) => {
        const data = await graphqlClient.query<{
            user: { id: string; name: string } | null;
        }>(
            `query GetUser($id: ID!) {
                user(id: $id) {
                    id
                    name
                }
            }`,
            { id: '123' }
        );

        expect(data.user).not.toBeNull();
        expect(data.user!.name).toBeDefined();
    });

    test('execute a mutation', async ({ graphqlClient }) => {
        const data = await graphqlClient.mutate<{
            createUser: { id: string; name: string };
        }>(
            `mutation CreateUser($input: CreateUserInput!) {
                createUser(input: $input) {
                    id
                    name
                }
            }`,
            { input: { name: 'Alice', email: 'alice@example.com' } }
        );

        expect(data.createUser.id).toBeDefined();
        expect(data.createUser.name).toBe('Alice');
    });

    test('handle errors with rawRequest', async ({ graphqlClient }) => {
        const response = await graphqlClient.rawRequest<{ user: null }>(
            `{ user(id: "nonexistent") { id name } }`
        );

        // rawRequest returns errors in the response instead of throwing
        if (response.errors) {
            expect(response.errors[0].message).toBeDefined();
            expect(response.errors[0]).toHaveProperty('locations');
        }
    });

    test('authenticated request with dynamic token', async ({ graphqlClient }) => {
        // Set token dynamically (e.g., after a login mutation)
        graphqlClient.setAuthToken('jwt-token-from-login');

        const data = await graphqlClient.query<{ me: { email: string } }>(`
            query { me { email } }
        `);

        expect(data.me.email).toBeDefined();
    });

    test('request with custom headers', async ({ graphqlClient }) => {
        const data = await graphqlClient.query(
            `{ __schema { queryType { name } } }`,
            undefined,
            { headers: { 'X-Request-ID': 'test-correlation-123' } }
        );

        expect(data).toBeDefined();
    });

    test('introspection query works', async ({ graphqlClient }) => {
        const data = await graphqlClient.query<{
            __schema: { queryType: { name: string } };
        }>(`{ __schema { queryType { name } } }`);

        expect(data.__schema.queryType.name).toBe('Query');
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

**Template:**

```typescript
import { test, expect } from '../../src';
import type { ConsoleMessage } from '@playwright/test';

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTIONAL TESTS — Core user interactions and navigation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Functional', () => {
    test('navigate and interact with page', async ({ page }) => {
        await page.goto('/login');

        // Fill form
        await page.getByLabel('Email').fill('user@example.com');
        await page.getByLabel('Password').fill('secret123');
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Wait and verify
        await expect(page).toHaveURL('/dashboard');
        await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    });

    test('form validation shows error messages', async ({ page }) => {
        await page.goto('/login');

        // Submit empty form
        await page.getByRole('button', { name: 'Sign In' }).click();

        // Verify validation messages appear
        await expect(page.getByText('Email is required')).toBeVisible();
        await expect(page.getByText('Password is required')).toBeVisible();
    });

    test('API response validation via network', async ({ page }) => {
        const responsePromise = page.waitForResponse('**/api/users');
        await page.goto('/users');
        const response = await responsePromise;

        expect(response.status()).toBe(200);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSIVENESS TESTS — Viewport sizes, layout breakpoints, mobile behavior
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Responsiveness', () => {
    const viewports = [
        { name: 'Mobile S (320px)', width: 320, height: 568 },
        { name: 'Mobile M (375px)', width: 375, height: 667 },
        { name: 'Mobile L (425px)', width: 425, height: 812 },
        { name: 'Tablet (768px)', width: 768, height: 1024 },
        { name: 'Laptop (1024px)', width: 1024, height: 768 },
        { name: 'Desktop (1440px)', width: 1440, height: 900 },
        { name: 'Wide (1920px)', width: 1920, height: 1080 },
    ];

    for (const viewport of viewports) {
        test(`renders correctly at ${viewport.name}`, async ({ page }) => {
            await page.setViewportSize({ width: viewport.width, height: viewport.height });
            await page.goto('/');

            // Verify no horizontal overflow (content fits viewport)
            const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
            expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1); // +1 for rounding

            // Verify key elements are visible (adapt to your page)
            await expect(page.getByRole('navigation')).toBeVisible();
            await expect(page.getByRole('main')).toBeVisible();
        });
    }

    test('mobile navigation menu toggles correctly', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');

        // Desktop nav should be hidden on mobile
        const desktopNav = page.locator('[data-testid="desktop-nav"]');
        if (await desktopNav.count() > 0) {
            await expect(desktopNav).not.toBeVisible();
        }

        // Hamburger menu should be visible and functional
        const menuButton = page.getByRole('button', { name: /menu|toggle/i });
        if (await menuButton.count() > 0) {
            await menuButton.click();
            await expect(page.getByRole('navigation')).toBeVisible();
        }
    });

    test('images and media are responsive', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');

        // Verify images don't overflow their containers
        const overflowingImages = await page.evaluate(() => {
            const images = document.querySelectorAll('img');
            return Array.from(images).filter((img) => {
                const rect = img.getBoundingClientRect();
                return rect.width > window.innerWidth;
            }).length;
        });
        expect(overflowingImages).toBe(0);
    });

    test('text remains readable at all viewports', async ({ page }) => {
        await page.setViewportSize({ width: 320, height: 568 });
        await page.goto('/');

        // Verify minimum font size (no text smaller than 12px)
        const tooSmallText = await page.evaluate(() => {
            const elements = document.querySelectorAll('body *');
            let count = 0;
            elements.forEach((el) => {
                const style = window.getComputedStyle(el);
                const fontSize = parseFloat(style.fontSize);
                if (el.textContent?.trim() && fontSize < 12) {
                    count++;
                }
            });
            return count;
        });
        expect(tooSmallText).toBe(0);
    });

    test('touch targets meet minimum size on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');

        // WCAG 2.5.5: touch targets should be at least 44x44px
        const smallTargets = await page.evaluate(() => {
            const interactiveElements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
            let count = 0;
            interactiveElements.forEach((el) => {
                const rect = el.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                    if (rect.width < 44 || rect.height < 44) {
                        count++;
                    }
                }
            });
            return count;
        });
        // Log for awareness — strict enforcement depends on project requirements
        if (smallTargets > 0) {
            console.warn(`Found ${smallTargets} touch targets smaller than 44x44px`);
        }
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESSIBILITY (ARIA) TESTS — Roles, labels, landmarks, keyboard navigation
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Accessibility', () => {
    test('page has correct landmark structure', async ({ page }) => {
        await page.goto('/');

        // Verify ARIA landmarks exist
        await expect(page.getByRole('banner')).toBeVisible();       // <header>
        await expect(page.getByRole('navigation')).toBeVisible();   // <nav>
        await expect(page.getByRole('main')).toBeVisible();         // <main>
        await expect(page.getByRole('contentinfo')).toBeVisible();  // <footer>
    });

    test('all images have alt text', async ({ page }) => {
        await page.goto('/');

        const imagesWithoutAlt = await page.evaluate(() => {
            const images = document.querySelectorAll('img');
            return Array.from(images).filter(
                (img) => !img.hasAttribute('alt') && !img.getAttribute('role')?.includes('presentation')
            ).length;
        });
        expect(imagesWithoutAlt).toBe(0);
    });

    test('all form inputs have associated labels', async ({ page }) => {
        await page.goto('/login');

        const unlabeledInputs = await page.evaluate(() => {
            const inputs = document.querySelectorAll('input, select, textarea');
            return Array.from(inputs).filter((input) => {
                const id = input.getAttribute('id');
                const ariaLabel = input.getAttribute('aria-label');
                const ariaLabelledBy = input.getAttribute('aria-labelledby');
                const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                const isHidden = input.getAttribute('type') === 'hidden';
                return !isHidden && !hasLabel && !ariaLabel && !ariaLabelledBy;
            }).length;
        });
        expect(unlabeledInputs).toBe(0);
    });

    test('heading hierarchy is correct (no skipped levels)', async ({ page }) => {
        await page.goto('/');

        const headingIssues = await page.evaluate(() => {
            const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
            const levels = Array.from(headings).map((h) => parseInt(h.tagName[1]));
            const issues: string[] = [];

            // Must start with h1
            if (levels.length > 0 && levels[0] !== 1) {
                issues.push('First heading is not h1');
            }

            // No skipped levels (e.g., h1 → h3 without h2)
            for (let i = 1; i < levels.length; i++) {
                if (levels[i] > levels[i - 1] + 1) {
                    issues.push(`Skipped heading level: h${levels[i - 1]} → h${levels[i]}`);
                }
            }

            return issues;
        });
        expect(headingIssues).toEqual([]);
    });

    test('interactive elements are keyboard accessible', async ({ page }) => {
        await page.goto('/login');

        // Tab through the page and verify focus moves to interactive elements
        await page.keyboard.press('Tab');
        const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
        expect(firstFocused).toBeDefined();

        // Verify focus is visible (has outline or focus indicator)
        const hasFocusStyle = await page.evaluate(() => {
            const el = document.activeElement;
            if (!el) return false;
            const style = window.getComputedStyle(el);
            const outline = style.outline;
            const boxShadow = style.boxShadow;
            return outline !== 'none' || boxShadow !== 'none';
        });
        expect(hasFocusStyle).toBe(true);
    });

    test('buttons and links have accessible names', async ({ page }) => {
        await page.goto('/');

        const unlabeledInteractive = await page.evaluate(() => {
            const elements = document.querySelectorAll('a, button, [role="button"], [role="link"]');
            return Array.from(elements).filter((el) => {
                const text = el.textContent?.trim();
                const ariaLabel = el.getAttribute('aria-label');
                const ariaLabelledBy = el.getAttribute('aria-labelledby');
                const title = el.getAttribute('title');
                return !text && !ariaLabel && !ariaLabelledBy && !title;
            }).length;
        });
        expect(unlabeledInteractive).toBe(0);
    });

    test('color contrast meets WCAG AA standards', async ({ page }) => {
        await page.goto('/');

        // Check for common contrast issues (simplified check)
        const lowContrastElements = await page.evaluate(() => {
            function getLuminance(r: number, g: number, b: number): number {
                const [rs, gs, bs] = [r, g, b].map((c) => {
                    c = c / 255;
                    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
                });
                return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
            }

            function getContrastRatio(l1: number, l2: number): number {
                const lighter = Math.max(l1, l2);
                const darker = Math.min(l1, l2);
                return (lighter + 0.05) / (darker + 0.05);
            }

            function parseColor(color: string): [number, number, number] | null {
                const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
                if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
                return null;
            }

            const textElements = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, li, td, th, label, button');
            let failCount = 0;

            textElements.forEach((el) => {
                const style = window.getComputedStyle(el);
                const fg = parseColor(style.color);
                const bg = parseColor(style.backgroundColor);
                if (fg && bg) {
                    const fgLum = getLuminance(...fg);
                    const bgLum = getLuminance(...bg);
                    const ratio = getContrastRatio(fgLum, bgLum);
                    const fontSize = parseFloat(style.fontSize);
                    const isBold = parseInt(style.fontWeight) >= 700;
                    // WCAG AA: 4.5:1 for normal text, 3:1 for large text (18px+ or 14px+ bold)
                    const threshold = (fontSize >= 18 || (fontSize >= 14 && isBold)) ? 3 : 4.5;
                    if (ratio < threshold) failCount++;
                }
            });

            return failCount;
        });
        // Allow some tolerance — complex backgrounds may cause false positives
        expect(lowContrastElements).toBeLessThan(5);
    });

    test('ARIA roles are used correctly', async ({ page }) => {
        await page.goto('/');

        const ariaIssues = await page.evaluate(() => {
            const issues: string[] = [];

            // Check for invalid ARIA roles
            const allElements = document.querySelectorAll('[role]');
            const validRoles = [
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
            ];

            allElements.forEach((el) => {
                const role = el.getAttribute('role');
                if (role && !validRoles.includes(role)) {
                    issues.push(`Invalid role="${role}" on <${el.tagName.toLowerCase()}>`);
                }
            });

            return issues;
        });
        expect(ariaIssues).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLE ERROR TRACKING — Catch JS errors, failed requests, deprecation warnings
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Console & Error Tracking', () => {
    test('page loads without JavaScript errors', async ({ page }) => {
        const errors: string[] = [];

        // Collect all console errors
        page.on('console', (msg: ConsoleMessage) => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        // Collect uncaught exceptions
        page.on('pageerror', (error) => {
            errors.push(`Uncaught: ${error.message}`);
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Filter out known/acceptable errors (e.g., third-party scripts)
        const criticalErrors = errors.filter(
            (e) => !e.includes('third-party-script') && !e.includes('favicon')
        );

        expect(criticalErrors).toEqual([]);
    });

    test('no failed network requests on page load', async ({ page }) => {
        const failedRequests: { url: string; status: number }[] = [];

        page.on('response', (response) => {
            if (response.status() >= 400) {
                failedRequests.push({
                    url: response.url(),
                    status: response.status(),
                });
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Filter out expected failures (e.g., optional resources)
        const unexpectedFailures = failedRequests.filter(
            (r) => !r.url.includes('favicon') && !r.url.includes('analytics')
        );

        expect(unexpectedFailures).toEqual([]);
    });

    test('no console warnings about deprecated APIs', async ({ page }) => {
        const deprecations: string[] = [];

        page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text();
            if (msg.type() === 'warning' && (text.includes('deprecated') || text.includes('Deprecated'))) {
                deprecations.push(text);
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Log deprecations for awareness (may not be blocking)
        if (deprecations.length > 0) {
            console.warn('Deprecation warnings found:', deprecations);
        }
        // Strict mode: fail on deprecations
        expect(deprecations).toEqual([]);
    });

    test('no mixed content warnings (HTTP on HTTPS page)', async ({ page }) => {
        const mixedContent: string[] = [];

        page.on('console', (msg: ConsoleMessage) => {
            const text = msg.text();
            if (text.includes('Mixed Content') || text.includes('mixed content')) {
                mixedContent.push(text);
            }
        });

        // Only relevant for HTTPS pages
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        expect(mixedContent).toEqual([]);
    });

    test('no unhandled promise rejections', async ({ page }) => {
        const rejections: string[] = [];

        page.on('console', (msg: ConsoleMessage) => {
            if (msg.text().includes('Unhandled') || msg.text().includes('unhandled')) {
                rejections.push(msg.text());
            }
        });

        page.on('pageerror', (error) => {
            rejections.push(error.message);
        });

        await page.goto('/');

        // Trigger some interactions that might cause async errors
        await page.waitForLoadState('networkidle');

        expect(rejections).toEqual([]);
    });

    test('page navigation does not produce console errors', async ({ page }) => {
        const errors: string[] = [];

        page.on('console', (msg: ConsoleMessage) => {
            if (msg.type() === 'error') {
                errors.push(`[${page.url()}] ${msg.text()}`);
            }
        });

        // Navigate through key pages
        const routes = ['/', '/login', '/about', '/contact'];
        for (const route of routes) {
            await page.goto(route);
            await page.waitForLoadState('domcontentloaded');
        }

        expect(errors).toEqual([]);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE & LOADING — Core Web Vitals, resource loading, memory leaks
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Performance', () => {
    test('page loads within acceptable time', async ({ page }) => {
        const startTime = Date.now();
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');
        const loadTime = Date.now() - startTime;

        // Page should load within 3 seconds
        expect(loadTime).toBeLessThan(3000);
    });

    test('no layout shifts after initial load (CLS)', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Measure Cumulative Layout Shift
        const cls = await page.evaluate(() => {
            return new Promise<number>((resolve) => {
                let clsValue = 0;
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (!(entry as any).hadRecentInput) {
                            clsValue += (entry as any).value;
                        }
                    }
                });
                observer.observe({ type: 'layout-shift', buffered: true });
                // Wait a moment for any pending shifts
                setTimeout(() => {
                    observer.disconnect();
                    resolve(clsValue);
                }, 1000);
            });
        });

        // CLS should be under 0.1 (good) or 0.25 (needs improvement)
        expect(cls).toBeLessThan(0.25);
    });

    test('no excessively large resources loaded', async ({ page }) => {
        const largeResources: { url: string; size: number }[] = [];

        page.on('response', async (response) => {
            try {
                const body = await response.body();
                if (body.length > 1_000_000) { // > 1MB
                    largeResources.push({
                        url: response.url(),
                        size: body.length,
                    });
                }
            } catch {
                // Some responses can't be read (e.g., redirects)
            }
        });

        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Flag resources over 1MB (may indicate unoptimized assets)
        if (largeResources.length > 0) {
            console.warn('Large resources:', largeResources.map((r) => `${r.url} (${(r.size / 1024 / 1024).toFixed(2)}MB)`));
        }
        expect(largeResources.length).toBeLessThan(3);
    });

    test('page does not have memory leaks on repeated navigation', async ({ page }) => {
        await page.goto('/');

        // Get initial heap size
        const initialHeap = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize);
        if (!initialHeap) return; // memory API not available in all browsers

        // Navigate back and forth multiple times
        for (let i = 0; i < 5; i++) {
            await page.goto('/about');
            await page.goto('/');
        }

        // Force garbage collection if available
        await page.evaluate(() => {
            if ((window as any).gc) (window as any).gc();
        });

        const finalHeap = await page.evaluate(() => (performance as any).memory?.usedJSHeapSize);
        const growth = finalHeap - initialHeap;

        // Heap should not grow more than 10MB after repeated navigation
        expect(growth).toBeLessThan(10_000_000);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL REGRESSION — Screenshot comparison (optional, requires baseline)
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Browser — [Page/Feature Name] — Visual Regression', () => {
    test('page matches visual baseline', async ({ page }) => {
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        // Full page screenshot comparison
        await expect(page).toHaveScreenshot('homepage.png', {
            fullPage: true,
            maxDiffPixelRatio: 0.01, // Allow 1% pixel difference
        });
    });

    test('responsive layout matches baseline at mobile', async ({ page }) => {
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/');
        await page.waitForLoadState('networkidle');

        await expect(page).toHaveScreenshot('homepage-mobile.png', {
            fullPage: true,
            maxDiffPixelRatio: 0.02,
        });
    });
});
```

**Key points:**
- Browser tests use standard Playwright `page` fixture
- `baseURL` is set from `config.openapi.baseUrl` in the project config
- Use Playwright's built-in locators (`getByRole`, `getByLabel`, `getByText`, etc.)
- Available in `browser-chromium`, `browser-firefox`, `browser-webkit` projects
- **Always include these test categories:**
  - **Functional** — Core user flows and interactions
  - **Responsiveness** — Multiple viewports (320px–1920px), overflow checks, touch targets
  - **Accessibility (ARIA)** — Landmarks, labels, headings, keyboard nav, contrast, valid roles
  - **Console & Error Tracking** — JS errors, failed requests, deprecations, mixed content, unhandled rejections
  - **Performance** — Load time, CLS, large resources, memory leaks
  - **Visual Regression** — Screenshot baselines (optional, requires initial baseline generation)
- Use `page.on('console')` and `page.on('pageerror')` to capture runtime errors
- Filter known/acceptable errors (third-party scripts, favicon) to reduce noise
- Responsiveness tests should verify no horizontal overflow, readable text, and proper navigation
- Accessibility checks are automated approximations — note that full WCAG compliance requires manual testing with assistive technologies

---

## Skill 9: Create a Property-Based Test

**When to use:** Testing invariants that should hold for any valid input (config parsing, data transformations, validation logic).

**Steps:**

1. Create a file with `*.prop.ts` extension in `tests/properties/`
2. Import `fast-check` for property generators
3. Use Playwright's `test` for the test runner

**Template:**

```typescript
import { test, expect } from '@playwright/test';
import fc from 'fast-check';

test.describe('Property — [Invariant Name]', () => {
    test('invariant description', () => {
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

    test('roundtrip: encode then decode returns original', () => {
        fc.assert(
            fc.property(
                fc.record({
                    name: fc.string(),
                    age: fc.integer({ min: 0, max: 150 }),
                }),
                (original) => {
                    const encoded = encode(original);
                    const decoded = decode(encoded);
                    expect(decoded).toEqual(original);
                }
            )
        );
    });
});
```

**Key points:**
- Property tests import from `@playwright/test` (not `../../src`) since they don't use fixtures
- Use `fc.assert(fc.property(...))` pattern
- Common arbitraries: `fc.string()`, `fc.integer()`, `fc.boolean()`, `fc.record()`, `fc.array()`, `fc.oneof()`
- Default 100 runs; increase with `{ numRuns: 1000 }` for critical invariants
- File must end in `.prop.ts` to match the `property-tests` project

---

## Skill 10: Create a Custom Fixture

**When to use:** Adding a new integration (S3, Elasticsearch, gRPC, etc.) to the framework.

**Steps:**

1. Define the client interface
2. Create the fixture file in `src/fixtures/`
3. Register in `src/fixtures/index.ts`
4. Optionally add config to `environments.json` and `src/config/schema.ts`

**Template:**

```typescript
// src/fixtures/my-service.fixture.ts
import { ConfigLoader } from '../config/loader';
import { FixtureInitError } from '../errors';

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
import { myServiceFixture, type MyServiceClient } from './my-service.fixture';

// Add to allFixtures spread:
const allFixtures = {
    ...configOptionFixtures,
    ...openApiFixture,
    ...databaseFixture,
    ...kafkaFixture,
    ...redisConfigFixture,
    ...redisFixture,
    ...mobilewrightFixture,
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

**When to use:** Tests that need specific data state before running.

**Pattern — using `test.beforeEach` / `test.afterEach`:**

```typescript
import { test, expect } from '../../src';

test.describe('Orders API', () => {
    let testOrderId: string;

    test.beforeEach(async ({ databaseClient }) => {
        // Seed test data
        await databaseClient.execute(
            'INSERT INTO orders (id, name, status) VALUES ($1, $2, $3)',
            ['test-order-1', 'Setup Order', 'active']
        );
        testOrderId = 'test-order-1';
    });

    test.afterEach(async ({ databaseClient }) => {
        // Cleanup test data
        await databaseClient.execute(
            'DELETE FROM orders WHERE id = $1',
            [testOrderId]
        );
    });

    test('fetch order by id', async ({ openApiClient }) => {
        const { client } = openApiClient;
        const response = await (client as any).getOrder({ id: testOrderId });
        expect(response.status).toBe(200);
        expect(response.data.name).toBe('Setup Order');
    });
});
```

---

## Skill 14: Tag and Filter Tests

**When to use:** Organizing tests by category (smoke, regression, critical).

**Pattern:**

```typescript
import { test, expect } from '../../src';

// Tag tests using test.describe or individual test annotations
test.describe('Critical Path @smoke @critical', () => {
    test('login flow', async ({ openApiClient }) => {
        // ...
    });
});

// Or tag individual tests
test('health check @smoke', async ({ openApiClient }) => {
    const { client } = openApiClient;
    const response = await (client as any).healthCheck();
    expect(response.status).toBe(200);
});
```

**Run by tag:**
```bash
npm run test:tag -- @smoke
npx playwright test --grep @critical
npx playwright test --grep-invert @slow  # exclude slow tests
```

---

## Skill 15: Combine Multiple Fixtures in One Test

**When to use:** Integration tests that span multiple systems.

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Integration — End-to-End Order Flow', () => {
    test('create order via API, verify in DB, check event in Kafka', async ({
        openApiClient,
        databaseClient,
        kafkaClient,
    }) => {
        // 1. Create via API
        const { client } = openApiClient;
        const response = await (client as any).createOrder(null, {
            product: 'Widget',
            quantity: 5,
        });
        expect(response.status).toBe(201);
        const orderId = response.data.id;

        // 2. Verify in database
        const rows = await databaseClient.query<{ id: string; product: string }>(
            'SELECT id, product FROM orders WHERE id = $1',
            [orderId]
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].product).toBe('Widget');

        // 3. Verify event was published
        const messages = await kafkaClient.consume('order-events', {
            count: 1,
            timeout: 10000,
            fromBeginning: true,
        });
        const event = JSON.parse(messages[0].value.toString());
        expect(event.orderId).toBe(orderId);
        expect(event.type).toBe('order.created');
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

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('OTP — 2FA Authentication Flow', () => {
    test('generate and verify a TOTP token', async ({ otpClient }) => {
        // Generate a new secret (simulates user enabling 2FA)
        const secret = otpClient.generateSecret();
        expect(secret).toMatch(/^[A-Z2-7]+$/); // base32 format

        // Generate a time-based token
        const token = await otpClient.generateTotp(secret);
        expect(token).toMatch(/^\d{6}$/);

        // Verify the token is valid
        const isValid = await otpClient.verifyTotp(token, secret);
        expect(isValid).toBe(true);
    });

    test('reject an invalid TOTP token', async ({ otpClient }) => {
        const secret = otpClient.generateSecret();

        const isValid = await otpClient.verifyTotp('000000', secret);
        expect(isValid).toBe(false);
    });

    test('HOTP tokens are counter-specific', async ({ otpClient }) => {
        const secret = otpClient.generateSecret();

        // Generate token for counter 1
        const token = await otpClient.generateHotp(1, secret);
        expect(token).toMatch(/^\d{6}$/);

        // Verify against correct counter
        const validAtCounter1 = await otpClient.verifyHotp(token, 1, secret);
        expect(validAtCounter1).toBe(true);

        // Reject against wrong counter
        const validAtCounter2 = await otpClient.verifyHotp(token, 2, secret);
        expect(validAtCounter2).toBe(false);
    });

    test('generate otpauth URI for QR code provisioning', async ({ otpClient }) => {
        const secret = otpClient.generateSecret();

        const uri = otpClient.generateKeyUri('user@example.com', 'MyApp', secret);
        expect(uri).toContain('otpauth://totp/');
        expect(uri).toContain('secret=');
        expect(uri).toContain('issuer=MyApp');
    });
});

// Integration example: OTP + API login flow
test.describe('OTP — Login with 2FA', () => {
    test('complete 2FA login flow', async ({ otpClient, openApiClient }) => {
        const { client } = openApiClient;
        const secret = 'JBSWY3DPEHPK3PXP'; // pre-configured test user secret

        // Step 1: Initial login (returns 2FA challenge)
        const loginResponse = await (client as any).login(null, {
            email: 'test@example.com',
            password: 'password123',
        });
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.data.requires2FA).toBe(true);

        // Step 2: Generate TOTP and submit
        const token = await otpClient.generateTotp(secret);
        const verifyResponse = await (client as any).verify2FA(null, {
            sessionId: loginResponse.data.sessionId,
            token,
        });
        expect(verifyResponse.status).toBe(200);
        expect(verifyResponse.data).toHaveProperty('accessToken');
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

## Quick Decision Guide

| I want to... | Use Skill |
|---|---|
| Test a REST API endpoint | Skill 1 (OpenAPI) |
| Query or modify database records | Skill 2 (Database) |
| Test event publishing/consuming | Skill 3 (Kafka) |
| Test caching or pub/sub | Skill 4 (Redis) |
| Test a native mobile app | Skill 5 (Mobilewright) |
| Test a web page in a browser | Skill 6 (Browser) |
| Verify an invariant for all inputs | Skill 7 (Property) |
| Add a new service integration | Skill 8 (Custom Fixture) |
| Target a new environment | Skill 9 (Environment) |
| Create a new test suite | Skill 10 (Project) |
| Set up/tear down test data | Skill 11 (Data Lifecycle) |
| Organize tests by category | Skill 12 (Tags) |
| Test across multiple systems | Skill 13 (Multi-Fixture) |
| Test 2FA/MFA with OTP tokens | Skill 14 (OTP) |
| Assign unique TestCaseIDs & test steps | Skill 17 (TestCaseID + Steps) |

---

## Skill 17: Assign Unique TestCaseIDs and Test Steps

**When to use:** ALWAYS — every test that is generated must include a unique TestCaseID and structured test steps. This is mandatory for all test generation.

**Purpose:** Ensures full traceability between test cases and requirements, enables filtering by ID, prevents duplicate test identifiers across the entire suite, and provides step-level failure tracking in reports.

**Format:** `TC-XXX-NNN`

| Category Code | Domain |
|---|---|
| `API` | OpenAPI / REST API tests |
| `DB` | Database tests |
| `KFK` | Kafka tests |
| `RDS` | Redis tests |
| `MDB` | MongoDB tests |
| `GQL` | GraphQL tests |
| `BRW` | Browser tests |
| `MOB` | Mobile (Mobilewright) tests |
| `OTP` | OTP/2FA tests |
| `INT` | Integration (multi-fixture) tests |
| `PROP` | Property-based tests |

**Steps:**

1. Determine the category code based on the fixture/domain being tested
2. Search all existing `*.spec.ts` and `*.prop.ts` files for the highest existing number in that category (e.g., grep for `TC-API-` to find the last API test ID)
3. Assign the next sequential number, zero-padded to 3 digits
4. Place the TestCaseID in square brackets at the **start** of the test title
5. Add the TestCaseID as a Playwright tag using `{ tag: ['@TC-XXX-NNN'] }` as the second argument to `test()`
6. Structure the test body using `await test.step('Step N: description', async () => { ... })` for each logical action

**Template:**

```typescript
import { test, expect } from '../../src';

test.describe('Feature Name', () => {
    test('[TC-API-001] GET /items — list all items returns 200', { tag: ['@TC-API-001'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Send GET request to /items endpoint', async () => {
            const response = await (client as any).listItems();
            expect(response.status).toBe(200);
        });

        await test.step('Step 2: Verify response body is an array', async () => {
            const response = await (client as any).listItems();
            expect(response.data).toBeInstanceOf(Array);
        });
    });

    test('[TC-API-002] POST /items — create item returns 201', { tag: ['@TC-API-002'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;
        let createdItem: any;

        await test.step('Step 1: Send POST request with valid item data', async () => {
            const response = await (client as any).createItem(null, {
                name: 'New Item',
                description: 'Created via test',
            });
            expect(response.status).toBe(201);
            createdItem = response.data;
        });

        await test.step('Step 2: Verify response contains item with generated ID', async () => {
            expect(createdItem).toHaveProperty('id');
            expect(createdItem.name).toBe('New Item');
        });
    });

    test('[TC-API-003] GET /items/:id — non-existent ID returns 404', { tag: ['@TC-API-003'] }, async ({ openApiClient }) => {
        const { client } = openApiClient;

        await test.step('Step 1: Send GET request with non-existent ID', async () => {
            try {
                await (client as any).getItemById({ id: 'non-existent-id-999' });
            } catch (error: any) {
                expect(error.response.status).toBe(404);
            }
        });
    });
});
```

**Test Steps Rules:**

1. **Every test must have steps** — use `await test.step('Step N: ...', async () => { ... })` to wrap each logical action
2. **Naming convention:** `Step N: <verb phrase>` — use a clear action verb describing what the step does
3. **Granularity:** Each step should represent one logical action or assertion group (not one line of code)
4. **Steps appear in reports:** Playwright HTML reports, trace viewer, and CI logs show each step individually — a failed step pinpoints exactly where the test broke
5. **Variables can span steps:** Declare variables outside steps and assign inside them when later steps need the result

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

1. **Uniqueness is mandatory** — no two tests in the entire project may share the same TestCaseID
2. **Never reuse IDs** — even if a test is deleted, its ID is retired
3. **Sequential within category** — always increment from the highest existing number
4. **Title and tag** — the ID must appear in `[TC-XXX-NNN]` at the start of the title AND as `{ tag: ['@TC-XXX-NNN'] }` options object (second argument to `test()`)
5. **Check before assigning** — always scan existing test files to find the current highest ID in the category before assigning new ones

**Verification command:**

```bash
# Find all TestCaseIDs in the project and check for duplicates
grep -roh 'TC-[A-Z]*-[0-9]*' tests/ | sort | uniq -d
# Should return empty (no duplicates)
```

**Finding the next available ID:**

```bash
# Example: find highest API test case ID
grep -roh 'TC-API-[0-9]*' tests/ | sort -t'-' -k3 -n | tail -1
# Returns e.g. TC-API-042 → next is TC-API-043
```
