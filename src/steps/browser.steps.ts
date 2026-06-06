/**
 * Browser Step Class
 *
 * Reusable step sequences for browser-based UI testing.
 * Wraps common navigation and interaction patterns for Playwright page operations.
 */

import { test, expect } from '../index';
import type { Page, Locator } from '@playwright/test';

export class BrowserSteps {
    constructor(private page: Page) {}

    /**
     * Navigates to a URL and optionally waits for a selector to be visible.
     */
    async navigate(description: string, url: string, waitForSelector?: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.page.goto(url);
            if (waitForSelector) {
                await expect(this.page.locator(waitForSelector).first()).toBeVisible();
            }
        });
    }

    /**
     * Verifies the page title matches the expected pattern.
     */
    async verifyTitle(description: string, titlePattern: RegExp): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect(this.page).toHaveTitle(titlePattern);
        });
    }

    /**
     * Verifies the page URL matches the expected pattern or string.
     */
    async verifyUrl(description: string, url: string | RegExp): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect(this.page).toHaveURL(url);
        });
    }

    /**
     * Clicks a locator element.
     */
    async click(description: string, locator: Locator): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect(locator).toBeVisible();
            await locator.click();
        });
    }

    /**
     * Clicks the first element matching a CSS selector.
     */
    async clickSelector(description: string, selector: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.page.locator(selector).first();
            await expect(element).toBeVisible();
            await element.click();
        });
    }

    /**
     * Verifies a locator is visible.
     */
    async verifyVisible(description: string, locator: Locator, options?: { timeout?: number }): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect(locator).toBeVisible(options);
        });
    }

    /**
     * Verifies the count of elements matching a locator is greater than expected.
     */
    async verifyCountGreaterThan(description: string, locator: Locator, minCount: number): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            expect(await locator.count()).toBeGreaterThan(minCount);
        });
    }

    /**
     * Fills an input identified by label.
     */
    async fillByLabel(description: string, label: string, value: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.page.getByLabel(label).fill(value);
        });
    }

    /**
     * Clicks a button identified by its accessible name.
     */
    async clickButton(description: string, name: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const button = this.page.getByRole('button', { name });
            await expect(button).toBeVisible();
            await button.click();
        });
    }

    /**
     * Verifies a heading is visible.
     */
    async verifyHeading(description: string, name: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await expect(this.page.getByRole('heading', { name })).toBeVisible();
        });
    }
}
