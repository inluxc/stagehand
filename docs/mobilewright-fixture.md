# Mobilewright Fixture

The `mobilewrightDevice` and `mobilewrightScreen` fixtures provide mobile testing capabilities for iOS and Android applications. They use [Mobilewright](https://github.com/nickmccurdy/mobilewright) under the hood to manage device sessions, app installation, and screen interactions.

---

## What It Does

- Boots a simulator/emulator if not already running
- Installs the application under test
- Provides device-level control (deep links, URL navigation)
- Provides screen interaction methods (tap, fill, swipe, locators)
- Uninstalls the app and releases the session on teardown

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_MOBILE_PLATFORM` | Yes | Target platform: `ios` or `android` |
| `PW_MOBILE_BUNDLE_ID` | Yes | Application bundle identifier |
| `PW_MOBILE_DEVICE_NAME` | Yes | Target device or simulator name |
| `PW_MOBILE_APP_PATH` | Yes | Path to the application binary (.app/.ipa/.apk) |
| `PW_MOBILE_TIMEOUT` | No | Initialization timeout in ms (default: `60000`) |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "mobilewright": {
        "platform": "ios",
        "bundleId": "com.example.myapp",
        "deviceName": "iPhone 15",
        "appPath": "./build/MyApp.app",
        "timeout": 60000
      }
    }
  }
}
```

### Configuration via `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  projects: [
    {
      name: 'mobile-ios',
      testMatch: '**/mobile/**/*.spec.ts',
      use: {
        mobilewright: {
          platform: 'ios',
          bundleId: 'com.example.myapp',
          deviceName: 'iPhone 15',
          appPath: './build/MyApp.app',
        },
      },
    },
    {
      name: 'mobile-android',
      testMatch: '**/mobile/**/*.spec.ts',
      use: {
        mobilewright: {
          platform: 'android',
          bundleId: 'com.example.myapp',
          deviceName: 'Pixel 7',
          appPath: './build/app-debug.apk',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `platform` | `'ios' \| 'android'` | — | Target mobile platform |
| `bundleId` | `string` | — | Application bundle identifier |
| `deviceName` | `string` | — | Target device or simulator name (regex-matched) |
| `appPath` | `string` | — | Path to the application binary |
| `timeout` | `number` | `60000` | Initialization timeout in ms |

---

## Usage

### Device Control

```typescript
import { test, expect } from '@inluxc/stagehand';

test('navigate via deep link', async ({ mobilewrightDevice }) => {
  await mobilewrightDevice.openUrl('myapp://profile/settings');
});
```

### Screen Interactions

```typescript
test('login flow', async ({ mobilewrightDevice, mobilewrightScreen }) => {
  await mobilewrightDevice.openUrl('myapp://login');

  // Fill form fields
  await mobilewrightScreen.fill(
    mobilewrightScreen.getByLabel('Email'),
    'user@example.com'
  );
  await mobilewrightScreen.fill(
    mobilewrightScreen.getByLabel('Password'),
    'securepass123'
  );

  // Tap a button
  await mobilewrightScreen.tap(mobilewrightScreen.getByText('Sign In'));
});
```

### Locator Methods

| Method | Description |
|--------|-------------|
| `getByText(text)` | Find element by visible text |
| `getByLabel(label)` | Find element by accessibility label |
| `getByTestId(testId)` | Find element by test ID |
| `getByRole(role)` | Find element by accessibility role |
| `getByType(type)` | Find element by native type |

### Action Methods

| Method | Description |
|--------|-------------|
| `tap(locator)` | Tap on an element |
| `doubleTap(locator)` | Double-tap on an element |
| `longPress(locator)` | Long-press on an element |
| `fill(locator, value)` | Type text into an input field |
| `swipe(direction)` | Swipe in a direction: `'up'`, `'down'`, `'left'`, `'right'` |
| `pressButton(button)` | Press a hardware/system button |

### Gestures and Navigation

```typescript
test('swipe through onboarding', async ({ mobilewrightDevice, mobilewrightScreen }) => {
  await mobilewrightDevice.openUrl('myapp://onboarding');

  await mobilewrightScreen.swipe('left'); // Next page
  await mobilewrightScreen.swipe('left'); // Next page
  await mobilewrightScreen.tap(mobilewrightScreen.getByText('Get Started'));
});
```

---

## Lifecycle

1. **Setup** — Boots device (if not running), installs the app, creates a session
2. **Use** — Provides `mobilewrightDevice` and `mobilewrightScreen` to the test
3. **Teardown** — Uninstalls the app, releases the session (always attempts release even if uninstall fails)

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` (operation: `boot`) | Device boot failure |
| `FixtureInitError` (operation: `install`) | App installation failure |
| `FixtureInitError` (operation: `init`) | Session not initialized (screen accessed before device) |

---

## Programmatic Configuration

You can also create the fixture with an explicit config object using `createMobilewrightFixture`:

```typescript
import { test as base } from '@playwright/test';
import { createMobilewrightFixture } from '@inluxc/stagehand';

const test = base.extend({
  ...createMobilewrightFixture({
    platform: 'ios',
    bundleId: 'com.example.app',
    deviceName: 'iPhone 15',
    appPath: './build/app.ipa',
  }),
});
```
