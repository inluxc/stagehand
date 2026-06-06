/**
 * Example tests for the OTP (One-Time Password) fixture.
 *
 * Demonstrates TOTP and HOTP generation/verification for 2FA/MFA testing flows.
 * Uses the OtpSteps class for reusable step sequences.
 */

import { test, expect } from '../../src';
import { OtpSteps } from '../../src/steps';

test.describe('OTP Fixture — TOTP', () => {
    test('[TC-OTP-001] generate and verify a TOTP token', { tag: ['@TC-OTP-001'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);

        const secret = await otp.generateSecret('Generate a new secret');
        const token = await otp.generateTotp('Generate a TOTP token from the secret', secret);
        await otp.verifyTotp('Verify the generated token is valid', token, secret, true);
    });

    test('[TC-OTP-002] reject an invalid TOTP token', { tag: ['@TC-OTP-002'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);

        const secret = await otp.generateSecret('Generate a secret');
        await otp.verifyTotp('Verify 000000 is rejected', '000000', secret, false);
    });

    test('[TC-OTP-003] generate a secret in base32 format', { tag: ['@TC-OTP-003'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);

        await otp.generateSecret('Generate a secret and verify base32 format');
    });
});

test.describe('OTP Fixture — HOTP', () => {
    test('[TC-OTP-004] generate and verify an HOTP token', { tag: ['@TC-OTP-004'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);
        const counter = 42;

        const secret = await otp.generateSecret('Generate a new secret');
        const token = await otp.generateHotp('Generate an HOTP token for counter 42', counter, secret);
        await otp.verifyHotp('Verify the token against the correct counter', token, counter, secret, true);
    });

    test('[TC-OTP-005] HOTP token is counter-specific', { tag: ['@TC-OTP-005'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);

        const secret = await otp.generateSecret('Generate a new secret');
        const token = await otp.generateHotp('Generate HOTP token for counter 1', 1, secret);
        await otp.verifyHotp('Verify token fails against different counter (2)', token, 2, secret, false);
    });
});

test.describe('OTP Fixture — Key URI', () => {
    test('[TC-OTP-006] generate an otpauth URI for QR provisioning', { tag: ['@TC-OTP-006'] }, async ({ otpClient }) => {
        const otp = new OtpSteps(otpClient);

        const secret = await otp.generateSecret('Generate a new secret');
        await otp.generateKeyUri('Generate otpauth URI for QR provisioning', 'user@example.com', 'MyApp', secret);
    });
});
