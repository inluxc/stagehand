/**
 * Testcontainers integration: starts a backend in a throwaway Docker container
 * from the test run, so integration tests need no service started outside
 * Playwright — the same command works on a laptop and on any CI agent with Docker.
 *
 * Opt in per backend with `container: true` (or options) in the fixture config,
 * or `PW_<BACKEND>_CONTAINER=true`. One ContainerManager lives per Playwright
 * worker (the `stagehandContainers` worker fixture): each container starts the
 * first time a test in that worker needs it, is shared by the worker's later
 * tests, and stops when the worker exits. Images, credentials and health checks
 * match `compose.test.yaml` and Stagehand's CI.
 *
 * `testcontainers` is an optional peer dependency, loaded on first use.
 */

import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { basename, resolve } from 'node:path';
import type { StartedTestContainer } from 'testcontainers';
import type {
    ContainerOptions,
    ContainerSetting,
    DatabaseFixtureConfig,
    KafkaFixtureConfig,
    AmqpFixtureConfig,
    MongoDbFixtureConfig,
    Neo4jFixtureConfig,
    RedisFixtureConfig,
    InboxFixtureConfig,
    MockServerConfig,
} from '../config/schema.js';
import { FixtureInitError } from '../errors.js';
import { loadOptional } from '../fixtures/optional-package.js';

type Testcontainers = typeof import('testcontainers');

export type ContainerKind = 'postgresql' | 'mysql' | 'mssql' | 'redis' | 'mongodb' | 'neo4j' | 'kafka' | 'rabbitmq' | 'mailpit' | 'wiremock';

/** Default image per backend — the same ones as compose.test.yaml and CI. */
export const DEFAULT_IMAGES: Record<ContainerKind, string> = {
    postgresql: 'postgres:15',
    mysql: 'mysql:8.0',
    mssql: 'mcr.microsoft.com/mssql/server:2022-latest',
    redis: 'redis:7',
    mongodb: 'mongo:7',
    neo4j: 'neo4j:5',
    kafka: 'apache/kafka:latest',
    rabbitmq: 'rabbitmq:4',
    mailpit: 'axllent/mailpit:latest',
    wiremock: 'wiremock/wiremock:3.13.2',
};

/** Throwaway credentials used when the config doesn't set its own. */
export const DEFAULT_CREDENTIALS = {
    database: 'testdb',
    username: 'testuser',
    password: 'testpass',
    mssqlPassword: 'TestPass123!',
    neo4jPassword: 'testpassword',
} as const;

const SLOW: ReadonlySet<ContainerKind> = new Set(['mssql', 'neo4j']);
const SQLCMD = '/opt/mssql-tools18/bin/sqlcmd';

/** `true` → {}, options → options, false/undefined → null. */
export function containerOptions(setting: ContainerSetting | undefined): ContainerOptions | null {
    if (!setting) return null;
    return setting === true ? {} : setting;
}

/** Parses a `PW_*_CONTAINER` value: `true`/`1`/`yes` → true, `false`/`0`/`no`/empty → false, anything else → an image name. */
export function parseContainerEnv(value: string): ContainerSetting {
    const v = value.trim();
    if (/^(true|1|yes|on)$/i.test(v)) return true;
    if (!v || /^(false|0|no|off)$/i.test(v)) return false;
    return { image: v };
}

/** Everything needed to start one container. Pure data, so it can be unit tested and used as a cache key. */
export interface ContainerSpec {
    kind: ContainerKind;
    fixture: string;
    image: string;
    env: Record<string, string>;
    /** Container port the tests connect to. */
    port: number;
    /** Host port to bind it to; random when omitted. */
    hostPort?: number;
    /** More container ports to publish (random host ports), e.g. Mailpit's SMTP port. */
    extraPorts?: number[];
    /** Shell command that exits 0 once the service is ready. */
    healthCheck: string;
    command?: string[];
    /** Files copied into the container before it starts: [hostPath, containerPath]. */
    files?: [string, string][];
    startupTimeoutMs: number;
    reuse: boolean;
}

