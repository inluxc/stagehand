# Project Layout

`propmaster init` organizes tests **by type**, one folder each. The folder decides which Playwright projects run a test, and so which CI job and which services it needs.

```
tests/
├── api/             # REST / GraphQL tests: no browser, device or backend service
│   └── projects.ts  #   → project "api"
├── integration/     # need a database, broker or cache
│   └── projects.ts  #   → project "integration"
├── e2e/             # browser user journeys
│   └── projects.ts  #   → projects "e2e-chromium", "e2e-firefox", "e2e-webkit"
├── mobile/          # Appium / GADS device tests
│   └── projects.ts  #   → projects "mobile-android", "mobile-ios"
└── support/
    ├── pages/       # page objects (*.page.ts)
    ├── fixtures/    # custom fixtures (*.fixture.ts)
    ├── data/        # fixed test data (JSON / YAML)
    ├── models/      # types for your data
    ├── utils/       # helpers
    └── config/      # test configuration helpers
playwright.config.ts # one config that imports every folder's projects.ts
```

Folder names are lowercase on purpose. macOS ignores case in paths and Linux CI doesn't, so `tests/E2E` and `tests/e2e` would be the same folder locally but different ones in CI.

## Why folders by type

- **One folder = one CI job.** `--project=integration` is exactly the set of tests that needs Postgres and Kafka, so its CI job starts only those services. `api` runs with no services, and `e2e-*` runs in the Playwright image. See [Running in CI](../ci).
- **Fast feedback.** `npx playwright test --project=api` runs in seconds on a laptop with nothing else running.
- **The type is visible in the path,** in reviews, reports and test trace links.

## One config, a `projects.ts` per folder

There is a single `playwright.config.ts`, so `npx playwright test` runs everything into one HTML report and `--project` picks a type. Each folder defines its own projects in `projects.ts`, and the root config imports them:

```typescript
// playwright.config.ts (generated)
import { defineConfig } from '@playwright/test';
import { ConfigLoader, type ConfigOptions } from '@inluxc/propmaster';
import { apiProjects } from './tests/api/projects';
import { integrationProjects } from './tests/integration/projects';
import { e2eProjects } from './tests/e2e/projects';
import { mobileProjects } from './tests/mobile/projects';

const config = new ConfigLoader().load();

export default defineConfig<ConfigOptions>({
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: { trace: 'retain-on-failure' },
    projects: [
        ...apiProjects(config),
        ...integrationProjects(config),
        ...e2eProjects(config),
        ...mobileProjects(config),
    ],
});
```

```typescript
// tests/mobile/projects.ts (generated)
import type { FrameworkConfig } from '@inluxc/propmaster';

const PLATFORMS = ['android', 'ios'] as const;

export const mobileProjects = (config: FrameworkConfig) =>
    PLATFORMS.map((platform) => ({
        name: `mobile-${platform}`,
        testDir: './tests/mobile',
        timeout: 300_000,
        workers: 1, // one per device: raise it to the number of devices you have
        use: {
            appium: { serverUrl: 'http://127.0.0.1:4723', ...config.appium, platform },
        },
    }));
```

The e2e folder also gets an `e2e-setup` project that runs `*.setup.ts` files first, such as the per-role login from `npx propmaster auth-setup`; the browser projects depend on it. See [Auth: tokens and roles](../auth).

Settings that differ by type, such as timeouts, retries, browsers and the number of workers, live in that type's `projects.ts`. Each project gets only the fixture settings it needs. To add a type, create a folder with a `projects.ts` and add one import and one spread to the root config.

The generated `package.json` has a script per type:

```bash
npm run test:api            # --project=api
npm run test:integration    # --project=integration
npm run test:e2e            # --project='e2e-*'  (all three browsers)
npm run test:mobile         # --project=mobile-android
```

## Where a test goes

A test's fixtures decide its type. These are also the rules `propmaster organize` uses:

