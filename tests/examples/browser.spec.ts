/**
 * Browser Fixture — Example Test
 *
 * Demonstrates browser-based UI testing by navigating to the Petstore Swagger UI,
 * verifying page load, expanding an endpoint group, triggering a request,
 * and asserting a response is displayed.
 *
 * Prerequisites:
 *   - Playwright browsers installed (chromium, firefox, webkit)
 *   - In CI: browsers installed via `npx playwright install --with-deps`
 *
 * @requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { test, expect } from '../../src';

test.describe('Browser — Petstore Swagger UI', () => {
    // These tests require CI infrastructure (browser install + network access).
    // Skip when not running in CI.
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-BRW-001] page loads with Swagger title and visible endpoint groups', { tag: ['@TC-BRW-001'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to Petstore Swagger UI', async () => {
            await page.goto('https://petstore.swagger.io');
        });

        await test.step('Step 2: Verify page title contains Swagger', async () => {
            await expect(page).toHaveTitle(/Swagger/);
        });

        await test.step('Step 3: Verify at least one API endpoint group is visible', async () => {
            const endpointGroups = page.locator('.opblock-tag-section h3');
            await expect(endpointGroups.first()).toBeVisible();
            expect(await endpointGroups.count()).toBeGreaterThan(0);
        });
    });

    test('[TC-BRW-002] expand endpoint group, try it out, and execute request', { tag: ['@TC-BRW-002'] }, async ({ page }) => {
        await test.step('Step 1: Navigate to Petstore Swagger UI', async () => {
            await page.goto('https://petstore.swagger.io');
            await expect(page.locator('.opblock-tag-section h3').first()).toBeVisible();
        });

        await test.step('Step 2: Expand an API endpoint group', async () => {
            await page.locator('.opblock-tag-section h3').first().click();
        });

        await test.step('Step 3: Click on an operation block to expand it', async () => {
            const operationBlock = page.locator('.opblock').first();
            await expect(operationBlock).toBeVisible();
            await operationBlock.click();
        });

        await test.step('Step 4: Click Try it out button', async () => {
            const tryItOutButton = page.locator('button.try-out__btn');
            await expect(tryItOutButton).toBeVisible();
            await tryItOutButton.click();
        });

        await test.step('Step 5: Click Execute button', async () => {
            const executeButton = page.locator('button.execute');
            await expect(executeButton).toBeVisible();
            await executeButton.click();
        });

        await test.step('Step 6: Verify server response with HTTP status code is displayed', async () => {
            const responseSection = page.locator('.responses-table .response-col_status');
            await expect(responseSection.first()).toBeVisible({ timeout: 10_000 });
        });
    });
});