function baseSpec(kind: ContainerKind, fixture: string, options: ContainerOptions): Omit<ContainerSpec, 'env' | 'port' | 'healthCheck'> {
    return {
        kind,
        fixture,
        image: options.image ?? DEFAULT_IMAGES[kind],
        startupTimeoutMs: (options.startupTimeout ?? (SLOW.has(kind) ? 120 : 60)) * 1000,
        reuse: options.reuse ?? false,
    };
}

const quote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

/**
 * SQL Server's password policy: at least 8 characters from at least three of
 * upper case, lower case, digits and symbols. A weaker `sa` password makes the
 * server exit at start-up, which otherwise only shows up as a failed health check.
 */
export function meetsMssqlPasswordPolicy(password: string): boolean {
    const classes = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
    return password.length >= 8 && classes >= 3;
}

/** Init scripts copied into an image's /docker-entrypoint-initdb.d, prefixed to keep their order. */
function initDbFiles(scripts: string[] | undefined, dir = '/docker-entrypoint-initdb.d'): [string, string][] {
    return (scripts ?? []).map((s, i) => [resolve(s), `${dir}/${String(i + 1).padStart(2, '0')}-${basename(s)}`]);
}

// ─── Specs per backend (pure) ───────────────────────────────────────────────

export function databaseSpec(config: DatabaseFixtureConfig, options: ContainerOptions): { spec: ContainerSpec; resolved: Omit<DatabaseFixtureConfig, 'host' | 'port'> } {
    const fixture = 'databaseClient';
    switch (config.type) {
        case 'postgresql': {
            const database = config.database || DEFAULT_CREDENTIALS.database;
            const username = config.username ?? DEFAULT_CREDENTIALS.username;
            const password = config.password ?? DEFAULT_CREDENTIALS.password;
            return {
                spec: {
                    ...baseSpec('postgresql', fixture, options),
                    env: { POSTGRES_DB: database, POSTGRES_USER: username, POSTGRES_PASSWORD: password },
                    port: 5432,
                    // -h: during init scripts the server only listens on its socket, so TCP readiness means init is done.
                    healthCheck: `pg_isready -h 127.0.0.1 -U ${quote(username)} -d ${quote(database)}`,
                    files: initDbFiles(options.initScripts),
                },
                resolved: { ...config, database, username, password },
            };
        }
        case 'mysql': {
            const database = config.database || DEFAULT_CREDENTIALS.database;
            const username = config.username ?? DEFAULT_CREDENTIALS.username;
            const password = config.password ?? DEFAULT_CREDENTIALS.password;
            const env: Record<string, string> =
                username === 'root'
                    ? { MYSQL_DATABASE: database, MYSQL_ROOT_PASSWORD: password }
                    : { MYSQL_DATABASE: database, MYSQL_USER: username, MYSQL_PASSWORD: password, MYSQL_ROOT_PASSWORD: password };
            return {
                spec: {
                    ...baseSpec('mysql', fixture, options),
                    env,
                    port: 3306,
                    // During init the server runs with networking off, so a TCP ping means init is done.
                    healthCheck: 'mysqladmin ping -h 127.0.0.1 --silent',
                    files: initDbFiles(options.initScripts),
                },
                resolved: { ...config, database, username, password },
            };
        }
        case 'mssql': {
            const password = config.password ?? DEFAULT_CREDENTIALS.mssqlPassword;
            if (!meetsMssqlPasswordPolicy(password)) {
                throw new FixtureInitError(fixture, 'boot', {
                    reason:
                        'the configured database password is too weak for the SQL Server container (it needs 8+ characters ' +
                        'from three of: upper case, lower case, digits, symbols). Set a stronger PW_DB_PASSWORD, or remove ' +
                        `the password from this environment's config to use the default ("${DEFAULT_CREDENTIALS.mssqlPassword}").`,
                });
            }
            return {
                spec: {
                    ...baseSpec('mssql', fixture, options),
                    env: { ACCEPT_EULA: 'Y', MSSQL_SA_PASSWORD: password },
                    port: 1433,
                    healthCheck: `${SQLCMD} -S localhost -U sa -P ${quote(password)} -C -Q 'SELECT 1'`,
                    files: initDbFiles(options.initScripts, '/stagehand-init'),
                },
                // The container only has the `sa` login; the database is created after start if needed.
                resolved: {
                    ...config,
                    database: config.database || 'master',
                    username: 'sa',
                    password,
                    encrypt: false,
                    trustServerCertificate: true,
                },
            };
        }
        default:
            throw new FixtureInitError(fixture, 'boot', {
                reason: `container is not supported for database type "${config.type}"; SQLite needs no server, so remove the container option`,
            });
    }
}

