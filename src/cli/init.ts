#!/usr/bin/env node

import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runCheck, runNextId } from './check-tests.js';
import { ROOT_CONFIG_TEMPLATE, SUPPORT_DIRS, TEST_TYPES, configSnippet, projectsTemplate } from './layout.js';
import { planOrganize, runOrganize } from './organize.js';
import { FIXTURE_PACKAGES } from '../fixtures/optional-package.js';

export * from './check-tests.js';
export * from './layout.js';
export * from './organize.js';

// ─────────────────────────────────────────────────────────────────────────────
// Directory structure to scaffold
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTORIES = [...TEST_TYPES.map((t) => t.dir), ...SUPPORT_DIRS];

// ─────────────────────────────────────────────────────────────────────────────
// File templates
// ─────────────────────────────────────────────────────────────────────────────

const FILES: Record<string, string> = {
    '.gitignore': `node_modules/
dist/
playwright-report/
test-results/
blob-report/
*.tgz
.env
.env.*
!.env.example
!.env.*.example
.auth/
`,

    'playwright.config.ts': ROOT_CONFIG_TEMPLATE,

    '.mcp.json': `{
    "mcpServers": {
        "propmaster": {
            "command": "npx",
            "args": ["propmaster", "mcp"]
        }
    }
}
`,

    'environments.json': `{
    "environments": {
        "local": {
            "openapi": {
                "specPath": "./specs/api.yaml",
                "baseUrl": "http://localhost:3000"
            },
            "database": {
                "type": "postgresql",
                "host": "localhost",
                "port": 5432,
                "database": "testdb",
                "username": "test",
                "password": "test"
            },
            "kafka": {
                "brokers": ["localhost:9092"]
            },
            "redis": {
                "host": "localhost",
                "port": 6379
            }
        },
        "dev": {
            "openapi": {
                "specPath": "https://api.dev.example.com/openapi.json",
                "baseUrl": "https://api.dev.example.com"
            },
            "database": {
                "type": "postgresql",
                "host": "dev-db.example.com",
                "port": 5432,
                "database": "testdb",
                "username": "dev_user",
                "password": ""
            },
            "kafka": {
                "brokers": ["kafka.dev.example.com:9092"]
            },
            "redis": {
                "host": "redis.dev.example.com",
                "port": 6379
            }
        }
    }
}
`,

    'package.json': `{
    "name": "my-propmaster-project",
    "version": "1.0.0",
    "description": "Playwright test project powered by @inluxc/propmaster",
    "private": true,
    "type": "module",
    "scripts": {
        "test": "npx playwright test",
        "test:api": "npx playwright test --project=api",
        "test:integration": "npx playwright test --project=integration",
        "test:e2e": "npx playwright test --project='e2e-*'",
        "test:mobile": "npx playwright test --project=mobile-android",
        "test:tag": "npx playwright test --grep",
        "typecheck": "tsc --noEmit",
        "lint:tests": "propmaster check",
        "next-id": "propmaster next-id",
        "verify": "npm run typecheck && npm run lint:tests"
    },
    "propmaster": {
        "testDirs": ["tests"],
        "testFileSuffixes": [".spec.ts", ".test.ts"],
        "exemptDirs": [],
        "docFiles": ["AGENTS.md", "SKILLS.md"]
    },
    "dependencies": {
        "@inluxc/propmaster": "^1.0.0",
        "@playwright/test": "^1.65.1"
    },
    "devDependencies": {
        "@types/node": "^22.20.5",
        "typescript": "^7.0.2"
    },
    "engines": {
        "node": ">=22.12.0"
    }
}
`,

    'tsconfig.json': `{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "bundler",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "resolveJsonModule": true,
        "declaration": true,
        "sourceMap": true,
        "outDir": "./dist",
        "rootDir": ".",
        "types": ["node"],
        "paths": {
            "@pages/*": ["./tests/support/pages/*"],
            "@utils/*": ["./tests/support/utils/*"],
            "@fixtures/*": ["./tests/support/fixtures/*"],
            "@data/*": ["./tests/support/data/*"],
            "@models/*": ["./tests/support/models/*"]
        }
    },
    "include": [
        "tests/**/*.ts",
        "playwright.config.ts"
    ],
    "exclude": [
        "node_modules",
        "dist"
    ]
}
`,

    'AGENTS.md': `# AI Agent Instructions

Playwright test project using the [@inluxc/propmaster](https://github.com/Inluxc/propmaster) fixture framework. Step-by-step recipes with copyable templates live in [SKILLS.md](SKILLS.md).

## Agent Workflow — Required Checks

These commands give you fast, machine-checkable feedback. Use them instead of checking conventions by hand:

\`\`\`bash
npm run next-id -- API          # next free TestCaseID in a category, e.g. TC-API-001
npm run next-id -- API 3        # three sequential IDs
npm run lint:tests              # IDs, tags, uniqueness, test.step(), imports (specs + AGENTS.md/SKILLS.md samples)
npm run lint:tests -- --json    # same, as JSON: { ok, violations: [{ file, line, rule, test, message }] }
npm run lint:tests -- --list-ids  # every TestCaseID in use, with file:line
npm run verify                  # typecheck + lint:tests — run before finishing any task
npx propmaster generate openapi --dry-run   # API test skeletons from the spec, one file per tag (drop --dry-run to write)
\`\`\`

\`lint:tests\` (\`propmaster check\`) exits non-zero on any violation. Each violation names the rule (\`tc-id\`, \`tc-tag\`, \`tc-unique\`, \`test-step\`, \`import\`) and the fix.

## Propmaster MCP server

\`.mcp.json\` connects the \`propmaster\` MCP server (\`npx propmaster mcp\`, read-only). Use it to see the real backends instead of guessing: \`openapi_operations\` for operation IDs and parameters, \`db_query\` / \`mongo_find\` / \`redis_get\` / \`kafka_peek\` / \`neo4j_read\` for what's actually stored, \`next_test_id\` for new IDs and \`check_tests\` after changing tests. Tests still create their data through the fixtures, never through MCP write tools.

## Structure

One folder per test type. Each folder's \`projects.ts\` defines its Playwright projects, and the root \`playwright.config.ts\` imports them all:

\`\`\`
tests/
├── api/             # REST/GraphQL tests: no browser, device or backend service  → --project=api
├── integration/     # need a database, broker or cache                           → --project=integration
├── e2e/             # browser user journeys                                      → --project='e2e-*'
├── mobile/          # Appium / GADS device tests                                 → --project=mobile-android
└── support/
    ├── pages/       # Page Object Model classes (*.page.ts)
    ├── fixtures/    # Custom test fixtures (*.fixture.ts)
    ├── data/        # Fixed test data (JSON/YAML)
    ├── models/      # Database models and schemas
    ├── utils/       # Test utilities and helpers
    └── config/      # Test configuration helpers
\`\`\`

**Where a test goes** is decided by its fixtures: \`appiumDriver\` → \`mobile/\`; \`page\`/\`context\`/\`browser\` → \`e2e/\` (even if it also uses API fixtures to set up data); a database, Kafka, RabbitMQ, Redis, MongoDB or Neo4j client → \`integration/\`; only \`openApiClient\`/\`graphqlClient\`/\`request\` → \`api/\`. Spec files end in \`.spec.ts\`. Run \`npx propmaster organize\` to check (it prints where each test belongs).

## Writing Tests

### Imports

Import \`test\` and \`expect\` from \`@inluxc/propmaster\` — its \`test\` object has every fixture registered:

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';
\`\`\`

**Never** value-import \`test\`/\`expect\` from \`@playwright/test\` in a test file. Type-only imports (\`import type { Page } from '@playwright/test'\`) are fine.

Each fixture's driver is an optional dependency. If a test fails with \`MissingPackageError\`, run the install command it prints (e.g. \`npm install --save-dev kafkajs\`) and add the package to \`devDependencies\`; don't work around it.

### Test Structure

Every test has a unique TestCaseID in its title **and** as a tag, and its body is broken into \`test.step()\` blocks:

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';

test.describe('API — Users', () => {
    test('[TC-API-NNN] GET /users returns 200', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        let response: any;

        await test.step('Step 1: Send GET request to /users', async () => {
            response = await (openApiClient.client as any).listUsers();
        });

        await test.step('Step 2: Verify the response', async () => {
            expect(response.status).toBe(200);
            expect(Array.isArray(response.data)).toBe(true);
        });
    });
});
\`\`\`

\`TC-API-NNN\` above is a placeholder. Replace it with a real ID from \`npm run next-id -- API\`; \`npm run lint:tests\` fails while a placeholder is left in a spec file.

## Test Case ID Convention

- **Pattern:** \`TC-XXX-NNN\` — \`XXX\` is a category code, \`NNN\` a zero-padded sequential number.
- **Category codes:** \`API\`, \`DB\`, \`KFK\`, \`RDS\`, \`MDB\`, \`NEO\`, \`GQL\`, \`BRW\`, \`APM\`, \`GDS\`, \`OTP\`, \`INT\`, or a custom 2–6 character code.
- **Title:** starts with \`[TC-XXX-NNN]\`.
- **Tag:** \`{ tag: ['@TC-XXX-NNN'] }\` as the second argument to \`test()\`, with the same ID.
- **Unique:** no two tests share an ID. Always take IDs from \`npm run next-id -- <CATEGORY>\`; never guess.
- **Never reuse:** a deleted test's ID is retired. \`next-id\` only sees IDs still in the code, so never renumber.
- **Steps are mandatory:** every test body uses \`await test.step('Step N: <verb phrase>', async () => { ... })\`.

Parameterized tests (generated in a loop) put an ID in each data row and build the title and tag from it:

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';

const cases = [
    { id: 'TC-BRW-NNN', width: 375 },
    { id: 'TC-BRW-NNN', width: 1280 },
];

for (const c of cases) {
    test(\`[\${c.id}] home page renders at \${c.width}px\`, { tag: [\`@\${c.id}\`] }, async ({ page }) => {
        await test.step('Step 1: Open the home page', async () => {
            await page.setViewportSize({ width: c.width, height: 800 });
            await page.goto('/');
        });

        await test.step('Step 2: Verify the heading is visible', async () => {
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        });
    });
}
\`\`\`

## Checker Configuration

\`propmaster check\` reads the \`propmaster\` key in \`package.json\`:

\`\`\`json
"propmaster": {
    "testDirs": ["tests"],
    "testFileSuffixes": [".spec.ts", ".test.ts"],
    "exemptDirs": [],
    "docFiles": ["AGENTS.md", "SKILLS.md"]
}
\`\`\`

Files under \`exemptDirs\` are skipped (their IDs are still reserved for \`next-id\`). Code samples in \`docFiles\` are checked too, with placeholder IDs like \`TC-API-NNN\` allowed.

## Conventions

- Each spec goes in the folder for its type (\`tests/api\`, \`tests/integration\`, \`tests/e2e\`, \`tests/mobile\`); keep one type per file
- Page objects go in \`tests/support/pages/\` with a \`.page.ts\` suffix
- Test data goes in \`tests/support/data/\` as JSON or YAML files
- Custom fixtures extend the base \`test\` in \`tests/support/fixtures/\`
- Use parameterized queries for all database operations — never string interpolation
- Use \`test.describe()\` to group related tests; keep each file focused on one feature
- **Every test has a unique TestCaseID in its title and tag**
- **Every test body uses \`test.step()\`**
- **Run \`npm run verify\` before finishing**
`,

    'SKILLS.md': `# AI Skills

**Every template below follows the conventions in Skill 0.** Templates use placeholder IDs such as \`TC-API-NNN\`. Replace each one with a real ID from \`npm run next-id\`; \`npm run lint:tests\` fails while any placeholder is left in a spec file.

## Skill 0: Test Conventions (applies to every test)

1. Get IDs before writing tests — one per test:
   \`\`\`bash
   npm run next-id -- API        # prints e.g. TC-API-001
   npm run next-id -- API 3      # prints TC-API-001, TC-API-002, TC-API-003
   \`\`\`
2. Put the ID at the start of the title **and** in the tag:
   \`test('[TC-API-001] does something', { tag: ['@TC-API-001'] }, async ({ ... }) => { ... })\`
3. Break every test body into \`await test.step('Step N: <verb phrase>', async () => { ... })\` blocks.
4. Import \`test\` and \`expect\` from \`@inluxc/propmaster\`, never from \`@playwright/test\` (type-only imports are fine).
5. Check your work:
   \`\`\`bash
   npm run lint:tests            # IDs, tags, uniqueness, steps, imports
   npm run lint:tests -- --json  # same, machine-readable
   npm run verify                # typecheck + lint:tests
   \`\`\`

Rules: IDs are unique across the project, never reused after a test is deleted, and always taken from \`npm run next-id\` — don't guess.

## Skill 1: Create a Spec Test

Create a \`.spec.ts\` file in the folder for the test's type: \`tests/api/\` (HTTP/GraphQL clients only), \`tests/integration/\` (database, Kafka, RabbitMQ, Redis, MongoDB or Neo4j clients), \`tests/e2e/\` (\`page\`) or \`tests/mobile/\` (\`appiumDriver\`, a WebdriverIO \`Browser\`; set \`appium.gads\` to run on a GADS device farm).

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';

test.describe('Feature Name', () => {
    test('[TC-API-NNN] should do something', { tag: ['@TC-API-NNN'] }, async ({ openApiClient }) => {
        let response: any;

        await test.step('Step 1: Prepare test data', async () => {
            // Arrange
        });

        await test.step('Step 2: Call the API', async () => {
            response = await (openApiClient.client as any).someOperation();
        });

        await test.step('Step 3: Verify the response', async () => {
            expect(response.status).toBe(200);
        });
    });
});
\`\`\`

Steps:
1. Pick the category code (\`API\`, \`DB\`, \`KFK\`, \`AMQ\`, \`RDS\`, \`MDB\`, \`NEO\`, \`GQL\`, \`BRW\`, \`APM\`, \`GDS\`, \`OTP\`, \`INT\`, or a custom one)
2. Run \`npm run next-id -- <CATEGORY> <count>\` and replace every placeholder ID
3. Run \`npm run lint:tests\`

## Skill 2: Create a Browser Test with a Page Object

Create page objects in \`tests/support/pages/\` with a \`.page.ts\` extension, and browser specs in \`tests/e2e/\` with a \`.spec.ts\` extension.

\`\`\`typescript
import type { Locator, Page } from '@playwright/test';

export class LoginPage {
    readonly emailInput: Locator;
    readonly passwordInput: Locator;
    readonly submitButton: Locator;

    constructor(private readonly page: Page) {
        this.emailInput = page.getByLabel('Email');
        this.passwordInput = page.getByLabel('Password');
        this.submitButton = page.getByRole('button', { name: 'Sign In' });
    }

    async goto() {
        await this.page.goto('/login');
    }

    async login(email: string, password: string) {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }
}
\`\`\`

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';
import { LoginPage } from '../support/pages/login.page';

test.describe('Browser — Login', () => {
    test('[TC-BRW-NNN] valid credentials reach the dashboard', { tag: ['@TC-BRW-NNN'] }, async ({ page }) => {
        const login = new LoginPage(page);

        await test.step('Step 1: Navigate to the login page', async () => {
            await login.goto();
        });

        await test.step('Step 2: Submit valid credentials', async () => {
            await login.login('user@example.com', 'secret123');
        });

        await test.step('Step 3: Verify redirect to the dashboard', async () => {
            await expect(page).toHaveURL(/dashboard/);
        });
    });
});
\`\`\`

## Skill 3: Create a Database Test

\`\`\`typescript
import { test, expect } from '@inluxc/propmaster';

test.describe('Database — Users', () => {
    test('[TC-DB-NNN] inserted user can be read back', { tag: ['@TC-DB-NNN'] }, async ({ databaseClient }) => {
        const email = \`user-\${Date.now()}@example.com\`;

        await test.step('Step 1: Insert a user', async () => {
            const result = await databaseClient.execute(
                'INSERT INTO users (name, email) VALUES ($1, $2)', ['Alice', email]
            );
            expect(result.affectedRows).toBe(1);
        });

        await test.step('Step 2: Verify the user is stored', async () => {
            const rows = await databaseClient.query<{ name: string }>(
                'SELECT name FROM users WHERE email = $1', [email]
            );
            expect(rows[0]?.name).toBe('Alice');
        });

        await test.step('Step 3: Clean up the user', async () => {
            await databaseClient.execute('DELETE FROM users WHERE email = $1', [email]);
        });
    });
});
\`\`\`

Always use parameterized queries (\`$1\`, \`?\`) — never string interpolation.

## Skill 4: Create a Custom Fixture

Create files in \`tests/support/fixtures/\` with a \`.fixture.ts\` extension.

\`\`\`typescript
import { test as base } from '@inluxc/propmaster';

export const test = base.extend<{ myFixture: MyType }>({
    myFixture: async ({}, use) => {
        const instance = await setup();
        await use(instance);
        await teardown(instance);
    },
});

export { expect } from '@inluxc/propmaster';
\`\`\`

Specs that need the custom fixture import \`test\`/\`expect\` from this file instead of \`@inluxc/propmaster\`; every other convention still applies.

## Skill 5: Sort Existing Tests into the Layout

\`propmaster organize\` moves tests into \`tests/api\`, \`tests/integration\`, \`tests/e2e\` and \`tests/mobile\` by their fixtures. It places most files by rule and leaves the rest for you.

1. Commit or stash your work, then see the plan:
   \`\`\`bash
   npx propmaster organize            # dry run: what moves where, and why some files stay
   npx propmaster organize --json     # same, as JSON: { moves, inPlace, ambiguous, conflicts, warnings, edits }
   \`\`\`
2. Apply it. Tracked files move with \`git mv\`, and relative imports are updated in moved files and in files that import them:
   \`\`\`bash
   npx propmaster organize --apply
   \`\`\`
3. For each entry in \`ambiguous\`, decide by hand:
   - **Mixes test types:** split the file, one file per type, then run \`organize\` again.
   - **Custom fixtures:** open the fixture definition. If it wraps \`page\`, the test is \`e2e\`; if it wraps a database, broker or cache client, \`integration\`; if only HTTP clients, \`api\`. Move the file with \`git mv\` and fix its relative imports.
   - **No fixtures (unit-style):** these usually belong next to the application code with its own unit-test runner, not in a Playwright folder. Ask before moving them.
4. For each entry in \`warnings\`, check the paths the file reads relative to itself (\`__dirname\`, \`storageState\`, \`setInputFiles\`).
5. Make sure \`playwright.config.ts\` registers every folder's \`projects.ts\`, then run \`npx playwright test --list\` and \`npm run verify\`.
`,

    // ─── Directory starter files ─────────────────────────────────────────────

    'tests/support/pages/example.page.ts': `import type { Locator, Page } from '@playwright/test';

/**
 * Example Page Object Model.
 * Create one class per page/component for reusable interactions.
 */
export class ExamplePage {
    // Locators
    readonly heading: Locator;
    readonly navLinks: Locator;

    constructor(private readonly page: Page) {
        this.heading = page.getByRole('heading', { level: 1 });
        this.navLinks = page.getByRole('navigation').getByRole('link');
    }

    // Actions
    async navigate() {
        await this.page.goto('/');
    }

    async getTitle(): Promise<string> {
        return this.page.title();
    }
}
`,

    'tests/support/utils/index.ts': `/**
 * Test utilities and helpers.
 * Add shared helper functions used across multiple test files.
 */

/**
 * Generate a unique test identifier to avoid collisions.
 */
export function uniqueId(prefix = 'test'): string {
    return \`\${prefix}-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
}

/**
 * Wait for a condition with timeout.
 */
export async function waitFor(
    condition: () => Promise<boolean>,
    options: { timeout?: number; interval?: number } = {},
): Promise<void> {
    const { timeout = 10_000, interval = 500 } = options;
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (await condition()) return;
        await new Promise((r) => setTimeout(r, interval));
    }

    throw new Error(\`waitFor timed out after \${timeout}ms\`);
}
`,

    'tests/support/fixtures/index.ts': `/**
 * Custom fixtures for this project.
 * Extend the base propmaster fixtures here.
 *
 * Example:
 *   import { test as base } from '@inluxc/propmaster';
 *   export const test = base.extend<{ myFixture: MyType }>({ ... });
 */
export {};
`,

    'tests/support/data/users.json': `[
    {
        "id": 1,
        "name": "Alice",
        "email": "alice@example.com",
        "role": "admin"
    },
    {
        "id": 2,
        "name": "Bob",
        "email": "bob@example.com",
        "role": "user"
    }
]
`,

    'tests/support/models/index.ts': `/**
 * Database models and type definitions.
 * Define interfaces that match your database schema.
 */

export interface User {
    id: number;
    name: string;
    email: string;
    role: 'admin' | 'user' | 'viewer';
    created_at?: string;
    updated_at?: string;
}

export interface Order {
    id: number;
    user_id: number;
    status: 'pending' | 'active' | 'completed' | 'cancelled';
    amount: number;
    created_at?: string;
}
`,

    'tests/support/config/index.ts': `/**
 * Test-specific configuration helpers.
 * Use this for test environment setup, feature flags, etc.
 */

export const testConfig = {
    /** Default timeout for async operations in tests */
    defaultTimeout: 10_000,

    /** Whether to run tests that require external services */
    skipExternalServices: process.env.SKIP_EXTERNAL === 'true',

    /** Base URL override for tests */
    baseUrl: process.env.PW_OPENAPI_BASE_URL ?? 'http://localhost:3000',
};
`,
    ...Object.fromEntries(TEST_TYPES.map((t) => [`${t.dir}/projects.ts`, projectsTemplate(t.type)])),
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI Logic
// ─────────────────────────────────────────────────────────────────────────────

const HELP = `
  @inluxc/propmaster CLI

  Usage:
    npx propmaster init [directory]
    npx propmaster organize [--apply] [--force] [--json] [--root <dir>]
    npx propmaster auth-setup [role...]
    npx propmaster check [--json] [--list-ids] [--root <dir>]
    npx propmaster next-id <CATEGORY> [count] [--root <dir>]
    npx propmaster generate openapi [--tag <tag>] [--operation <id>] [--dry-run] [--prism]
    npx propmaster mcp [--environment <name>] [--allow-writes] [--allow-prod]

  Commands:
    init      Scaffold the project layout: tests/api, tests/integration,
              tests/e2e, tests/mobile (each with its projects.ts) and
              tests/support. In a project that already has Playwright tests
              it adds only what's missing, moves and overwrites nothing, and
              reports where the existing tests belong.
    organize  Sort existing Playwright tests into those folders by the
              fixtures they use. Dry run by default; --apply moves the files
              (git mv when tracked) and updates relative imports. Files it
              can't place stay where they are and are listed with the reason.
    auth-setup  Create tests/e2e/auth.setup.ts: logs each role in once and saves
              its browser state, so tests start logged in (authRole option).
    check     Check test conventions: [TC-XXX-NNN] title prefix, matching
              { tag: ['@TC-XXX-NNN'] }, unique IDs, test.step() bodies, and
              no value imports of @playwright/test in test files.
              Exits 1 on violations. --json for machine-readable output,
              --list-ids to print every TestCaseID in use.
    next-id   Print the next free TestCaseID(s) for a category, e.g.
              \`propmaster next-id API 3\` → TC-API-005, TC-API-006, TC-API-007
    generate  Scaffold API tests from the OpenAPI spec into tests/api: one file
              per tag, a test per operation and documented status code, with
              real TestCaseIDs and test.step() blocks. Never overwrites a file;
              skips operations that already have a test.
              \`propmaster generate --help\` for details.
    mcp       Start an MCP server (stdio) that gives coding agents read tools
              for the configured backends (db_query, mongo_find, redis_get,
              kafka_peek, neo4j_read, openapi_operations, ...) plus
              next_test_id and check_tests. Read-only unless --allow-writes;
              refuses production environments unless --allow-prod.
              \`propmaster mcp --help\` for details.

  Configuration (optional, "propmaster" key in package.json):
    "propmaster": {
      "testDirs": ["tests"],
      "testFileSuffixes": [".spec.ts", ".prop.ts"],
      "exemptDirs": ["tests/unit/", "tests/properties/"],
      "docFiles": ["AGENTS.md", "SKILLS.md"]
    }

  Options:
    --help  Show this help message
`;

const PLAYWRIGHT_CONFIG = /^playwright\.config\.(?:c|m)?[jt]s$/;

/** Playwright config files at the root of `dir` (any extension). */
export function existingPlaywrightConfigs(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir).filter((f) => PLAYWRIGHT_CONFIG.test(f)).sort();
}

