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

    test('interact with screen elements', async ({ mobilewrightScreen }) => {
        // The mobilewrightScreen fixture provides locator methods:
        //   - getByText(text): find element by visible text
        //   - getByLabel(label): find element by accessibility label
        //   - getByTestId(testId): find element by test ID
        //   - getByRole(role): find element by accessibility role
        //   - getByType(type): find element by native type

        // Find a button by its text and tap it
        const loginButton = mobilewrightScreen.getByText('Log In');
        await mobilewrightScreen.tap(loginButton);

        // Find an input by its accessibility label and fill it
        const emailInput = mobilewrightScreen.getByLabel('Email Address');
        await mobilewrightScreen.fill(emailInput, 'user@example.com');

        // Find an element by test ID
        const submitButton = mobilewrightScreen.getByTestId('submit-btn');
        await mobilewrightScreen.tap(submitButton);
    });

    test('use gesture actions', async ({ mobilewrightScreen }) => {
        // Screen provides gesture methods for common mobile interactions

        // Swipe down to refresh
        await mobilewrightScreen.swipe('down');

        // Long press on an element to open a context menu
        const listItem = mobilewrightScreen.getByText('My Document');
        await mobilewrightScreen.longPress(listItem);

        // Double tap to zoom
        const imageView = mobilewrightScreen.getByTestId('photo-viewer');
        await mobilewrightScreen.doubleTap(imageView);

        // Press a hardware/system button
        await mobilewrightScreen.pressButton('home');
    });

    test('use device-level controls', async ({ mobilewrightDevice, mobilewrightScreen }) => {
        // The mobilewrightDevice fixture provides device-level methods:
        //   - openUrl(url): open a deep link or URL in the app

        // Open a deep link to navigate directly to a screen
        await mobilewrightDevice.openUrl('myapp://settings/profile');

        // Verify the navigation worked by checking screen content
        const profileHeader = mobilewrightScreen.getByText('Profile Settings');
        // In a real test, you'd assert the element is visible
        expect(profileHeader).toBeDefined();
    });
});
