/**
 * OTP Step Class
 *
 * Reusable step sequences for OTP (TOTP/HOTP) client operations.
 * Wraps common generation and verification patterns for test reuse.
 */

import { test, expect } from '../index';

export interface OtpClient {
    generateSecret(): string;
    generateTotp(secret: string): Promise<string>;
    verifyTotp(token: string, secret: string): Promise<boolean>;
    generateHotp(counter: number, secret: string): Promise<string>;
    verifyHotp(token: string, counter: number, secret: string): Promise<boolean>;
    generateKeyUri(account: string, issuer: string, secret: string): string;
}

export class OtpSteps {
    constructor(private otpClient: OtpClient) {}

    /**
     * Generates a new base32 secret.
     */
    async generateSecret(description: string = 'Generate a new OTP secret'): Promise<string> {
        let secret: string = '';

        await test.step(`Step: ${description}`, async () => {
            secret = this.otpClient.generateSecret();
            expect(secret).toMatch(/^[A-Z2-7]+$/);
            expect(secret.length).toBeGreaterThanOrEqual(16);
        });

        return secret;
    }

    /**
     * Generates a TOTP token from a secret.
     */
    async generateTotp(description: string, secret: string): Promise<string> {
        let token: string = '';

        await test.step(`Step: ${description}`, async () => {
            token = await this.otpClient.generateTotp(secret);
            expect(token).toMatch(/^\d{6}$/);
        });

        return token;
    }

    /**
     * Verifies a TOTP token against a secret.
     */
    async verifyTotp(description: string, token: string, secret: string, expectedValid: boolean = true): Promise<boolean> {
        let isValid = false;

        await test.step(`Step: ${description}`, async () => {
            isValid = await this.otpClient.verifyTotp(token, secret);
            expect(isValid).toBe(expectedValid);
        });

        return isValid;
    }

    /**
     * Generates an HOTP token for a given counter.
     */
    async generateHotp(description: string, counter: number, secret: string): Promise<string> {
        let token: string = '';

        await test.step(`Step: ${description}`, async () => {
            token = await this.otpClient.generateHotp(counter, secret);
            expect(token).toMatch(/^\d{6}$/);
        });

        return token;
    }

    /**
     * Verifies an HOTP token against a counter and secret.
     */
    async verifyHotp(description: string, token: string, counter: number, secret: string, expectedValid: boolean = true): Promise<boolean> {
        let isValid = false;

        await test.step(`Step: ${description}`, async () => {
            isValid = await this.otpClient.verifyHotp(token, counter, secret);
            expect(isValid).toBe(expectedValid);
        });

        return isValid;
    }

    /**
     * Generates an otpauth URI for QR provisioning.
     */
    async generateKeyUri(description: string, account: string, issuer: string, secret: string): Promise<string> {
        let uri: string = '';

        await test.step(`Step: ${description}`, async () => {
            uri = this.otpClient.generateKeyUri(account, issuer, secret);
            expect(uri).toContain('otpauth://totp/');
            expect(uri).toContain('secret=');
            expect(uri).toContain(`issuer=${issuer}`);
        });

        return uri;
    }
}
