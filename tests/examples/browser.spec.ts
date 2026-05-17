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

    test('page loads with Swagger title and visible endpoint groups', async ({ page }) => {
        await page.goto('https://petstore.swagger.io');

        // Assert page title contains "Swagger"
        await expect(page).toHaveTitle(/Swagger/);

        // Assert at least one API endpoint group heading is visible
        const endpointGroups = page.locator('.opblock-tag-section h3');
        await expect(endpointGroups.first()).toBeVisible();
        expect(await endpointGroups.count()).toBeGreaterThan(0);
    });

    test('expand endpoint group, try it out, and execute request', async ({ page }) => {
        await page.goto('https://petstore.swagger.io');

        // Wait for the page to fully load
        await expect(page.locator('.opblock-tag-section h3').first()).toBeVisible();

        // Expand an API endpoint group by clicking on it
        await page.locator('.opblock-tag-section h3').first().click();

        // Wait for an operation block to appear and click on it to expand
        const operationBlock = page.locator('.opblock').first();
        await expect(operationBlock).toBeVisible();
        await operationBlock.click();

        // Click "Try it out" button
        const tryItOutButton = page.locator('button.try-out__btn');
        await expect(tryItOutButton).toBeVisible();
        await tryItOutButton.click();

        // Click "Execute" button
        const executeButton = page.locator('button.execute');
        await expect(executeButton).toBeVisible();
        await executeButton.click();

        // Assert server response section with HTTP status code becomes visible within 10 seconds
        const responseSection = page.locator('.responses-table .response-col_status');
        await expect(responseSection.first()).toBeVisible({ timeout: 10_000 });
    });
});
