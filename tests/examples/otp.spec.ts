/**
 * Example tests for the OTP (One-Time Password) fixture.
 *
 * Demonstrates TOTP and HOTP generation/verification for 2FA/MFA testing flows.
 */

import { test, expect } from '../../src';

test.describe('OTP Fixture — TOTP', () => {
    test('[TC-OTP-001] generate and verify a TOTP token', { tag: ['@TC-OTP-001'] }, async ({ otpClient }) => {
        let secret: string;
        let token: string;

        await test.step('Step 1: Generate a new secret', async () => {
            secret = otpClient.generateSecret();
        });

        await test.step('Step 2: Generate a TOTP token from the secret', async () => {
            token = await otpClient.generateTotp(secret!);
            expect(token).toMatch(/^\d{6}$/);
        });

        await test.step('Step 3: Verify the generated token is valid', async () => {
            const isValid = await otpClient.verifyTotp(token!, secret!);
            expect(isValid).toBe(true);
        });
    });

    test('[TC-OTP-002] reject an invalid TOTP token', { tag: ['@TC-OTP-002'] }, async ({ otpClient }) => {
        await test.step('Step 1: Generate a secret and verify 000000 is rejected', async () => {
            const secret = otpClient.generateSecret();
            const isValid = await otpClient.verifyTotp('000000', secret);
            expect(isValid).toBe(false);
        });
    });

    test('[TC-OTP-003] generate a secret in base32 format', { tag: ['@TC-OTP-003'] }, async ({ otpClient }) => {
        await test.step('Step 1: Generate a secret and verify base32 format', async () => {
            const secret = otpClient.generateSecret();

            expect(secret).toMatch(/^[A-Z2-7]+$/);
            expect(secret.length).toBeGreaterThanOrEqual(16);
        });
    });
});

test.describe('OTP Fixture — HOTP', () => {
    test('[TC-OTP-004] generate and verify an HOTP token', { tag: ['@TC-OTP-004'] }, async ({ otpClient }) => {
        let secret: string;
        let token: string;
        const counter = 42;

        await test.step('Step 1: Generate a new secret', async () => {
            secret = otpClient.generateSecret();
        });

        await test.step('Step 2: Generate an HOTP token for counter 42', async () => {
            token = await otpClient.generateHotp(counter, secret!);
            expect(token).toMatch(/^\d{6}$/);
        });

        await test.step('Step 3: Verify the token against the correct counter', async () => {
            const isValid = await otpClient.verifyHotp(token!, counter, secret!);
            expect(isValid).toBe(true);
        });
    });

    test('[TC-OTP-005] HOTP token is counter-specific', { tag: ['@TC-OTP-005'] }, async ({ otpClient }) => {
        let secret: string;
        let token: string;

        await test.step('Step 1: Generate secret and HOTP token for counter 1', async () => {
            secret = otpClient.generateSecret();
            token = await otpClient.generateHotp(1, secret);
        });

        await test.step('Step 2: Verify token fails against different counter (2)', async () => {
            const isValid = await otpClient.verifyHotp(token!, 2, secret!);
            expect(isValid).toBe(false);
        });
    });
});

test.describe('OTP Fixture — Key URI', () => {
    test('[TC-OTP-006] generate an otpauth URI for QR provisioning', { tag: ['@TC-OTP-006'] }, async ({ otpClient }) => {
        await test.step('Step 1: Generate secret and create otpauth URI', async () => {
            const secret = otpClient.generateSecret();
            const uri = otpClient.generateKeyUri('user@example.com', 'MyApp', secret);

            expect(uri).toContain('otpauth://totp/');
            expect(uri).toContain('secret=');
            expect(uri).toContain('issuer=MyApp');
        });
    });
});
