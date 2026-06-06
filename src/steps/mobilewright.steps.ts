/**
 * Mobilewright Step Class
 *
 * Reusable step sequences for mobile app testing operations.
 * Wraps common screen interactions and device control patterns.
 */

import { test, expect } from '../index';

export interface MobilewrightScreen {
    getByText(text: string): any;
    getByLabel(label: string): any;
    getByTestId(testId: string): any;
    tap(element: any): Promise<void>;
    fill(element: any, text: string): Promise<void>;
    swipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
    longPress(element: any): Promise<void>;
    doubleTap(element: any): Promise<void>;
    pressButton(button: string): Promise<void>;
}

export interface MobilewrightDevice {
    openUrl(url: string): Promise<void>;
}

export class MobilewrightSteps {
    constructor(
        private screen: MobilewrightScreen,
        private device: MobilewrightDevice,
    ) {}

    /**
     * Opens a deep link URL on the device.
     */
    async openUrl(description: string, url: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.device.openUrl(url);
        });
    }

    /**
     * Taps an element found by text.
     */
    async tapByText(description: string, text: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByText(text);
            await this.screen.tap(element);
        });
    }

    /**
     * Taps an element found by test ID.
     */
    async tapByTestId(description: string, testId: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByTestId(testId);
            await this.screen.tap(element);
        });
    }

    /**
     * Fills a labeled input field with text.
     */
    async fillByLabel(description: string, label: string, value: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByLabel(label);
            await this.screen.fill(element, value);
        });
    }

    /**
     * Performs a swipe gesture in the given direction.
     */
    async swipe(description: string, direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.screen.swipe(direction);
        });
    }

    /**
     * Long-presses an element found by text.
     */
    async longPressByText(description: string, text: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByText(text);
            await this.screen.longPress(element);
        });
    }

    /**
     * Double-taps an element found by test ID.
     */
    async doubleTapByTestId(description: string, testId: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByTestId(testId);
            await this.screen.doubleTap(element);
        });
    }

    /**
     * Presses a hardware button (home, back, etc.).
     */
    async pressButton(description: string, button: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            await this.screen.pressButton(button);
        });
    }

    /**
     * Verifies an element with the given text is present.
     */
    async verifyTextPresent(description: string, text: string): Promise<void> {
        await test.step(`Step: ${description}`, async () => {
            const element = this.screen.getByText(text);
            expect(element).toBeDefined();
        });
    }
}
