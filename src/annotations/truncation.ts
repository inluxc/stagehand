/**
 * Truncation and credential redaction utilities for the annotation system.
 *
 * These utilities ensure annotation values stay within size limits and
 * that sensitive data (passwords, tokens, API keys) is never recorded
 * in test metadata.
 */

const TRUNCATION_INDICATOR = '[truncated]';

/**
 * Truncates a string value to the specified character limit.
 *
 * If the value length exceeds the limit, returns the first `limit` characters
 * followed by the `[truncated]` indicator. Otherwise returns the original string.
 *
 * @param value - The string to potentially truncate
 * @param limit - Maximum number of characters before truncation
 * @returns The original string or a truncated version with indicator
 */
export function truncate(value: string, limit: number): string {
    if (value.length <= limit) {
        return value;
    }
    return value.slice(0, limit) + TRUNCATION_INDICATOR;
}

/**
 * Redacts credential patterns from a string value.
 *
 * Scans for common credential patterns and replaces matched sensitive
 * values with `[REDACTED]`:
 * - `password=...` / `pwd=...` in connection strings
 * - `Bearer ...` / `Basic ...` authorization headers
 * - `token=...` / `api_key=...` query parameters
 * - AWS access key IDs (AKIA...)
 * - JWT tokens (eyJ...)
 *
 * @param value - The string to scan for credentials
 * @returns The string with all detected credentials replaced by [REDACTED]
 */
export function redactCredentials(value: string): string {
    let result = value;

    // Connection string password fields: password=... or pwd=...
    // Matches until semicolon, ampersand, whitespace, or end of string
    result = result.replace(
        /\b(password|pwd)\s*=\s*([^;&\s]+)/gi,
        '$1=[REDACTED]'
    );

    // Bearer and Basic authorization tokens
    result = result.replace(
        /\b(Bearer|Basic)\s+[^\s,;]+/gi,
        '$1 [REDACTED]'
    );

    // Query parameter tokens: token=... or api_key=...
    result = result.replace(
        /\b(token|api_key)\s*=\s*([^;&\s]+)/gi,
        '$1=[REDACTED]'
    );

    // AWS access key IDs (starts with AKIA, 20 chars)
    result = result.replace(
        /\bAKIA[0-9A-Z]{16}\b/g,
        '[REDACTED]'
    );

    // JWT tokens (three base64url segments separated by dots)
    result = result.replace(
        /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        '[REDACTED]'
    );

    return result;
}
