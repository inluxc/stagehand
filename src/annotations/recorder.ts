/**
 * Annotation recorder module for attaching fixture operation metadata
 * to Playwright test results via testInfo.annotations.
 *
 * Each recorder function serializes a typed metadata object as JSON
 * into the annotation description field. All values are redacted for
 * credentials and truncated to their respective limits before recording.
 *
 * @requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */

import { truncate, redactCredentials } from './truncation';

/** Minimal testInfo interface to avoid importing Playwright's TestInfo directly */
type TestInfo = {
    annotations: Array<{ type: string; description?: string }>;
};

const ANNOTATION_TYPE = 'fixture-operation';

const SQL_LIMIT = 2048;
const REDIS_RESULT_LIMIT = 1024;
const HTTP_BODY_LIMIT = 4096;

/**
 * Records a database fixture operation annotation.
 *
 * @param testInfo - Playwright test info object
 * @param operation - The database operation type (query or execute)
 * @param sql - The SQL statement executed
 * @param rowCount - Number of rows returned or affected
 */
export function recordDatabase(
    testInfo: TestInfo,
    operation: 'query' | 'execute',
    sql: string,
    rowCount: number
): void {
    const metadata = {
        fixture: 'database' as const,
        operation,
        sql: truncate(redactCredentials(sql), SQL_LIMIT),
        rowCount,
    };

    testInfo.annotations.push({
        type: ANNOTATION_TYPE,
        description: JSON.stringify(metadata),
    });
}

/**
 * Records a Kafka fixture operation annotation.
 *
 * @param testInfo - Playwright test info object
 * @param operation - The Kafka operation type (produce or consume)
 * @param topic - The Kafka topic name
 * @param messageCount - Number of messages produced or consumed
 */
export function recordKafka(
    testInfo: TestInfo,
    operation: 'produce' | 'consume',
    topic: string,
    messageCount: number
): void {
    const metadata = {
        fixture: 'kafka' as const,
        operation,
        topic: redactCredentials(topic),
        messageCount,
    };

    testInfo.annotations.push({
        type: ANNOTATION_TYPE,
        description: JSON.stringify(metadata),
    });
}

/**
 * Records a Redis fixture operation annotation.
 *
 * @param testInfo - Playwright test info object
 * @param operation - The Redis operation type
 * @param key - The Redis key or channel name
 * @param result - The string representation of the result value
 */
export function recordRedis(
    testInfo: TestInfo,
    operation: 'get' | 'set' | 'del' | 'publish' | 'subscribe',
    key: string,
    result: string
): void {
    const metadata = {
        fixture: 'redis' as const,
        operation,
        key: redactCredentials(key),
        result: truncate(redactCredentials(result), REDIS_RESULT_LIMIT),
    };

    testInfo.annotations.push({
        type: ANNOTATION_TYPE,
        description: JSON.stringify(metadata),
    });
}

/**
 * Records an OpenAPI fixture operation annotation.
 *
 * @param testInfo - Playwright test info object
 * @param method - The HTTP method (GET, POST, PUT, DELETE, etc.)
 * @param path - The request path
 * @param reqBody - The request body as a string
 * @param status - The HTTP response status code
 * @param resBody - The response body as a string
 */
export function recordOpenApi(
    testInfo: TestInfo,
    method: string,
    path: string,
    reqBody: string,
    status: number,
    resBody: string
): void {
    const metadata = {
        fixture: 'openapi' as const,
        method: redactCredentials(method),
        path: redactCredentials(path),
        requestBody: truncate(redactCredentials(reqBody), HTTP_BODY_LIMIT),
        responseStatus: status,
        responseBody: truncate(redactCredentials(resBody), HTTP_BODY_LIMIT),
    };

    testInfo.annotations.push({
        type: ANNOTATION_TYPE,
        description: JSON.stringify(metadata),
    });
}
