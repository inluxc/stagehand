/**
 * The test layout `propmaster init` scaffolds and `propmaster organize` moves
 * existing tests into: one folder per test type, each its own set of
 * Playwright projects, all registered in one root `playwright.config.ts`.
 *
 *   tests/api/          REST / GraphQL tests — no browser, device or backend service
 *   tests/integration/  tests that need a database, broker or cache
 *   tests/e2e/          browser user journeys
 *   tests/mobile/       Appium / GADS device tests
 *   tests/support/      page objects, fixtures, data, models, helpers
 */

export type TestType = 'api' | 'integration' | 'e2e' | 'mobile';

export interface TestTypeInfo {
    type: TestType;
    /** Folder relative to the project root. */
    dir: string;
    /** Name of the function exported by `<dir>/projects.ts`. */
    exportName: string;
    summary: string;
}

export const TEST_TYPES: readonly TestTypeInfo[] = [
    { type: 'api', dir: 'tests/api', exportName: 'apiProjects', summary: 'REST / GraphQL tests: no browser, device or backend service' },
    { type: 'integration', dir: 'tests/integration', exportName: 'integrationProjects', summary: 'tests that need a database, broker or cache' },
    { type: 'e2e', dir: 'tests/e2e', exportName: 'e2eProjects', summary: 'browser user journeys' },
    { type: 'mobile', dir: 'tests/mobile', exportName: 'mobileProjects', summary: 'Appium / GADS device tests' },
];

export const SUPPORT_DIRS = ['pages', 'fixtures', 'data', 'models', 'utils', 'config'].map((d) => `tests/support/${d}`);

export function typeInfo(type: TestType): TestTypeInfo {
    return TEST_TYPES.find((t) => t.type === type)!;
}

// ─── Templates ──────────────────────────────────────────────────────────────

const PROJECT_TEMPLATES: Record<TestType, string> = {
    api: `import type { FrameworkConfig } from '@inluxc/propmaster';

/**
 * API tests: REST and GraphQL calls that need no browser, device or backend
 * service, so they run anywhere, fast. Specs: *.spec.ts files under tests/api/
 */
export const apiProjects = (config: FrameworkConfig) => [
    {
        name: 'api',
        testDir: './tests/api', // relative to playwright.config.ts
        use: {
            openapi: config.openapi,
            graphql: config.graphql,
            otp: config.otp,
        },
    },
];
`,

    integration: `import type { FrameworkConfig } from '@inluxc/propmaster';

/**
 * Integration tests: need a database, broker or cache. In CI, run this project
 * in a job with those services (see the Propmaster docs, "Running in CI").
 * Specs: *.spec.ts files under tests/integration/
 */
export const integrationProjects = (config: FrameworkConfig) => [
    {
        name: 'integration',
        testDir: './tests/integration',
        use: {
            openapi: config.openapi,
            database: config.database,
            kafka: config.kafka,
            amqp: config.amqp,
            redis: config.redis,
            mongodb: config.mongodb,
            neo4j: config.neo4j,
        },
    },
];
`,

    e2e: `import { devices } from '@playwright/test';
import type { FrameworkConfig } from '@inluxc/propmaster';

/**
 * End-to-end browser tests, one project per browser: e2e-chromium,
 * e2e-firefox and e2e-webkit. Run them all with --project='e2e-*'.
 * API and database fixtures stay available for setting up test data.
 * Specs: *.spec.ts files under tests/e2e/
 *
 * e2e-setup runs *.setup.ts files first, e.g. auth.setup.ts, which logs each
 * role in once (\`npx propmaster auth-setup\` creates it). Tests then start
 * logged in with test.use({ authRole: 'admin' }).
 */
const BROWSERS = ['Desktop Chrome', 'Desktop Firefox', 'Desktop Safari'] as const;

export const e2eProjects = (config: FrameworkConfig) => [
    {
        name: 'e2e-setup',
        testDir: './tests/e2e',
        testMatch: /.*\\.setup\\.ts/,
        use: { baseURL: process.env.BASE_URL ?? config.openapi?.baseUrl, auth: config.auth },
    },
    ...BROWSERS.map((device) => ({
        name: \`e2e-\${devices[device].defaultBrowserType}\`,
        testDir: './tests/e2e',
        dependencies: ['e2e-setup'],
        use: {
            ...devices[device],
            baseURL: process.env.BASE_URL ?? config.openapi?.baseUrl,
            openapi: config.openapi,
            graphql: config.graphql,
            database: config.database,
            otp: config.otp,
            auth: config.auth,
        },
    })),
];
`,

    mobile: `import type { FrameworkConfig } from '@inluxc/propmaster';

/**
 * Mobile tests on Appium (local server, grid, cloud farm or GADS):
 * mobile-android and mobile-ios. Run one with --project=mobile-android.
 * Specs: *.spec.ts files under tests/mobile/
 */
const PLATFORMS = ['android', 'ios'] as const;

export const mobileProjects = (config: FrameworkConfig) =>
    PLATFORMS.map((platform) => ({
        name: \`mobile-\${platform}\`,
        testDir: './tests/mobile',
        timeout: 300_000, // installing the app and queueing for a device take time
        workers: 1, // one per device: raise it to the number of devices you have
        use: {
            appium: { serverUrl: 'http://127.0.0.1:4723', ...config.appium, platform },
            otp: config.otp,
        },
    }));
`,
};

export function projectsTemplate(type: TestType): string {
    return PROJECT_TEMPLATES[type];
}

export const ROOT_CONFIG_TEMPLATE = `import { defineConfig } from '@playwright/test';
import { ConfigLoader, type ConfigOptions } from '@inluxc/propmaster';
${TEST_TYPES.map((t) => `import { ${t.exportName} } from './${t.dir}/projects';`).join('\n')}

// Settings from environments.json, .env.{environment} and PW_* variables.
const config = new ConfigLoader().load();

// One config for every test type. Each folder under tests/ defines its own
// projects in projects.ts; run one type with --project, e.g. --project=api.
export default defineConfig<ConfigOptions>({
    timeout: 30_000,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        trace: 'retain-on-failure',
    },
    projects: [
${TEST_TYPES.map((t) => `        ...${t.exportName}(config),`).join('\n')}
    ],
});
`;

/**
 * Lines to add to an existing playwright.config so it picks up the new
 * folders: the imports, the ConfigLoader call, and the project spreads.
 */
export function configSnippet(types: readonly TestType[] = TEST_TYPES.map((t) => t.type)): string {
    const infos = TEST_TYPES.filter((t) => types.includes(t.type));
    return [
        "import { ConfigLoader } from '@inluxc/propmaster';",
        ...infos.map((t) => `import { ${t.exportName} } from './${t.dir}/projects';`),
        '',
        'const config = new ConfigLoader().load();',
        '',
        '// in defineConfig({ ... }):',
        'projects: [',
        ...infos.map((t) => `    ...${t.exportName}(config),`),
        '    // ...your existing projects, minus any that matched the files that moved',
        '],',
    ].join('\n');
}
