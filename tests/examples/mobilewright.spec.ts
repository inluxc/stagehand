/**
 * Mobilewright Fixture — Example Test
 *
 * Demonstrates how to use the Mobilewright fixture for mobile app testing.
 * The fixture provides `mobilewrightScreen` for UI interactions and
 * `mobilewrightDevice` for device-level control. Session lifecycle
 * (boot, install, teardown) is managed automatically.
 *
 * Prerequisites:
 *   - Mobilewright configured via PW_MOBILE_* environment variables or environments.json
 *   - Target device/simulator available (iOS Simulator or Android Emulator)
 *   - Application binary (.ipa or .apk) built and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';

test.describe('Mobilewright Fixture Examples', () => {
    // These tests require a mobile device/simulator and app binary.
    // Skip them when infrastructure is not available.
    test.skip();

    test('[TC-MOB-001] interact with screen elements', { tag: ['@TC-MOB-001'] }, async ({ mobilewrightScreen }) => {
        await test.step('Step 1: Find and tap the Log In button', async () => {
            const loginButton = mobilewrightScreen.getByText('Log In');
            await mobilewrightScreen.tap(loginButton);
        });

        await test.step('Step 2: Fill the email input field', async () => {
            const emailInput = mobilewrightScreen.getByLabel('Email Address');
            await mobilewrightScreen.fill(emailInput, 'user@example.com');
        });

        await test.step('Step 3: Tap the submit button', async () => {
            const submitButton = mobilewrightScreen.getByTestId('submit-btn');
            await mobilewrightScreen.tap(submitButton);
        });
    });

    test('[TC-MOB-002] use gesture actions', { tag: ['@TC-MOB-002'] }, async ({ mobilewrightScreen }) => {
        await test.step('Step 1: Swipe down to refresh', async () => {
            await mobilewrightScreen.swipe('down');
        });

        await test.step('Step 2: Long press on a list item to open context menu', async () => {
            const listItem = mobilewrightScreen.getByText('My Document');
            await mobilewrightScreen.longPress(listItem);
        });

        await test.step('Step 3: Double tap to zoom on an image', async () => {
            const imageView = mobilewrightScreen.getByTestId('photo-viewer');
            await mobilewrightScreen.doubleTap(imageView);
        });

        await test.step('Step 4: Press hardware home button', async () => {
            await mobilewrightScreen.pressButton('home');
        });
    });

    test('[TC-MOB-003] use device-level controls', { tag: ['@TC-MOB-003'] }, async ({ mobilewrightDevice, mobilewrightScreen }) => {
        await test.step('Step 1: Open deep link to profile settings', async () => {
            await mobilewrightDevice.openUrl('myapp://settings/profile');
        });

        await test.step('Step 2: Verify navigation to profile screen', async () => {
            const profileHeader = mobilewrightScreen.getByText('Profile Settings');
            expect(profileHeader).toBeDefined();
        });
    });
});