export function redisSpec(config: RedisFixtureConfig, options: ContainerOptions): ContainerSpec {
    const auth = config.password ? `-a ${quote(config.password)} --no-auth-warning ` : '';
    return {
        ...baseSpec('redis', 'redisClient', options),
        env: {},
        port: 6379,
        command: config.password ? ['redis-server', '--requirepass', config.password] : undefined,
        healthCheck: `redis-cli ${auth}ping | grep -q PONG`,
    };
}

export function mongoDbSpec(config: MongoDbFixtureConfig, options: ContainerOptions): ContainerSpec {
    const env: Record<string, string> = {};
    if (config.username) {
        env.MONGO_INITDB_ROOT_USERNAME = config.username;
        env.MONGO_INITDB_ROOT_PASSWORD = config.password ?? DEFAULT_CREDENTIALS.password;
    }
    return {
        ...baseSpec('mongodb', 'mongoDbClient', options),
        env,
        port: 27017,
        healthCheck: `mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' | grep -q 1`,
    };
}

export function neo4jSpec(config: Neo4jFixtureConfig, options: ContainerOptions): { spec: ContainerSpec; password: string } {
    const password = config.password || DEFAULT_CREDENTIALS.neo4jPassword;
    if (password.length < 8) {
        throw new FixtureInitError('neo4jClient', 'boot', { reason: 'the Neo4j image needs a password of at least 8 characters' });
    }
    return {
        spec: {
            ...baseSpec('neo4j', 'neo4jClient', options),
            env: { NEO4J_AUTH: `neo4j/${password}` },
            port: 7687,
            healthCheck: `cypher-shell -u neo4j -p ${quote(password)} 'RETURN 1'`,
        },
        password,
    };
}

/** Kafka advertises host:hostPort to clients, so the host port must be known before start. */
export function kafkaSpec(options: ContainerOptions, host: string, hostPort: number): ContainerSpec {
    return {
        ...baseSpec('kafka', 'kafkaClient', options),
        reuse: false, // the host port changes every run, so a reused broker would advertise a stale address
        env: {
            KAFKA_NODE_ID: '1',
            KAFKA_PROCESS_ROLES: 'broker,controller',
            // INTERNAL for the health check inside the container, HOST for the tests.
            KAFKA_LISTENERS: 'INTERNAL://0.0.0.0:19092,HOST://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093',
            KAFKA_ADVERTISED_LISTENERS: `INTERNAL://localhost:19092,HOST://${host}:${hostPort}`,
            KAFKA_INTER_BROKER_LISTENER_NAME: 'INTERNAL',
            KAFKA_CONTROLLER_LISTENER_NAMES: 'CONTROLLER',
            KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: 'INTERNAL:PLAINTEXT,HOST:PLAINTEXT,CONTROLLER:PLAINTEXT',
            KAFKA_CONTROLLER_QUORUM_VOTERS: '1@localhost:9093',
            KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true',
            KAFKA_NUM_PARTITIONS: '1',
            KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: '1',
            CLUSTER_ID: 'MkU3OEVBNTcwNTJENDM2Qk',
        },
        port: 9092,
        hostPort,
        healthCheck: '/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server localhost:19092 > /dev/null',
    };
}

