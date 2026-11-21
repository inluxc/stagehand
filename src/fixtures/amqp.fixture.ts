/**
 * RabbitMQ / AMQP 0-9-1 fixture.
 *
 * `amqpClient` publishes messages and checks what an application published,
 * without taking messages away from it:
 *
 * - `publish()` / `sendToQueue()` wait for the broker's confirm, and fail when
 *   no queue is bound for the routing key (a message that would be dropped).
 * - `listen(exchange, bindingKey)` binds a temporary, exclusive queue to the
 *   exchange. The app's own queues keep getting their copies; the test reads
 *   its copy from the listener.
 * - `consume(queue)` takes messages from a named queue: for a queue the test
 *   owns, or one whose messages the test means to remove.
 * - Queues, exchanges and bindings declared through the client are deleted
 *   again when the test ends.
 *
 * Uses amqplib, an optional peer dependency loaded on first use.
 */

import type { Channel, ChannelModel, ConfirmChannel, ConsumeMessage, Message, Options } from 'amqplib';
import { loadOptional } from './optional-package.js';
import type { ContainerManager } from '../containers/container-manager.js';
import type { AmqpFixtureConfig } from '../config/schema.js';
import { FixtureInitError, FixtureOperationError } from '../errors.js';
import type { CleanupRegistry, KeepOption } from '../test-data/registry.js';

/** A message body: a string or Buffer is sent as is, anything else as JSON. */
export type AmqpBody = string | Buffer | Record<string, unknown> | unknown[] | number | boolean | null;

/** Message properties for `publish()` and `sendToQueue()`. */
export interface AmqpPublishOptions {
    headers?: Record<string, unknown>;
    /** Default: `application/json` for an object body, `text/plain` for a string, none for a Buffer. */
    contentType?: string;
    contentEncoding?: string;
    correlationId?: string;
    messageId?: string;
    replyTo?: string;
    type?: string;
    appId?: string;
    userId?: string;
    priority?: number;
    /** Milliseconds until the message expires in a queue. */
    expiration?: string | number;
    /** Seconds since the epoch. */
    timestamp?: number;
    /** Survive a broker restart (delivery mode 2). Default: false. */
    persistent?: boolean;
    /**
     * Fail when no queue is bound for the routing key (default: true). The
     * broker would drop such a message silently, which in a test is almost
     * always a wrong exchange or routing key. Set false to allow it.
     */
    mandatory?: boolean;
}

/** A received message. */
export interface AmqpMessage {
    /** The body decoded as UTF-8. */
    body: string;
    /** The raw body. */
    content: Buffer;
    /** The body parsed as JSON; throws when it isn't JSON. */
    json<T = unknown>(): T;
    exchange: string;
    routingKey: string;
    redelivered: boolean;
    headers: Record<string, unknown>;
    /** Every AMQP property (contentType, correlationId, messageId, type, timestamp, ...). */
    properties: Message['properties'];
}

export interface AmqpWaitOptions {
    /** Milliseconds to wait (default: the config's `timeout`, else 10000). */
    timeout?: number;
}

export interface AmqpConsumeOptions extends AmqpWaitOptions {
    /** Stop after this many messages (default: 1). */
    count?: number;
}

export interface AmqpListenOptions {
    /** Binding arguments, e.g. `{ 'x-match': 'all', type: 'order' }` for a headers exchange. */
    arguments?: Record<string, unknown>;
}

/**
 * A temporary queue bound to an exchange. It receives a copy of every
 * matching message published after `listen()` resolved, and is deleted when
 * the test ends (or on `close()`).
 */
export interface AmqpListener {
    readonly queue: string;
    readonly exchange: string;
    readonly bindingKey: string;
    /** Every message received so far, oldest first. */
    readonly received: readonly AmqpMessage[];
    /** Waits until `count` messages (default 1) have arrived, or the timeout; returns what arrived. */
    messages(options?: AmqpConsumeOptions): Promise<AmqpMessage[]>;
    /**
     * The first message (received so far, or still to come) that matches
     * `predicate`. Throws on timeout, listing what arrived instead.
     */
    waitForMessage(predicate?: (message: AmqpMessage) => boolean, options?: AmqpWaitOptions): Promise<AmqpMessage>;
    close(): Promise<void>;
}