export interface InitResult {
    created: string[];
    skipped: string[];
    /** Playwright configs that were already there; when set, none is written. */
    existingConfigs: string[];
    /** Where existing tests belong, when the project already had some. */
    plan: ReturnType<typeof planOrganize> | null;
}

/**
 * Scaffolds the layout into `targetDir`. Never overwrites a file and never
 * moves one: in a project that already has Playwright tests or a config, it
 * adds only what's missing and reports where the existing tests belong.
 */
export function initProject(targetDir: string, log: (line?: string) => void = console.log): InitResult {
    const existingConfigs = existingPlaywrightConfigs(targetDir);
    const before = fs.existsSync(targetDir) ? planOrganize(targetDir) : null;
    const testCount = before ? before.moves.length + before.inPlace.length + before.ambiguous.length + before.conflicts.length : 0;
    const plan = testCount > 0 ? before : null;
    const result: InitResult = { created: [], skipped: [], existingConfigs, plan };

    for (const dir of DIRECTORIES) {
        const fullPath = path.join(targetDir, dir);
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
            log(`  ✓ Created ${dir}/`);
        } else {
            log(`  · Exists  ${dir}/`);
        }
    }
    log();

    for (const [filePath, content] of Object.entries(FILES)) {
        const fullPath = path.join(targetDir, filePath);
        if (filePath === 'playwright.config.ts' && existingConfigs.length) {
            log(`  · Skipped ${filePath} (you have ${existingConfigs.join(', ')})`);
            result.skipped.push(filePath);
            continue;
        }
        if (fs.existsSync(fullPath)) {
            log(`  · Skipped ${filePath} (already exists)`);
            result.skipped.push(filePath);
            continue;
        }
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, content, 'utf-8');
        log(`  ✓ Created ${filePath}`);
        result.created.push(filePath);
    }

    log();
    log(`  Done! Created ${result.created.length} files, skipped ${result.skipped.length} existing.`);
    log();

    if (plan || existingConfigs.length) {
        reportExisting(result, log);
    } else {
        log('  Next steps:');
        log('    1. npm install');
        log('    2. Install the driver for each fixture you use, e.g.:');
        log('         npm install --save-dev openapi-client-axios pg');
        for (const line of driverTable()) log(`         ${line}`);
        log('    3. npx playwright install');
        log('    4. Update environments.json with your service URLs');
        log('    5. Get a TestCaseID: npm run next-id -- API');
        log('    6. Create your first spec in the folder for its type, e.g. tests/api/users.spec.ts');
        log('    7. Check conventions: npm run lint:tests');
        log();
    }
    return result;
}