/**
 * RabbitMQ: the image's default `guest` user may only connect from inside the
 * container, so the broker gets the config's credentials (or throwaway ones).
 */
export function rabbitMqSpec(config: AmqpFixtureConfig, options: ContainerOptions): { spec: ContainerSpec; username: string; password: string; vhost: string } {
    const username = config.username || DEFAULT_CREDENTIALS.username;
    const password = config.password || DEFAULT_CREDENTIALS.password;
    const vhost = config.vhost || '/';
    return {
        spec: {
            ...baseSpec('rabbitmq', 'amqpClient', options),
            env: { RABBITMQ_DEFAULT_USER: username, RABBITMQ_DEFAULT_PASS: password, RABBITMQ_DEFAULT_VHOST: vhost },
            port: 5672,
            // `ping` passes before the AMQP listener is up; this waits for the port.
            healthCheck: 'rabbitmq-diagnostics -q check_port_connectivity',
        },
        username,
        password,
        vhost,
    };
}

/** Mailpit: the API/UI on 8025 for the fixture, SMTP on 1025 for the app under test. */
export function mailpitSpec(options: ContainerOptions): ContainerSpec {
    return {
        ...baseSpec('mailpit', 'inboxClient', options),
        env: {},
        port: 8025,
        extraPorts: [1025],
        healthCheck: '/mailpit readyz',
    };
}

/** WireMock: stubs and the admin API on one port. */
export function wiremockSpec(options: ContainerOptions): ContainerSpec {
    return {
        ...baseSpec('wiremock', 'mockServer', options),
        env: {},
        port: 8080,
        healthCheck: 'curl -fs http://localhost:8080/__admin/health > /dev/null',
    };
}

/** A free TCP port on this machine. */
export function freePort(): Promise<number> {
    return new Promise((resolvePort, reject) => {
        const server = createServer();
        server.unref();
        server.on('error', reject);
        server.listen(0, () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close(() => resolvePort(port));
        });
    });
}

// ─── Manager ────────────────────────────────────────────────────────────────

/** Extra test time allowed while a container without its own startup timeout starts. */
const DEFAULT_STARTUP_BUDGET_MS = 180_000;
/** On top of the startup timeout: pulling the image isn't part of it. */
const IMAGE_PULL_BUDGET_MS = 120_000;

/**
 * Waits for a container start without spending the test's own timeout on it.
 * The container starts during the first test that needs it, so that test's
 * timeout is extended by the startup timeout first, then set back to its
 * original value plus the time the start actually took. Outside a test (no
 * `test.info()`) it just waits.
 */
export async function withStartupBudget<T>(pending: Promise<T>, budgetMs: number): Promise<T> {
    let info: { timeout: number; setTimeout(ms: number): void } | undefined;
    try {
        const { test } = await import('@playwright/test');
        info = test.info();
    } catch {
        return pending;
    }
    const original = info.timeout;
    if (!original) return pending; // timeouts disabled
    const t0 = Date.now();
    info.setTimeout(original + budgetMs + IMAGE_PULL_BUDGET_MS);
    try {
        return await pending;
    } finally {
        info.setTimeout(original + (Date.now() - t0));
    }
}

interface Started {
    container: StartedTestContainer;
    host: string;
    port: number;
    /** Host ports of `extraPorts`, by container port. */
    extra: Record<number, number>;
    reuse: boolean;
}

/**
 * Starts containers on demand and shares each one across the tests of one
 * worker. Created by the `stagehandContainers` worker fixture.
 */
export class ContainerManager {
    private readonly started = new Map<string, Promise<Started>>();
    /** Keys whose container is up: tests that ask for them again don't wait. */
    private readonly ready = new Set<string>();