export interface AmqpQueueInfo {
    queue: string;
    messageCount: number;
    consumerCount: number;
}

export type AmqpAssertQueueOptions = Options.AssertQueue & KeepOption;
export type AmqpAssertExchangeOptions = Options.AssertExchange & KeepOption;

export interface AmqpClient {
    /** Publishes to an exchange (`''` is the default exchange) and waits for the broker's confirm. */
    publish(exchange: string, routingKey: string, message: AmqpBody, options?: AmqpPublishOptions): Promise<void>;
    /** Publishes straight to a queue through the default exchange. */
    sendToQueue(queue: string, message: AmqpBody, options?: AmqpPublishOptions): Promise<void>;
    /** Binds a temporary queue to `exchange`; `bindingKey` defaults to `#` (everything on a topic exchange). */
    listen(exchange: string, bindingKey?: string, options?: AmqpListenOptions): Promise<AmqpListener>;
    /** Takes up to `count` messages (default 1) from a queue, acknowledging them. Returns what arrived before the timeout. */
    consume(queue: string, options?: AmqpConsumeOptions): Promise<AmqpMessage[]>;
    /** Removes every ready message from a queue; returns how many. */
    purge(queue: string): Promise<number>;
    /** Message and consumer counts of a queue, or null when it doesn't exist. */
    checkQueue(queue: string): Promise<AmqpQueueInfo | null>;
    /** True when the exchange exists. */
    exchangeExists(exchange: string): Promise<boolean>;
    /**
     * Declares a queue; returns its name (the broker picks one for `''`).
     * Deleted when the test ends, unless `{ keep: true }` or it already existed.
     */
    assertQueue(queue: string, options?: AmqpAssertQueueOptions): Promise<string>;
    /** Declares an exchange. Deleted when the test ends, unless `{ keep: true }` or it already existed. */
    assertExchange(exchange: string, type: 'direct' | 'topic' | 'fanout' | 'headers' | string, options?: AmqpAssertExchangeOptions): Promise<void>;
    /** Binds a queue to an exchange. Unbound when the test ends, unless `{ keep: true }`. */
    bindQueue(queue: string, exchange: string, pattern: string, options?: KeepOption & { arguments?: Record<string, unknown> }): Promise<void>;
    /** Closes the connection (the fixture also does this after the test). */
    close(): Promise<void>;
}

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_CONNECTION_TIMEOUT = 10_000;

/** The broker URL for a config: `url` as is, else built from host, port, credentials and vhost. */
export function amqpUrl(config: AmqpFixtureConfig): string {
    if (config.url) return config.url;
    if (!config.host) {
        throw new FixtureInitError('amqp', 'connect', {
            reason: 'AMQP configuration is missing a broker: set PW_AMQP_URL (amqp://user:pass@host:5672/vhost) or PW_AMQP_HOST, PW_AMQP_CONTAINER=true, or amqp in environments.json or the project use block.',
        });
    }
    const scheme = config.tls ? 'amqps' : 'amqp';
    const port = config.port ?? (config.tls ? 5671 : 5672);
    const auth = config.username !== undefined
        ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password ?? '')}@`
        : '';
    // The default vhost is "/", which is %2F in a URL; no path means "/" too.
    const vhost = config.vhost !== undefined && config.vhost !== '/' ? `/${encodeURIComponent(config.vhost)}` : '';
    return `${scheme}://${auth}${config.host}:${port}${vhost}`;
}

/** The URL with its password replaced, for error messages. */
export function redactAmqpUrl(url: string): string {
    return url.replace(/^(amqps?:\/\/[^:/@]*):[^@/]*@/i, '$1:***@');
}

/** Encodes a body and fills in the content type it implies. */
export function encodeBody(message: AmqpBody, contentType?: string): { content: Buffer; contentType?: string } {
    if (Buffer.isBuffer(message)) return { content: message, contentType };
    if (typeof message === 'string') return { content: Buffer.from(message, 'utf8'), contentType: contentType ?? 'text/plain' };
    if (message === undefined) throw new TypeError('message body is undefined');
    return { content: Buffer.from(JSON.stringify(message), 'utf8'), contentType: contentType ?? 'application/json' };
}

