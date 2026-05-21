# OTP Fixture

The `otpClient` fixture provides TOTP (Time-based One-Time Password) and HOTP (HMAC-based One-Time Password) generation and verification. It uses [otplib](https://github.com/yeojz/otplib) v13 under the hood and is designed for testing 2FA/MFA flows where one-time passwords need to be generated during test execution.

---

## What It Does

- Generates and verifies TOTP tokens (time-based, like Google Authenticator)
- Generates and verifies HOTP tokens (counter-based)
- Generates random base32-encoded secrets for test provisioning
- Creates `otpauth://` URIs for QR code provisioning
- Supports configurable digits, period, algorithm, and verification window

---

## Setup

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PW_OTP_SECRET` | No | Base32-encoded OTP secret (can also be passed per-call) |
| `PW_OTP_DIGITS` | No | Token length (default: `6`) |
| `PW_OTP_PERIOD` | No | TOTP time step in seconds (default: `30`) |
| `PW_OTP_ALGORITHM` | No | Hash algorithm: `sha1`, `sha256`, `sha512` (default: `sha1`) |
| `PW_OTP_ISSUER` | No | Issuer name for URI generation |

### Configuration via `environments.json`

```json
{
  "environments": {
    "dev": {
      "otp": {
        "secret": "JBSWY3DPEHPK3PXP",
        "digits": 6,
        "period": 30,
        "window": 1,
        "algorithm": "sha1",
        "issuer": "MyApp"
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
      name: 'e2e',
      testMatch: '**/e2e/**/*.spec.ts',
      use: {
        otpConfig: {
          digits: 6,
          period: 30,
          algorithm: 'sha1',
          issuer: 'MyApp',
        },
      },
    },
  ],
});
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | — | Base32-encoded secret key |
| `digits` | `number` | `6` | Number of digits in the generated token |
| `period` | `number` | `30` | Time step period in seconds (TOTP only) |
| `window` | `number` | `1` | Verification window — number of periods to check before/after current |
| `algorithm` | `'sha1' \| 'sha256' \| 'sha512'` | `'sha1'` | Hash algorithm |
| `issuer` | `string` | — | Issuer name for `otpauth://` URI generation |

---

## Usage

### Generate and Verify TOTP

```typescript
import { test, expect } from '@inluxc/stagehand';

test('generate and verify TOTP', async ({ otpClient }) => {
  const secret = otpClient.generateSecret();
  const token = await otpClient.generateTotp(secret);

  expect(token).toHaveLength(6);
  expect(await otpClient.verifyTotp(token, secret)).toBe(true);
});
```

### Generate and Verify HOTP

```typescript
test('generate and verify HOTP', async ({ otpClient }) => {
  const secret = otpClient.generateSecret();
  const counter = 0;

  const token = await otpClient.generateHotp(counter, secret);
  expect(await otpClient.verifyHotp(token, counter, secret)).toBe(true);
});
```

### Generate Key URI for QR Provisioning

```typescript
test('generate key URI for QR code', async ({ otpClient }) => {
  const secret = otpClient.generateSecret();
  const uri = otpClient.generateKeyUri('user@example.com', 'MyApp', secret);

  expect(uri).toContain('otpauth://totp/');
  expect(uri).toContain('MyApp');
  expect(uri).toContain('secret=');
});
```

### Using a Pre-configured Secret

If a secret is configured (via env var or config), you can omit it from method calls:

```typescript
// With PW_OTP_SECRET=JBSWY3DPEHPK3PXP set
test('use configured secret', async ({ otpClient }) => {
  const token = await otpClient.generateTotp(); // Uses configured secret
  const isValid = await otpClient.verifyTotp(token); // Uses configured secret
  expect(isValid).toBe(true);
});
```

### API Reference

| Method | Signature | Description |
|--------|-----------|-------------|
| `generateTotp` | `(secret?: string) => Promise<string>` | Generate a TOTP token using current time |
| `verifyTotp` | `(token: string, secret?: string) => Promise<boolean>` | Verify a TOTP token |
| `generateHotp` | `(counter: number, secret?: string) => Promise<string>` | Generate an HOTP token for a counter |
| `verifyHotp` | `(token: string, counter: number, secret?: string) => Promise<boolean>` | Verify an HOTP token |
| `generateSecret` | `() => string` | Generate a new random base32-encoded secret |
| `generateKeyUri` | `(accountName: string, issuer?: string, secret?: string) => string` | Generate an `otpauth://` URI |

---

## Typical 2FA Test Flow

```typescript
test('complete 2FA login flow', async ({ otpClient, page }) => {
  // 1. Get the secret from your app's 2FA setup (e.g., via API or DB)
  const secret = 'JBSWY3DPEHPK3PXP'; // Retrieved from your app

  // 2. Generate a valid TOTP token
  const token = await otpClient.generateTotp(secret);

  // 3. Enter it in the UI
  await page.goto('/login/2fa');
  await page.getByLabel('Verification Code').fill(token);
  await page.getByRole('button', { name: 'Verify' }).click();

  // 4. Assert successful login
  await expect(page).toHaveURL('/dashboard');
});
```

---

## Lifecycle

1. **Setup** — Creates OTP client with configured algorithm, digits, period, and window
2. **Use** — Provides `otpClient` to the test
3. **Teardown** — No cleanup needed (stateless)

---

## Error Handling

| Error | When |
|-------|------|
| `FixtureInitError` | No secret provided and none configured (when calling methods without a secret argument) |
