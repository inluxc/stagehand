/**
 * Unit tests for the AMQP fixture: URL building, body encoding and decoding,
 * broker error hints, PW_AMQP_* variables and the RabbitMQ container spec.
 * The broker behaviour itself is covered by tests/examples/amqp.spec.ts.
 */

import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    amqpUrl,
    createAmqpClient,
    encodeBody,
    explainBrokerError,
    redactAmqpUrl,
    toAmqpMessage,
} from '../../src/fixtures/amqp.fixture';
import { ConfigLoader } from '../../src/config/loader';
import { ContainerManager, DEFAULT_IMAGES, rabbitMqSpec } from '../../src/containers/container-manager';
import { FixtureInitError, FixtureOperationError } from '../../src/errors';
import type { FixtureTypes } from '../../src/fixtures';

type AssertHasKey<T, K extends keyof T> = K;
type _amqp = AssertHasKey<FixtureTypes, 'amqpClient'>;

const msg = (content: string | Buffer, properties: Record<string, unknown> = {}) => ({
    content: Buffer.isBuffer(content) ? content : Buffer.from(content),
    fields: { exchange: 'orders', routingKey: 'orders.created', redelivered: false, deliveryTag: 1, consumerTag: 'c' },
    properties: { headers: undefined, ...properties } as never,
});

test.describe('amqp — broker URL', () => {
    test('url wins over host and credentials', () => {
        expect(amqpUrl({ url: 'amqp://a:b@broker:5673/v', host: 'other' })).toBe('amqp://a:b@broker:5673/v');
    });

    test('builds the URL from host, port, credentials and vhost', () => {
        expect(amqpUrl({ host: 'localhost' })).toBe('amqp://localhost:5672');
        expect(amqpUrl({ host: 'mq', port: 5673, username: 'user', password: 'p@ss/word' })).toBe('amqp://user:p%40ss%2Fword@mq:5673');
        expect(amqpUrl({ host: 'mq', vhost: '/' })).toBe('amqp://mq:5672');
        expect(amqpUrl({ host: 'mq', vhost: 'staging' })).toBe('amqp://mq:5672/staging');
        expect(amqpUrl({ host: 'mq', vhost: 'a/b' })).toBe('amqp://mq:5672/a%2Fb');
    });

    test('tls switches to amqps and port 5671', () => {
        expect(amqpUrl({ host: 'mq', tls: true })).toBe('amqps://mq:5671');
        expect(amqpUrl({ host: 'mq', tls: true, port: 443 })).toBe('amqps://mq:443');
    });

    test('a config without url or host says what to set', () => {
        expect(() => amqpUrl({})).toThrow(FixtureInitError);
        expect(() => amqpUrl({})).toThrow(/PW_AMQP_URL/);
    });

    test('redacts the password in a URL', () => {
        expect(redactAmqpUrl('amqp://user:secret@mq:5672/v')).toBe('amqp://user:***@mq:5672/v');
        expect(redactAmqpUrl('amqps://mq:5671')).toBe('amqps://mq:5671');
    });

    test('a broker that is not there fails with FixtureInitError and no password', async () => {
        const error = await createAmqpClient({ url: 'amqp://user:secret@127.0.0.1:1', connectionTimeout: 2000 }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(FixtureInitError);
        expect((error as Error).message).toContain('amqp://user:***@127.0.0.1:1');
        expect((error as Error).message).not.toContain('secret');
    });
});

test.describe('amqp — message bodies', () => {
    test('strings are sent as text/plain, objects as JSON, Buffers as they are', () => {
        expect(encodeBody('hi')).toEqual({ content: Buffer.from('hi'), contentType: 'text/plain' });
        expect(encodeBody({ a: 1 })).toEqual({ content: Buffer.from('{"a":1}'), contentType: 'application/json' });
        expect(encodeBody([1, 2])).toEqual({ content: Buffer.from('[1,2]'), contentType: 'application/json' });
        expect(encodeBody(Buffer.from([1, 2]))).toEqual({ content: Buffer.from([1, 2]), contentType: undefined });
    });

    test('an explicit content type wins', () => {
        expect(encodeBody({ a: 1 }, 'application/vnd.order+json').contentType).toBe('application/vnd.order+json');
        expect(encodeBody('<a/>', 'application/xml').contentType).toBe('application/xml');
    });

    test('an undefined body is refused', () => {
        expect(() => encodeBody(undefined as never)).toThrow(/undefined/);
    });

    test('received messages expose the body, JSON, routing and headers', () => {
        const m = toAmqpMessage(msg('{"orderId":"o-1"}', { contentType: 'application/json', headers: { source: 'checkout' } }));
        expect(m.body).toBe('{"orderId":"o-1"}');
        expect(m.json<{ orderId: string }>().orderId).toBe('o-1');
        expect(m.exchange).toBe('orders');
        expect(m.routingKey).toBe('orders.created');
        expect(m.redelivered).toBe(false);
        expect(m.headers).toEqual({ source: 'checkout' });
        expect(m.properties.contentType).toBe('application/json');
    });

    test('headers default to an empty object', () => {
        expect(toAmqpMessage(msg('x')).headers).toEqual({});
    });

    test('json() on a non-JSON body names the routing key and shows the body', () => {
        const m = toAmqpMessage(msg('not json'));
        expect(() => m.json()).toThrow(FixtureOperationError);
        expect(() => m.json()).toThrow(/orders\.created.*isn't JSON.*not json/);
    });
});

test.describe('amqp — broker error hints', () => {
    test('a refused transient queue says how to declare it', () => {
        const reason = 'Connection closed: 541 (INTERNAL-ERROR) with message "INTERNAL_ERROR - Feature `transient_nonexcl_queues` is deprecated.\nBy default...';
        const hint = explainBrokerError(reason);
        expect(hint).toContain('leave out durable: false, or pass exclusive: true');
        expect(hint).not.toContain('\n');
    });

    test('conflicting declarations and permissions get a hint; anything else is unchanged', () => {
        expect(explainBrokerError("PRECONDITION_FAILED - inequivalent arg 'durable' for queue 'q'")).toContain('same options');
        expect(explainBrokerError('ACCESS_REFUSED - access to queue denied')).toContain('permissions');
        expect(explainBrokerError('something else')).toBe('something else');
    });
});

test.describe('amqp — configuration', () => {
    let dir: string;
    const saved = { ...process.env };

    test.beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'propmaster-amqp-'));
        fs.writeFileSync(path.join(dir, 'environments.json'), JSON.stringify({ environments: { local: { amqp: { host: 'from-file', vhost: 'v1' } } } }));
        for (const k of Object.keys(process.env)) if (k.startsWith('PW_')) delete process.env[k];
    });
    test.afterEach(() => {
        process.env = { ...saved };
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('PW_AMQP_* variables override environments.json', () => {
        Object.assign(process.env, {
            PW_AMQP_URL: 'amqp://u:p@mq:5672',
            PW_AMQP_HOST: 'mq',
            PW_AMQP_PORT: '5673',
            PW_AMQP_USERNAME: 'u',
            PW_AMQP_PASSWORD: 'p',
            PW_AMQP_TLS: 'true',
            PW_AMQP_HEARTBEAT: '0',
            PW_AMQP_TIMEOUT: '2500',
            PW_AMQP_CONTAINER: 'rabbitmq:4-management',
        });
        expect(new ConfigLoader(dir).load('local').amqp).toEqual({
            url: 'amqp://u:p@mq:5672',
            host: 'mq',
            port: 5673,
            username: 'u',
            password: 'p',
            vhost: 'v1',
            tls: true,
            heartbeat: 0,
            timeout: 2500,
            container: { image: 'rabbitmq:4-management' },
        });
    });

    test('environments.json alone is enough', () => {
        expect(new ConfigLoader(dir).load('local').amqp).toEqual({ host: 'from-file', vhost: 'v1' });
    });
});