/** One line per fixture: the packages it needs. */
export function driverTable(): string[] {
    const width = Math.max(...Object.keys(FIXTURE_PACKAGES).map((k) => k.length));
    return Object.entries(FIXTURE_PACKAGES).map(([fixture, pkgs]) => `${fixture.padEnd(width)}  ${pkgs.join(' ')}`);
}

function reportExisting({ plan, existingConfigs }: InitResult, log: (line?: string) => void): void {
    const found = [
        existingConfigs.length ? existingConfigs.join(', ') : '',
        plan ? `${plan.moves.length + plan.inPlace.length + plan.ambiguous.length + plan.conflicts.length} test file(s)` : '',
    ].filter(Boolean);
    log(`  Existing Playwright setup found: ${found.join(', ')}.`);
    log('  Nothing was moved or overwritten.');
    log();

    if (plan) {
        const counts = TEST_TYPES.map((t) => `${t.type} ${[...plan.moves, ...plan.inPlace].filter((m) => m.type === t.type).length}`);
        log('  Where your tests belong, by the fixtures they use:');
        log(`    ${counts.join(' · ')} · to decide by hand ${plan.ambiguous.length + plan.conflicts.length}`);
        log(`    (${plan.inPlace.length} already in the right folder, ${plan.moves.length} to move)`);
        log();
        log('  Next steps:');
        log('    1. npx propmaster organize            see what moves where, and why some files stay');
        log('    2. npx propmaster organize --apply    move them and update imports (commit first)');
    } else {
        log('  Next steps:');
    }
    if (existingConfigs.length) {
        log(`    ${plan ? 3 : 1}. Add the new folders' projects to ${existingConfigs[0]}:`);
        log();
        log(
            configSnippet()
                .split('\n')
                .map((l) => `         ${l}`)
                .join('\n'),
        );
    }
    log();
}

