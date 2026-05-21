import { defineConfig, devices } from '@playwright/test';
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
            name: 'mobile-ios',
            testMatch: '**/examples/mobilewright.spec.ts',
            use: {
                mobilewright: config.mobilewright ?? {
                    platform: 'ios',
                    bundleId: '',
                    deviceName: 'iPhone 15',
                    appPath: '',
                },
            },
        },
        {
            name: 'mobile-android',
            testMatch: '**/examples/mobilewright.spec.ts',
            use: {
                mobilewright: {
                    platform: 'android',
                    bundleId: config.mobilewright?.bundleId ?? '',
                    deviceName: 'Pixel 8',
                    appPath: config.mobilewright?.appPath ?? '',
                },
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
            testMatch: '**/examples/{database,kafka,redis,mongodb}.spec.ts',
            use: {
                database: config.database,
                kafka: config.kafka,
                redis: config.redis,
                mongodb: config.mongodb,
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
            name: 'property-tests',
            testMatch: '**/*.prop.ts',
            use: {},
        },

    ],
});
