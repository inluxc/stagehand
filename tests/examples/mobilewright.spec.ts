/**
 * Mobilewright Fixture — Example Test
 *
 * Demonstrates how to use the Mobilewright fixture for mobile app testing.
 * Uses the MobilewrightSteps class for reusable step sequences.
 * Session lifecycle (boot, install, teardown) is managed automatically.
 *
 * Prerequisites:
 *   - Mobilewright configured via PW_MOBILE_* environment variables or environments.json
 *   - Target device/simulator available (iOS Simulator or Android Emulator)
 *   - Application binary (.ipa or .apk) built and accessible
 *
 * @requirements 7.3, 1.6
 */

import { test, expect } from '../../src';
import { MobilewrightSteps } from '../../src/steps';

test.describe('Mobilewright Fixture Examples', () => {
    test.skip();

    test('[TC-MOB-001] interact with screen elements', { tag: ['@TC-MOB-001'] }, async ({ mobilewrightScreen, mobilewrightDevice }) => {
        const mobile = new MobilewrightSteps(mobilewrightScreen, mobilewrightDevice);

        await mobile.tapByText('Find and tap the Log In button', 'Log In');
        await mobile.fillByLabel('Fill the email input field', 'Email Address', 'user@example.com');
        await mobile.tapByTestId('Tap the submit button', 'submit-btn');
    });

    test('[TC-MOB-002] use gesture actions', { tag: ['@TC-MOB-002'] }, async ({ mobilewrightScreen, mobilewrightDevice }) => {
        const mobile = new MobilewrightSteps(mobilewrightScreen, mobilewrightDevice);

        await mobile.swipe('Swipe down to refresh', 'down');
        await mobile.longPressByText('Long press on a list item to open context menu', 'My Document');
        await mobile.doubleTapByTestId('Double tap to zoom on an image', 'photo-viewer');
        await mobile.pressButton('Press hardware home button', 'home');
    });

    test('[TC-MOB-003] use device-level controls', { tag: ['@TC-MOB-003'] }, async ({ mobilewrightDevice, mobilewrightScreen }) => {
        const mobile = new MobilewrightSteps(mobilewrightScreen, mobilewrightDevice);

        await mobile.openUrl('Open deep link to profile settings', 'myapp://settings/profile');
        await mobile.verifyTextPresent('Verify navigation to profile screen', 'Profile Settings');
    });
});