/** The setup file `propmaster auth-setup` writes: one login per role, saved for tests to reuse. */
export function authSetupTemplate(roles: string[] = []): string {
    const rolesLine = roles.length ? `    roles: [${roles.map((r) => `'${r}'`).join(', ')}],\n` : '';
    return `import { expect, setupAuth } from '@inluxc/propmaster';

/**
 * Logs each role in once and saves its browser state to .auth/<role>.json.
 * The e2e-setup project runs this before the browser projects; tests then
 * start logged in with test.use({ authRole: 'admin' }).
 *
 * Roles and credentials come from auth.roles in environments.json. Keep
 * passwords in PW_* variables or a secrets provider, not in the file.
 */
setupAuth({
${rolesLine}    maxAgeMinutes: 30, // reuse a saved login for 30 minutes between runs
    login: async ({ page }, { username, password }) => {
        // TODO: replace with your app's login steps.
        await page.goto('/login');
        await page.getByLabel('Email').fill(username!);
        await page.getByLabel('Password').fill(password!);
        await page.getByRole('button', { name: 'Sign in' }).click();
        await expect(page).not.toHaveURL(/login/);
    },
});
`;
}

/** `propmaster auth-setup [role...]`: writes tests/e2e/auth.setup.ts unless it exists. */
export function runAuthSetup(argv: string[], cwd: string = process.cwd(), log: (line?: string) => void = console.log): number {
    const roles = argv.filter((a) => !a.startsWith('-'));
    const file = path.join(cwd, 'tests/e2e/auth.setup.ts');
    if (fs.existsSync(file)) {
        log(`  · ${path.relative(cwd, file)} already exists; nothing written.`);
        return 0;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, authSetupTemplate(roles), 'utf-8');
    log(`  ✓ Created ${path.relative(cwd, file)}`);
    log('');
    log('  Next steps:');
    log('    1. Replace the TODO login steps with your app\'s.');
    log('    2. Add the roles to environments.json, e.g.');
    log('         "auth": { "roles": { "admin": { "username": "admin@example.com" }, "viewer": { "username": "viewer@example.com" } } }');
    log('       and their passwords via PW_* variables or a secrets provider.');
    log("    3. Make sure tests/e2e/projects.ts has the e2e-setup project (new projects from `propmaster init` do).");
    log("    4. In a test: test.use({ authRole: 'admin' });");
    return 0;
}