| The test (or one of its hooks) asks for | Folder |
|---|---|
| `appiumDriver`, `gadsHub` | `mobile/` |
| `page`, `context`, `browser` | `e2e/`, even if it also uses API or database fixtures to set up data |
| `databaseClient`, `kafkaClient`, `amqpClient`, `redisClient`, `mongoDbClient`, `neo4jClient` | `integration/` |
| only `openApiClient`, `graphqlClient`, `request` | `api/` |

Keep one type per file, so a file never needs two folders.

## Adding Propmaster to an existing project

Run `init` in a project that already has Playwright tests and it **moves and overwrites nothing**:

```bash
npx propmaster init
```

- It creates only the missing folders and files, and doesn't add a second config next to your `playwright.config.*`.
- It reports where your existing tests belong and prints the lines to add to your config:

```
  Existing Playwright setup found: playwright.config.js, 7 test file(s).
  Nothing was moved or overwritten.

  Where your tests belong, by the fixtures they use:
    api 1 · integration 1 · e2e 3 · mobile 0 · to decide by hand 2
    (0 already in the right folder, 5 to move)
```

## Sorting existing tests: `propmaster organize`

`organize` moves your tests into the layout. It runs as a **dry run** by default:

```bash
npx propmaster organize
```

```
  Will move 5 file(s):
    e2e/login.spec.ts              →  tests/e2e/login.spec.ts   (1 import updated)
    tests/checkout.browser.ts      →  tests/e2e/checkout.spec.ts   (2 imports updated)
    tests/specs/orders-db.spec.ts  →  tests/integration/orders-db.spec.ts
    tests/specs/users.spec.ts      →  tests/api/users.spec.ts
    tests/upload.spec.ts           →  tests/e2e/upload.spec.ts

  Imports to update in files that stay:
    tests/report.ts   (1)

  Left where they are — decide these yourself:
    tests/custom.spec.ts
        "logs in with the fixture" (line 2) uses custom fixtures (loginPage); can't tell which type they need
    tests/mixed.spec.ts
        mixes test types: e2e (1), api (1); split the file by type

  Check after moving:
    tests/e2e/upload.spec.ts
        reads files by a path relative to the test (__dirname, import.meta, readFileSync, storageState or setInputFiles); check those paths
```

Then apply it:

```bash
npx propmaster organize --apply
```

What `--apply` does:

- **Moves files with `git mv`** when they're tracked, so `git log --follow` and blame keep working. Other files are renamed directly.
- **Rewrites relative imports** in the moved files, and in files that stay but import a moved one. It keeps each import's style: no extension, `.js` for ESM, or a folder `index`.
- **Renames the old suffixes** `.browser.ts`, `.mobile.ts` and `.e2e.ts` to `.spec.ts`, since the folder now decides the project.
- **Removes folders** the move left empty.
- **Refuses to run with uncommitted changes,** so the move is easy to review and undo with git. Pass `--force` to run anyway.

What it never does:

- Overwrite a file. A taken destination is reported as a conflict.
- Touch files from other test runners (Vitest, Jest, `node:test`).
- Guess. A file it can't place stays where it is, listed with the reason.

`--json` prints the plan as `{ moves, inPlace, ambiguous, conflicts, warnings, edits }` for scripts and coding agents.

### Why rules, not AI

`organize` is plain code. The same project always gets the same plan, it needs no API key or network access, and none of your test code leaves the machine. Fixtures are a reliable signal, so rules place most files.

The files the rules can't place are where judgment helps: custom fixtures, mixed files and unit-style tests. The `SKILLS.md` that `init` adds includes a recipe (Skill 5) for your coding agent. It runs `organize --json`, opens each ambiguous file's fixtures, decides, and leaves the changes for you to review.

### What to check afterwards

1. **Your Playwright config.** `organize` doesn't edit `playwright.config.*`. Add the printed imports and project spreads, and remove old projects that matched the moved files.
2. **Paths outside imports:** `storageState`, `setInputFiles`, and `path.join(__dirname, ...)`. The files listed under *Check after moving* use them.
3. **CI and scripts** that name old paths or project names.
4. Run `npx playwright test --list` to confirm every test still has a project.
