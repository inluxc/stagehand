/**
 * Mobilewright Mobile Testing Fixture
 *
 * Integrates the Mobilewright mobile testing framework, providing screen and device
 * objects for end-to-end testing of iOS and Android applications.
 *
 * Lifecycle:
 *   Setup: Read config → Boot device if not running → Install app → Create session → Provide screen & device
 *   Teardown: Uninstall app → Release session (always attempt release even if uninstall fails)
 *
 * @requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8
 */

import type { Screen } from '@mobilewright/core';
import type { Device } from '@mobilewright/core';
import type { MobilewrightFixtureConfig } from '../config/schema';
import { FixtureInitError } from '../errors';

/** Default initialization timeout in milliseconds. */
const DEFAULT_INIT_TIMEOUT = 60_000;

/**
 * The screen object exposed to tests, providing locator and action methods
 * for interacting with the mobile UI.
 */
export interface MobilewrightScreen {
    getByText(text: string): ReturnType<Screen['getByText']>;
    getByLabel(label: string): ReturnType<Screen['getByLabel']>;
    getByTestId(testId: string): ReturnType<Screen['getByTestId']>;
    getByRole(role: string): ReturnType<Screen['getByRole']>;
    getByType(type: string): ReturnType<Screen['getByType']>;
    tap(locator: { tap: (opts?: { timeout?: number }) => Promise<void> }): Promise<void>;
    doubleTap(locator: { doubleTap: (opts?: { timeout?: number }) => Promise<void> }): Promise<void>;
    longPress(locator: { longPress: (opts?: { timeout?: number; duration?: number }) => Promise<void> }): Promise<void>;
    fill(locator: { fill: (text: string, opts?: { timeout?: number }) => Promise<void> }, value: string): Promise<void>;
    swipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void>;
    pressButton(button: string): Promise<void>;
}

/**
 * The device object exposed to tests, providing device-level control methods.
 */
export interface MobilewrightDevice {
    openUrl(url: string): Promise<void>;
}

/**
 * Creates a MobilewrightScreen wrapper around the raw mobilewright Screen instance.
 */
function createScreenWrapper(screen: Screen): MobilewrightScreen {
    return {
        getByText: (text: string) => screen.getByText(text),
        getByLabel: (label: string) => screen.getByLabel(label),
        getByTestId: (testId: string) => screen.getByTestId(testId),
        getByRole: (role: string) => screen.getByRole(role),
        getByType: (type: string) => screen.getByType(type),
        tap: async (locator) => locator.tap(),
        doubleTap: async (locator) => locator.doubleTap(),
        longPress: async (locator) => locator.longPress(),
        fill: async (locator, value: string) => locator.fill(value),
        swipe: async (direction) => screen.swipe(direction),
        pressButton: async (button: string) => screen.pressButton(button as Parameters<Screen['pressButton']>[0]),
    };
}

/**
 * Creates a MobilewrightDevice wrapper around the raw mobilewright Device instance.
 */
function createDeviceWrapper(device: Device): MobilewrightDevice {
    return {
        openUrl: async (url: string) => device.openUrl(url),
    };
}

/**
 * Gets the platform launcher (ios or android) from the mobilewright package.
 */
async function getPlatformLauncher(platform: 'ios' | 'android') {
    const mobilewright = await import('mobilewright');
    return platform === 'ios' ? mobilewright.ios : mobilewright.android;
}

/**
 * Mobilewright fixture definition for use with Playwright's test.extend().
 *
 * Provides two fixtures:
 * - `mobilewrightScreen`: Screen object with locator and action methods
 * - `mobilewrightDevice`: Device object with device-level control (openUrl)
 *
 * The `mobilewrightDevice` fixture manages the full lifecycle (boot, install, session, teardown).
 * The `mobilewrightScreen` fixture depends on `mobilewrightDevice` and exposes the screen from
 * the active device session.
 */
