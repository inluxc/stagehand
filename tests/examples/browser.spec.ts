/**
 * Browser Fixture — Example Test
 *
 * Demonstrates browser-based UI testing by navigating to the Petstore Swagger UI,
 * verifying page load, expanding an endpoint group, triggering a request,
 * and asserting a response is displayed.
 * Uses the BrowserSteps class for reusable step sequences.
 *
 * Prerequisites:
 *   - Playwright browsers installed (chromium, firefox, webkit)
 *   - In CI: browsers installed via `npx playwright install --with-deps`
 *
 * @requirements 16.1, 16.2, 16.3, 16.4, 16.5
 */

import { test, expect } from '../../src';
import { BrowserSteps } from '../../src/steps';

test.describe('Browser — Petstore Swagger UI', () => {
    test.skip(!process.env.CI, 'Skipped: requires CI infrastructure');

    test('[TC-BRW-001] page loads with Swagger title and visible endpoint groups', { tag: ['@TC-BRW-001'] }, async ({ page }) => {
        const browser = new BrowserSteps(page);

        await browser.navigate('Navigate to Petstore Swagger UI', 'https://petstore.swagger.io');
        await browser.verifyTitle('Verify page title contains Swagger', /Swagger/);
        await browser.verifyVisible(
            'Verify at least one API endpoint group is visible',
            page.locator('.opblock-tag-section h3').first(),
        );
        await browser.verifyCountGreaterThan(
            'Verify multiple endpoint groups exist',
            page.locator('.opblock-tag-section h3'),
            0,
        );
    });

    test('[TC-BRW-002] expand endpoint group, try it out, and execute request', { tag: ['@TC-BRW-002'] }, async ({ page }) => {
        const browser = new BrowserSteps(page);

        await browser.navigate(
            'Navigate to Petstore Swagger UI',
            'https://petstore.swagger.io',
            '.opblock-tag-section h3',
        );

        await browser.clickSelector('Expand an API endpoint group', '.opblock-tag-section h3');

        await test.step('Step 1: Click on an operation block to expand it', async () => {
            const operationBlock = page.locator('.opblock').first();
            await expect(operationBlock).toBeVisible();
            await operationBlock.click();
        });

        await browser.click('Click Try it out button', page.locator('button.try-out__btn'));
        await browser.click('Click Execute button', page.locator('button.execute'));
        await browser.verifyVisible(
            'Verify server response with HTTP status code is displayed',
            page.locator('.responses-table .response-col_status').first(),
            { timeout: 10_000 },
        );
    });
});