    /** The database config with host/port/credentials pointing at a container. SQLite is returned unchanged. */
    async database(config: DatabaseFixtureConfig): Promise<DatabaseFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options || config.type === 'sqlite') return config;
        const { spec, resolved } = databaseSpec(config, options);
        const started = await this.ensure(spec, async (c) => {
            if (config.type !== 'mssql') return;
            const sql = (args: string[]) => this.exec(c, spec, [SQLCMD, '-S', 'localhost', '-U', 'sa', '-P', resolved.password!, '-C', '-b', ...args]);
            if (resolved.database !== 'master') {
                const name = resolved.database.replace(/]/g, ']]');
                await sql(['-Q', `IF DB_ID(N'${resolved.database.replace(/'/g, "''")}') IS NULL CREATE DATABASE [${name}]`]);
            }
            for (const [, target] of spec.files ?? []) await sql(['-d', resolved.database, '-i', target]);
        });
        return { ...resolved, host: started.host, port: started.port, container: false };
    }

    async redis(config: RedisFixtureConfig): Promise<RedisFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const started = await this.ensure(redisSpec(config, options));
        return { ...config, host: started.host, port: started.port, container: false };
    }

    async mongodb(config: MongoDbFixtureConfig): Promise<MongoDbFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const started = await this.ensure(mongoDbSpec(config, options));
        return {
            ...config,
            uri: undefined,
            srv: false,
            host: started.host,
            port: started.port,
            database: config.database || DEFAULT_CREDENTIALS.database,
            password: config.username ? (config.password ?? DEFAULT_CREDENTIALS.password) : config.password,
            authSource: config.username ? (config.authSource ?? 'admin') : config.authSource,
            container: false,
        };
    }

    async neo4j(config: Neo4jFixtureConfig): Promise<Neo4jFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const { spec, password } = neo4jSpec(config, options);
        const started = await this.ensure(spec);
        return { ...config, uri: `bolt://${started.host}:${started.port}`, username: 'neo4j', password, container: false };
    }

    async kafka(config: KafkaFixtureConfig): Promise<KafkaFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const tc = await this.testcontainers('kafkaClient');
        const host = (await tc.getContainerRuntimeClient()).info.containerRuntime.host;
        // Key on the options, not the port: the port is chosen once, when the container starts.
        const key = JSON.stringify(['kafka', options.image ?? DEFAULT_IMAGES.kafka]);
        const started = await this.ensureKeyed(key, async () => this.start(kafkaSpec(options, host, await freePort())));
        return { ...config, brokers: [`${started.host}:${started.port}`], ssl: false, sasl: undefined, container: false };
    }

    /** RabbitMQ: host/port/credentials point at the container (`url` is dropped). */
    async amqp(config: AmqpFixtureConfig): Promise<AmqpFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const { spec, username, password, vhost } = rabbitMqSpec(config, options);
        const started = await this.ensure(spec);
        return { ...config, url: undefined, tls: false, host: started.host, port: started.port, username, password, vhost, container: false };
    }

    /** Mailpit: `url` points at its API, `smtpHost`/`smtpPort` at its SMTP server. */
    async inbox(config: InboxFixtureConfig): Promise<InboxFixtureConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const started = await this.ensure(mailpitSpec(options));
        return {
            ...config,
            url: `http://${started.host}:${started.port}`,
            smtpHost: started.host,
            smtpPort: started.extra[1025],
            username: undefined,
            password: undefined,
            container: false,
        };
    }

    /** WireMock: `url` (and the admin API) point at the container. */
    async mock(config: MockServerConfig): Promise<MockServerConfig> {
        const options = containerOptions(config.container);
        if (!options) return config;
        const started = await this.ensure(wiremockSpec(options));
        const url = `http://${started.host}:${started.port}`;
        return { ...config, url, adminUrl: url, container: false };
    }

    /** Stops every container this worker started (reused ones keep running). */
    async stopAll(): Promise<void> {
        const all = await Promise.allSettled([...this.started.values()]);
        this.started.clear();
        await Promise.allSettled(
            all.flatMap((r) => (r.status === 'fulfilled' && !r.value.reuse ? [r.value.container.stop({ timeout: 5_000 })] : [])),
        );
    }

    private ensure(spec: ContainerSpec, afterStart?: (c: StartedTestContainer) => Promise<void>): Promise<Started> {
        const key = JSON.stringify([spec.kind, spec.image, spec.env, spec.command, spec.files]);
        return this.ensureKeyed(
            key,
            async () => {
                const started = await this.start(spec);
                if (afterStart) await afterStart(started.container);
                return started;
            },
            spec.startupTimeoutMs,
        );
    }

    private ensureKeyed(key: string, create: () => Promise<Started>, startupTimeoutMs = DEFAULT_STARTUP_BUDGET_MS): Promise<Started> {
        let pending = this.started.get(key);
        if (!pending) {
            pending = create();
            this.started.set(key, pending);
            pending.then(
                () => this.ready.add(key),
                () => this.started.delete(key), // a later test can retry
            );
        }
        if (this.ready.has(key)) return pending;
        return withStartupBudget(pending, startupTimeoutMs);
    }

    private testcontainers(fixture: string): Promise<Testcontainers> {
        return loadOptional<Testcontainers>('testcontainers', `${fixture} with container`);
    }

    private async start(spec: ContainerSpec): Promise<Started> {
        const tc = await this.testcontainers(spec.fixture);
        let container = new tc.GenericContainer(spec.image)
            .withEnvironment(spec.env)
            .withExposedPorts(spec.hostPort ? { container: spec.port, host: spec.hostPort } : spec.port, ...(spec.extraPorts ?? []))
            .withHealthCheck({
                test: ['CMD-SHELL', spec.healthCheck],
                interval: 1_000,
                timeout: 5_000,
                retries: Math.ceil(spec.startupTimeoutMs / 1_000),
            })
            .withWaitStrategy(tc.Wait.forHealthCheck())
            .withStartupTimeout(spec.startupTimeoutMs)
            .withLabels({ 'dev.stagehand.backend': spec.kind });
        if (spec.command) container = container.withCommand(spec.command);
        if (spec.files?.length) {
            const missing = spec.files.filter(([source]) => !existsSync(source)).map(([source]) => source);
            if (missing.length) {
                throw new FixtureInitError(spec.fixture, 'boot', { image: spec.image, reason: `init script not found: ${missing.join(', ')}` });
            }
            container = container.withCopyFilesToContainer(spec.files.map(([source, target]) => ({ source, target })));
        }
        if (spec.reuse) container = container.withReuse();

        try {
            const started = await container.start();
            const extra = Object.fromEntries((spec.extraPorts ?? []).map((p) => [p, started.getMappedPort(p)]));
            return { container: started, host: started.getHost(), port: started.getMappedPort(spec.port), extra, reuse: spec.reuse };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const noRuntime = /container runtime|ECONNREFUSED|ENOENT|docker\.sock|Cannot connect to the Docker daemon/i.test(message);
            throw new FixtureInitError(
                spec.fixture,
                'boot',
                {
                    image: spec.image,
                    reason: noRuntime
                        ? `${message} (is Docker running? Testcontainers needs a Docker-compatible runtime)`
                        : `${message} (the container started but never became healthy; check its credentials and image, or run it by hand with the same settings to see its logs)`,
                },
                error instanceof Error ? error : undefined,
            );
        }
    }

    private async exec(container: StartedTestContainer, spec: ContainerSpec, command: string[]): Promise<void> {
        const result = await container.exec(command);
        if (result.exitCode !== 0) {
            throw new FixtureInitError(spec.fixture, 'boot', {
                image: spec.image,
                reason: `setup command failed (${result.exitCode}): ${result.output.trim().slice(0, 500)}`,
            });
        }
    }
}
