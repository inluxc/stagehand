/**
 * Annotations module barrel export.
 *
 * Re-exports all public annotation utilities for truncation,
 * credential redaction, and fixture operation recording.
 *
 * @requirements 12.1
 */

export { truncate, redactCredentials } from './truncation';
export { recordDatabase, recordKafka, recordRedis, recordOpenApi } from './recorder';