export const mobilewrightFixture = {
    mobilewrightDevice: async (
        { mobilewright }: { mobilewright: MobilewrightFixtureConfig | undefined },
        use: (device: MobilewrightDevice) => Promise<void>,
    ) => {
        // Use config from project `use` block if provided, otherwise fall back to env vars
        const config = mobilewright ?? readMobilewrightConfig();
        const timeout = config.timeout ?? DEFAULT_INIT_TIMEOUT;

        let deviceInstance: Device | null = null;

        // Setup: Boot device → Install app → Create session
        try {
            const launcher = await getPlatformLauncher(config.platform);

            // Launch device (boots if not running) with app installation
            deviceInstance = await launcher.launch({
                deviceName: new RegExp(config.deviceName),
                bundleId: config.bundleId,
                installApps: config.appPath,
                timeout,
            });
        } catch (error) {
            const cause = error instanceof Error ? error : new Error(String(error));

            // Determine if it's a boot or install failure based on error context
            const operation = cause.message.toLowerCase().includes('install') ? 'install' as const : 'boot' as const;

            throw new FixtureInitError('mobilewright', operation, {
                platform: config.platform,
                deviceName: config.deviceName,
                appPath: config.appPath,
                timeout,
                reason: cause.message,
            }, cause);
        }

        // Store device instance for the screen fixture to access
        _activeDevice = deviceInstance;

        const deviceWrapper = createDeviceWrapper(deviceInstance);
        await use(deviceWrapper);

        // Teardown: Uninstall app → Release session (always attempt release even if uninstall fails)
        try {
            await deviceInstance.uninstallApp(config.bundleId);
        } catch {
            // Log warning but continue — uninstall failure should not prevent session release
        }

        try {
            await deviceInstance.close();
        } catch {
            // Best-effort session release
        } finally {
            _activeDevice = null;
        }
    },

    mobilewrightScreen: async (
        { mobilewrightDevice: _ }: { mobilewrightDevice: MobilewrightDevice },
        use: (screen: MobilewrightScreen) => Promise<void>,
    ) => {
        // Depends on mobilewrightDevice to ensure the session is established first
        void _;

        if (!_activeDevice) {
            throw new FixtureInitError('mobilewright', 'init', {
                reason: 'Device session not initialized — mobilewrightDevice fixture must run first',
            });
        }

        const screenWrapper = createScreenWrapper(_activeDevice.screen);
        await use(screenWrapper);
    },
};

/** Internal reference to the active device instance, shared between fixtures. */
let _activeDevice: Device | null = null;

/**
 * Reads Mobilewright configuration from environment variables, falling back to defaults.
 * Environment variables follow the PW_MOBILE_* naming convention.
 */
function readMobilewrightConfig(): MobilewrightFixtureConfig {
    const platform = (process.env.PW_MOBILE_PLATFORM as 'ios' | 'android') || 'ios';
    const bundleId = process.env.PW_MOBILE_BUNDLE_ID || '';
    const deviceName = process.env.PW_MOBILE_DEVICE_NAME || '';
    const appPath = process.env.PW_MOBILE_APP_PATH || '';
    const timeout = process.env.PW_MOBILE_TIMEOUT
        ? parseInt(process.env.PW_MOBILE_TIMEOUT, 10)
        : DEFAULT_INIT_TIMEOUT;

    return { platform, bundleId, deviceName, appPath, timeout };
}

/**
 * Creates the Mobilewright fixture with an explicit config object.
 * Use this when you want to provide config programmatically rather than via env vars.
 *
 * @example
 * ```typescript
 * import { test as base } from '@playwright/test';
 * import { createMobilewrightFixture } from '../src/fixtures/mobilewright.fixture';
 *
 * const test = base.extend({
 *   ...createMobilewrightFixture({
 *     platform: 'ios',
 *     bundleId: 'com.example.app',
 *     deviceName: 'iPhone 15',
 *     appPath: './build/app.ipa',
 *   }),
 * });
 * ```
 */
export function createMobilewrightFixture(config: MobilewrightFixtureConfig) {
    const timeout = config.timeout ?? DEFAULT_INIT_TIMEOUT;

    return {
        mobilewrightDevice: async (
            { }: Record<string, never>,
            use: (device: MobilewrightDevice) => Promise<void>,
        ) => {
            let deviceInstance: Device | null = null;

            // Setup: Boot device → Install app → Create session
            try {
                const launcher = await getPlatformLauncher(config.platform);

                deviceInstance = await launcher.launch({
                    deviceName: new RegExp(config.deviceName),
                    bundleId: config.bundleId,
                    installApps: config.appPath,
                    timeout,
                });
            } catch (error) {
                const cause = error instanceof Error ? error : new Error(String(error));
                const operation = cause.message.toLowerCase().includes('install') ? 'install' as const : 'boot' as const;

                throw new FixtureInitError('mobilewright', operation, {
                    platform: config.platform,
                    deviceName: config.deviceName,
                    appPath: config.appPath,
                    timeout,
                    reason: cause.message,
                }, cause);
            }

            _activeDevice = deviceInstance;
            const deviceWrapper = createDeviceWrapper(deviceInstance);
            await use(deviceWrapper);

            // Teardown: Uninstall app → Release session (always attempt release)
            try {
                await deviceInstance.uninstallApp(config.bundleId);
            } catch {
                // Uninstall failure should not prevent session release
            }

            try {
                await deviceInstance.close();
            } catch {
                // Best-effort session release
            } finally {
                _activeDevice = null;
            }
        },

        mobilewrightScreen: async (
            { mobilewrightDevice: _ }: { mobilewrightDevice: MobilewrightDevice },
            use: (screen: MobilewrightScreen) => Promise<void>,
        ) => {
            void _;

            if (!_activeDevice) {
                throw new FixtureInitError('mobilewright', 'init', {
                    platform: config.platform,
                    deviceName: config.deviceName,
                    appPath: config.appPath,
                    reason: 'Device session not initialized',
                });
            }

            const screenWrapper = createScreenWrapper(_activeDevice.screen);
            await use(screenWrapper);
        },
    };
}