/** Turns an amqplib message into an AmqpMessage. */
export function toAmqpMessage(msg: Pick<ConsumeMessage, 'content' | 'fields' | 'properties'>): AmqpMessage {
    const body = msg.content.toString('utf8');
    return {
        body,
        content: msg.content,
        json<T = unknown>(): T {
            try {
                return JSON.parse(body) as T;
            } catch (error) {
                throw new FixtureOperationError('amqp', 'json', {
                    routingKey: msg.fields.routingKey,
                    reason: `the message body isn't JSON (${(error as Error).message}): ${body.length > 200 ? `${body.slice(0, 200)}…` : body}`,
                });
            }
        },
        exchange: msg.fields.exchange,
        routingKey: msg.fields.routingKey,
        redelivered: msg.fields.redelivered,
        headers: (msg.properties.headers ?? {}) as Record<string, unknown>,
        properties: msg.properties,
    };
}

function publishOptions(options: AmqpPublishOptions | undefined, contentType: string | undefined): Options.Publish {
    const { mandatory: _mandatory, expiration, ...rest } = options ?? {};
    const out: Options.Publish = { ...rest, contentType, mandatory: options?.mandatory ?? true };
    if (expiration !== undefined) out.expiration = String(expiration);
    return out;
}

const reasonOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Adds what to do to broker errors whose message doesn't say it. */
export function explainBrokerError(reason: string): string {
    if (/transient_nonexcl_queues/.test(reason)) {
        return `${reason.split('\n')[0]} RabbitMQ 4 doesn't allow non-durable queues unless they're exclusive: leave out durable: false, or pass exclusive: true. (The broker closed the connection; the next call reconnects.)`;
    }
    if (/PRECONDITION_FAILED - inequivalent arg/.test(reason)) {
        return `${reason} The queue or exchange already exists with other settings: declare it with the same options, or delete it first.`;
    }
    if (/ACCESS_REFUSED/.test(reason)) {
        return `${reason} Check the user's permissions on the vhost.`;
    }
    return reason;
}

/** A short description of what arrived, for timeout errors. */
function describeArrived(messages: readonly AmqpMessage[]): string {
    if (messages.length === 0) return 'no messages arrived';
    const shown = messages.slice(-5).map((m) => `${m.routingKey}: ${m.body.length > 120 ? `${m.body.slice(0, 120)}…` : m.body}`);
    return `${messages.length} message(s) arrived, none matching${messages.length > 5 ? ' (last 5)' : ''}: ${shown.join(' | ')}`;
}

/** The messages a consumer has received, and the calls waiting for more. */
class Inbox {
    readonly items: AmqpMessage[] = [];
    private waiters = new Set<() => void>();

    push(message: AmqpMessage): void {
        this.items.push(message);
        for (const wake of [...this.waiters]) wake();
    }

    /** Resolves once `done()` is true or the timeout passes; returns whether `done()` became true. */
    wait(done: () => boolean, timeout: number): Promise<boolean> {
        if (done()) return Promise.resolve(true);
        return new Promise((resolve) => {
            const wake = () => {
                if (!done()) return;
                cleanup();
                resolve(true);
            };
            const timer = setTimeout(() => {
                cleanup();
                resolve(done());
            }, timeout);
            const cleanup = () => {
                clearTimeout(timer);
                this.waiters.delete(wake);
            };
            this.waiters.add(wake);
        });
    }
}

/**
 * Connects and builds the client. `registry` records the undo for declared
 * queues, exchanges and bindings; without one nothing is cleaned up.
 */
