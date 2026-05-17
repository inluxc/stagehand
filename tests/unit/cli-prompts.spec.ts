import { test, expect } from '@playwright/test';
import { PromptManager } from '../../src/cli/prompts';

test.describe('PromptManager', () => {
    test.describe('isInteractive', () => {
        test('returns true when process.stdin.isTTY is true', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
                const manager = new PromptManager();
                expect(manager.isInteractive()).toBe(true);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });

        test('returns false when process.stdin.isTTY is undefined', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                expect(manager.isInteractive()).toBe(false);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });

        test('returns false when process.stdin.isTTY is false', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
                const manager = new PromptManager();
                expect(manager.isInteractive()).toBe(false);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });
    });

    test.describe('ensureInteractive', () => {
        test('throws error when stdin is not a TTY', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                expect(() => manager.ensureInteractive()).toThrow();
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });

        test('error message mentions --yes flag', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                expect(() => manager.ensureInteractive()).toThrow(/--yes/);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });

        test('does not throw when stdin is a TTY', () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
                const manager = new PromptManager();
                expect(() => manager.ensureInteractive()).not.toThrow();
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });
    });

    test.describe('selectFixtures calls ensureInteractive', () => {
        test('throws when not interactive', async () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                await expect(manager.selectFixtures(['openapi', 'database'])).rejects.toThrow(/--yes/);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });
    });

    test.describe('selectFixture calls ensureInteractive', () => {
        test('throws when not interactive', async () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                await expect(manager.selectFixture(['openapi', 'database'])).rejects.toThrow(/--yes/);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });
    });

    test.describe('selectSecretsProvider calls ensureInteractive', () => {
        test('throws when not interactive', async () => {
            const originalIsTTY = process.stdin.isTTY;
            try {
                Object.defineProperty(process.stdin, 'isTTY', { value: undefined, configurable: true });
                const manager = new PromptManager();
                await expect(manager.selectSecretsProvider(['aws', 'env-file'], 'env-file')).rejects.toThrow(/--yes/);
            } finally {
                Object.defineProperty(process.stdin, 'isTTY', { value: originalIsTTY, configurable: true });
            }
        });
    });
});