function main(): number {
    const args = process.argv.slice(2);
    const command = args[0];

    if (command === 'check') return runCheck(args.slice(1));
    if (command === 'next-id') return runNextId(args.slice(1));
    if (command === 'organize') return runOrganize(args.slice(1));
    if (command === 'auth-setup') return runAuthSetup(args.slice(1));
    if (command !== 'init') {
        console.log(HELP);
        return command === undefined || command === '--help' || command === 'help' ? 0 : 2;
    }

    const targetDir = path.resolve(args[1] || '.');
    const isCurrentDir = targetDir === process.cwd();

    console.log('');
    console.log('  🎭 Propmaster — Initializing project...');
    console.log(`  📁 Target: ${isCurrentDir ? '.' : path.relative(process.cwd(), targetDir)}`);
    console.log('');
    initProject(targetDir);
    return 0;
}

// Run only when executed as the `propmaster` bin (or via tsx), not when the
// `@inluxc/propmaster/cli` export is imported for its checker API.
function isEntryPoint(): boolean {
    if (!process.argv[1]) return false;
    try {
        return import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
    } catch {
        return false;
    }
}

if (isEntryPoint()) {
    if (process.argv[2] === 'generate') {
        void import('./generate.js').then(({ runGenerate }) => runGenerate(process.argv.slice(3))).then((code) => {
            process.exitCode = code;
        });
    } else if (process.argv[2] === 'mcp') {
        // Loaded on demand: the server pulls in every client factory.
        void import('../mcp/server.js').then(({ runMcp }) => runMcp(process.argv.slice(3))).then((code) => {
            process.exitCode = code;
        });
    } else {
        process.exitCode = main();
    }
}