export async function createAmqpClient(config: AmqpFixtureConfig, registry?: CleanupRegistry): Promise<AmqpClient> {
    const url = amqpUrl(config);
    const timeoutDefault = config.timeout ?? DEFAULT_TIMEOUT;
    const amqp = await loadOptional<typeof import('amqplib')>('amqplib', 'amqpClient');

    const open = async (): Promise<ChannelModel> => {
        let model: ChannelModel;
        try {
            model = await amqp.connect(url, {
                timeout: config.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT,
                ...(config.heartbeat !== undefined ? { heartbeat: config.heartbeat } : {}),
                clientProperties: { connection_name: 'propmaster amqpClient' },
            });
        } catch (error) {
            throw new FixtureInitError('amqp', 'connect', { url: redactAmqpUrl(url), reason: reasonOf(error) }, error instanceof Error ? error : undefined);
        }
        // An unhandled 'error' event would crash the worker; the operation that hit it rejects too.
        model.on('error', (error: Error) => {
            connectionError = error.message;
        });
        model.on('close', () => {
            dropped = true;
            confirm = undefined;
            ops = undefined;
        });
        return model;
    };
    /** close() was called: nothing reconnects after that. */
    let closed = false;
    /** The broker closed the connection (e.g. a 541 for a queue RabbitMQ refuses); the next call reconnects. */
    let dropped = false;
    // Why the broker closed the connection: the pending operations only see "Channel ended".
    let connectionError: string | undefined;
    let confirm: Promise<ConfirmChannel> | undefined;
    let ops: Promise<Channel> | undefined;
    let connection = await open();
    let reconnecting: Promise<ChannelModel> | undefined;
    /** The live connection, opened again if the broker closed it, so later calls and the cleanup still work. */
    const conn = async (): Promise<ChannelModel> => {
        if (closed) throw new Error('the AMQP client is closed');
        if (!dropped) return connection;
        reconnecting ??= open().then((model) => {
            connection = model;
            dropped = false;
            connectionError = undefined;
            return model;
        }).finally(() => (reconnecting = undefined));
        return reconnecting;
    };

    const track = (options: KeepOption | undefined) => registry !== undefined && registry.autoCleanup && !options?.keep;

    // A channel closes on any channel-level error (a 404 from a passive
    // declare, a 406 from conflicting arguments), so each kind of work gets
    // its own channel and a closed one is opened again on next use.
    const reopen = <C extends Channel>(make: () => Promise<C>, reset: () => void): Promise<C> => {
        const pending = make().then((ch) => {
            ch.on('error', () => {});
            ch.on('close', reset);
            return ch;
        });
        pending.catch(reset);
        return pending;
    };
    const confirmChannel = () => (confirm ??= reopen(async () => (await conn()).createConfirmChannel(), () => (confirm = undefined)));
    const opsChannel = () => (ops ??= reopen(async () => (await conn()).createChannel(), () => (ops = undefined)));
    /** A throwaway channel for one operation that may close it (passive checks). */
    async function withScratchChannel<T>(fn: (ch: Channel) => Promise<T>): Promise<T> {
        const ch = await (await conn()).createChannel();
        ch.on('error', () => {});
        let channelClosed = false;
        ch.on('close', () => (channelClosed = true));
        try {
            return await fn(ch);
        } finally {
            if (!channelClosed) await ch.close().catch(() => {});
        }
    }

    const fail = (operation: FixtureOperationError['operation'], details: Record<string, unknown>, error: unknown): never => {
        if (error instanceof FixtureOperationError) throw error;
        throw new FixtureOperationError('amqp', operation, { ...details, reason: explainBrokerError(connectionError ?? reasonOf(error)) }, error instanceof Error ? error : undefined);
    };

    // Publishes go one at a time, so a basic.return (sent before the confirm)
    // belongs to the publish that's waiting for its confirm.
    let publishing: Promise<unknown> = Promise.resolve();
    function send(operation: 'publish' | 'sendToQueue', exchange: string, routingKey: string, message: AmqpBody, options?: AmqpPublishOptions): Promise<void> {
        const run = async () => {
            const target = { exchange: exchange === '' ? '(default)' : exchange, routingKey };
            let content: Buffer;
            let contentType: string | undefined;
            try {
                ({ content, contentType } = encodeBody(message, options?.contentType));
            } catch (error) {
                return fail(operation, target, error);
            }
            const ch = await confirmChannel().catch((error) => fail(operation, target, error));
            let returned: Message | undefined;
            const onReturn = (msg: Message) => (returned = msg);
            ch.on('return', onReturn);
            try {
                await new Promise<void>((resolve, reject) => {
                    ch.publish(exchange, routingKey, content, publishOptions(options, contentType), (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
                });
            } catch (error) {
                return fail(operation, target, error);
            } finally {
                ch.off('return', onReturn);
            }
            if (returned) {
                const why = returned.fields && 'replyText' in returned.fields ? String((returned.fields as { replyText?: unknown }).replyText) : 'NO_ROUTE';
                fail(operation, target, new Error(
                    `the broker returned the message (${why}): no queue is bound to ${exchange === '' ? 'the default exchange' : `exchange "${exchange}"`} for routing key "${routingKey}". Check the names, or pass { mandatory: false } to allow it.`,
                ));
            }
        };
        const result = publishing.then(run, run);
        publishing = result.catch(() => {});
        return result;
    }

    const listeners = new Set<AmqpListener>();

    async function listen(exchange: string, bindingKey = '#', options?: AmqpListenOptions): Promise<AmqpListener> {
        const details = { exchange, bindingKey };
        let ch: Channel;
        try {
            ch = await (await conn()).createChannel();
        } catch (error) {
            return fail('listen', details, error);
        }
        ch.on('error', () => {});
        let channelClosed = false;
        ch.on('close', () => (channelClosed = true));
        const inbox = new Inbox();
        let queue: string;
        try {
            ({ queue } = await ch.assertQueue('', { exclusive: true, autoDelete: true, durable: false }));
            await ch.bindQueue(queue, exchange, bindingKey, options?.arguments);
            await ch.consume(queue, (msg) => {
                if (msg) inbox.push(toAmqpMessage(msg));
            }, { noAck: true });
        } catch (error) {
            if (!channelClosed) await ch.close().catch(() => {});
            const reason = /NOT_FOUND/.test(reasonOf(error)) ? `exchange "${exchange}" doesn't exist (${reasonOf(error)})` : reasonOf(error);
            return fail('listen', details, new Error(reason));
        }

        const listener: AmqpListener = {
            queue,
            exchange,
            bindingKey,
            get received() {
                return inbox.items;
            },
            async messages(opts?: AmqpConsumeOptions) {
                const count = opts?.count ?? 1;
                await inbox.wait(() => inbox.items.length >= count, opts?.timeout ?? timeoutDefault);
                return inbox.items.slice(0, Math.max(count, 0));
            },
            async waitForMessage(predicate = () => true, opts?: AmqpWaitOptions) {
                const timeout = opts?.timeout ?? timeoutDefault;
                let found: AmqpMessage | undefined;
                const done = () => (found = inbox.items.find((m) => predicate(m))) !== undefined;
                if (await inbox.wait(done, timeout) && found) return found;
                return fail('waitForMessage', { exchange, bindingKey, timeout }, new Error(`no matching message within ${timeout} ms: ${describeArrived(inbox.items)}`));
            },
            async close() {
                listeners.delete(listener);
                if (channelClosed || closed || dropped) return;
                await ch.deleteQueue(queue).catch(() => {});
                await ch.close().catch(() => {});
            },
        };
        listeners.add(listener);
        return listener;
    }

    async function consume(queue: string, options?: AmqpConsumeOptions): Promise<AmqpMessage[]> {
        const count = options?.count ?? 1;
        const timeout = options?.timeout ?? timeoutDefault;
        let ch: Channel;
        try {
            ch = await (await conn()).createChannel();
        } catch (error) {
            return fail('consume', { queue }, error);
        }
        ch.on('error', () => {});
        let channelClosed = false;
        ch.on('close', () => (channelClosed = true));
        const inbox = new Inbox();
        try {
            // Only take what's asked for: unacked extras go back to the queue on close.
            await ch.prefetch(Math.max(count, 1));
            await ch.consume(queue, (msg) => {
                if (!msg || inbox.items.length >= count) return;
                ch.ack(msg);
                inbox.push(toAmqpMessage(msg));
            });
        } catch (error) {
            if (!channelClosed) await ch.close().catch(() => {});
            const reason = /NOT_FOUND/.test(reasonOf(error)) ? `queue "${queue}" doesn't exist (${reasonOf(error)})` : reasonOf(error);
            return fail('consume', { queue }, new Error(reason));
        }
        await inbox.wait(() => inbox.items.length >= count, timeout);
        if (!channelClosed) await ch.close().catch(() => {});
        return inbox.items.slice(0, count);
    }

    const client: AmqpClient = {
        publish: (exchange, routingKey, message, options) => send('publish', exchange, routingKey, message, options),
        sendToQueue: (queue, message, options) => send('sendToQueue', '', queue, message, options),
        listen,
        consume,

        async purge(queue) {
            try {
                return (await (await opsChannel()).purgeQueue(queue)).messageCount;
            } catch (error) {
                return fail('purge', { queue }, error);
            }
        },

        async checkQueue(queue) {
            try {
                return await withScratchChannel(async (ch) => {
                    const info = await ch.checkQueue(queue);
                    return { queue: info.queue, messageCount: info.messageCount, consumerCount: info.consumerCount };
                });
            } catch (error) {
                if (/NOT_FOUND|404/.test(reasonOf(error))) return null;
                return fail('checkQueue', { queue }, error);
            }
        },

        async exchangeExists(exchange) {
            try {
                await withScratchChannel((ch) => ch.checkExchange(exchange));
                return true;
            } catch (error) {
                if (/NOT_FOUND|404/.test(reasonOf(error))) return false;
                return fail('exchangeExists', { exchange }, error);
            }
        },

        async assertQueue(queue, options) {
            const { keep, ...declare } = options ?? {};
            const existed = queue !== '' && (await client.checkQueue(queue)) !== null;
            try {
                const { queue: name } = await (await opsChannel()).assertQueue(queue, declare);
                if (!existed && track({ keep })) {
                    registry!.add(`amqp queue ${name}`, async () => {
                        await (await opsChannel()).deleteQueue(name);
                    });
                }
                return name;
            } catch (error) {
                return fail('assertQueue', { queue }, error);
            }
        },

        async assertExchange(exchange, type, options) {
            const { keep, ...declare } = options ?? {};
            const existed = await client.exchangeExists(exchange);
            try {
                await (await opsChannel()).assertExchange(exchange, type, declare);
            } catch (error) {
                return fail('assertExchange', { exchange, type }, error);
            }
            if (!existed && track({ keep })) {
                registry!.add(`amqp exchange ${exchange}`, async () => {
                    await (await opsChannel()).deleteExchange(exchange);
                });
            }
        },

        async bindQueue(queue, exchange, pattern, options) {
            try {
                await (await opsChannel()).bindQueue(queue, exchange, pattern, options?.arguments);
            } catch (error) {
                return fail('bindQueue', { queue, exchange, pattern }, error);
            }
            if (track(options)) {
                registry!.add(`amqp binding ${exchange} → ${queue} (${pattern})`, async () => {
                    await (await opsChannel()).unbindQueue(queue, exchange, pattern, options?.arguments);
                });
            }
        },

        async close() {
            if (closed) return;
            for (const listener of [...listeners]) await listener.close();
            closed = true;
            if (!dropped) await connection.close().catch(() => {});
        },
    };
    return client;
}

/** The AMQP config: the project option, else ConfigLoader (environments.json, .env, PW_AMQP_*). */
async function resolveConfig(amqp: AmqpFixtureConfig | undefined): Promise<AmqpFixtureConfig> {
    if (amqp) return amqp;
    const { ConfigLoader } = await import('../config/loader.js');
    let loaded: AmqpFixtureConfig | undefined;
    try {
        loaded = new ConfigLoader().load().amqp;
    } catch {
        // no environments.json: only env vars, which ConfigLoader needs the file for
    }
    if (!loaded) {
        throw new FixtureInitError('amqp', 'connect', {
            reason: 'AMQP configuration is missing. Set PW_AMQP_URL (amqp://user:pass@localhost:5672), PW_AMQP_HOST, PW_AMQP_CONTAINER=true, or amqp in environments.json or the project use block.',
        });
    }
    return loaded;
}

/**
 * Fixture definition for test.extend(). The connection is per test; the undo
 * actions for declared queues, exchanges and bindings run before it closes.
 */
export const amqpFixture = {
    amqpClient: async (
        { amqp, stagehandContainers, dataCleanup }: { amqp: AmqpFixtureConfig | undefined; stagehandContainers: ContainerManager; dataCleanup: CleanupRegistry },
        use: (client: AmqpClient) => Promise<void>,
    ) => {
        const config = await stagehandContainers.amqp(await resolveConfig(amqp));
        const client = await createAmqpClient(config, dataCleanup);
        let cleanupError: unknown;
        try {
            await use(client);
            await dataCleanup.flush();
        } catch (error) {
            cleanupError = error;
        }
        await client.close();
        if (cleanupError) throw cleanupError;
    },
};