test.describe('amqp — RabbitMQ container', () => {
    test('uses rabbitmq:4 and throwaway credentials by default', () => {
        const { spec, username, password, vhost } = rabbitMqSpec({}, {});
        expect(DEFAULT_IMAGES.rabbitmq).toBe('rabbitmq:4');
        expect(spec.image).toBe('rabbitmq:4');
        expect(spec.port).toBe(5672);
        expect(spec.fixture).toBe('amqpClient');
        expect(spec.env).toEqual({ RABBITMQ_DEFAULT_USER: 'testuser', RABBITMQ_DEFAULT_PASS: 'testpass', RABBITMQ_DEFAULT_VHOST: '/' });
        expect([username, password, vhost]).toEqual(['testuser', 'testpass', '/']);
        expect(spec.healthCheck).toContain('check_port_connectivity');
    });

    test('creates the configured user and vhost, and takes an image', () => {
        const { spec } = rabbitMqSpec({ username: 'app', password: 'pw', vhost: 'shop' }, { image: 'rabbitmq:4-management', startupTimeout: 90 });
        expect(spec.image).toBe('rabbitmq:4-management');
        expect(spec.startupTimeoutMs).toBe(90_000);
        expect(spec.env).toEqual({ RABBITMQ_DEFAULT_USER: 'app', RABBITMQ_DEFAULT_PASS: 'pw', RABBITMQ_DEFAULT_VHOST: 'shop' });
    });

    test('the manager returns the config unchanged when container is off', async () => {
        const m = new ContainerManager();
        const config = { url: 'amqp://mq', container: false };
        expect(await m.amqp(config)).toBe(config);
        await m.stopAll();
    });
});
