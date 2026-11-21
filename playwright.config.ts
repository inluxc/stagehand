import { defineConfig, devices } from '@playwright/test';
import { EXAMPLE_AUTH } from './tests/examples/support/auth-users';
import { ConfigLoader } from './src/config/loader';
import type { ConfigOptions } from './src/fixtures';

const config = new ConfigLoader().load();

export default defineConfig<ConfigOptions>({
    testDir: './tests',
    timeout: 30_000,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'openapi',
            testMatch: '**/examples/openapi.spec.ts',
            use: {
                openapi: config.openapi,
            },
        },
        {
            // Tests written by `propmaster generate openapi` (CI generates them into
            // tests/generated/ and runs them against the Prism mock).
            name: 'openapi-generated',
            testMatch: '**/generated/**/*.spec.ts',
            use: {
                openapi: config.openapi,
            },
        },
        {
            name: 'appium-android',
            testMatch: '**/examples/appium.spec.ts',
            timeout: 300_000,
            use: {
                appium: { serverUrl: 'http://127.0.0.1:4723', ...config.appium, gads: undefined, platform: 'android' },
            },
        },
        {
            name: 'appium-ios',
            testMatch: '**/examples/appium.spec.ts',
            timeout: 300_000,
            use: {
                appium: { serverUrl: 'http://127.0.0.1:4723', ...config.appium, gads: undefined, platform: 'ios' },
            },
        },
        {
            name: 'gads',
            testMatch: '**/examples/gads.spec.ts',
            timeout: 300_000,
            use: {
                appium: config.appium,
            },
        },
        {
            name: 'browser-chromium',
            testMatch: '**/examples/browser.spec.ts',
            use: {
                ...devices['Desktop Chrome'],
                baseURL: config.openapi?.baseUrl,
            },
        },
        {
            name: 'browser-firefox',
            testMatch: '**/examples/browser.spec.ts',
            use: {
                ...devices['Desktop Firefox'],
                baseURL: config.openapi?.baseUrl,
            },
        },
        {
            name: 'browser-webkit',
            testMatch: '**/examples/browser.spec.ts',
            use: {
                ...devices['Desktop Safari'],
                baseURL: config.openapi?.baseUrl,
            },
        },
        {
            name: 'api-integration',
            testMatch: '**/examples/{database,kafka,amqp,redis,mongodb,neo4j}.spec.ts',
            use: {
                database: config.database,
                kafka: config.kafka,
                amqp: config.amqp,
                redis: config.redis,
                mongodb: config.mongodb,
                neo4j: config.neo4j,
            },
        },
        {
            name: 'integration-database',
            testMatch: '**/examples/database.spec.ts',
            use: {
                database: config.database,
            },
        },
        {
            name: 'integration-kafka',
            testMatch: '**/examples/kafka.spec.ts',
            use: {
                kafka: config.kafka,
            },
        },
        {
            name: 'integration-amqp',
            testMatch: '**/examples/amqp.spec.ts',
            use: {
                amqp: config.amqp,
            },
        },
        {
            name: 'integration-redis',
            testMatch: '**/examples/redis.spec.ts',
            use: {
                redis: config.redis,
            },
        },
        {
            name: 'integration-mongodb',
            testMatch: '**/examples/mongodb.spec.ts',
            use: {
                mongodb: config.mongodb,
            },
        },
        {
            name: 'integration-neo4j',
            testMatch: '**/examples/neo4j.spec.ts',
            use: {
                neo4j: config.neo4j,
            },
        },
        {
            name: 'auth-browser-setup',
            testMatch: '**/examples/auth-browser.setup.ts',
            use: { ...devices['Desktop Chrome'], auth: EXAMPLE_AUTH },
        },
        {
            name: 'auth-browser',
            testMatch: '**/examples/auth-browser.spec.ts',
            dependencies: ['auth-browser-setup'],
            use: { ...devices['Desktop Chrome'], auth: EXAMPLE_AUTH },
        },
        {
            name: 'integration-auth',
            testMatch: '**/examples/auth-tokens.spec.ts',
        },
        {
            name: 'integration-mocks',
            testMatch: '**/examples/mock-server.spec.ts',
            use: { mock: config.mock },
        },
        {
            name: 'integration-inbox',
            testMatch: '**/examples/inbox.spec.ts',
            use: {
                inbox: config.inbox,
            },
        },
        {
            name: 'otp',
            testMatch: '**/examples/otp.spec.ts',
            use: {
                otp: config.otp,
            },
        },
        {
            name: 'property-tests',
            testMatch: '**/*.prop.ts',
            use: {},
        },
        {
            name: 'unit-tests',
            testMatch: '**/unit/**/*.spec.ts',
            use: {},
        },

    ],
});
