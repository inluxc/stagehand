/**
 * `propmaster organize` — sorts existing Playwright tests into the
 * per-type layout (tests/api, tests/integration, tests/e2e, tests/mobile).
 *
 * Deterministic on purpose: a test's fixtures say what kind of test it is,
 * so the same project always gets the same plan, with no network access and
 * no source code leaving the machine. Files the rules can't place are left
 * where they are and listed with the reason, for a person (or their coding
 * agent) to decide.
 *
 * Dry run by default. `--apply` moves files (`git mv` when tracked, so history
 * follows) and rewrites relative imports in moved files and in files that
 * import them.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { findProjectRoot, findTests, lineOf, loadConfig, matchClose, skipNonCode, splitArgs } from './check-tests.js';
import { TEST_TYPES, configSnippet, typeInfo, type TestType } from './layout.js';

// ─── Classification ─────────────────────────────────────────────────────────

const MOBILE = new Set(['appiumDriver', 'gadsHub']);
const E2E = new Set(['page', 'context', 'browser', 'browserName']);
const INTEGRATION = new Set(['databaseClient', 'kafkaClient', 'amqpClient', 'redisClient', 'mongoDbClient', 'neo4jClient']);
const API = new Set(['openApiClient', 'graphqlClient', 'request']);
/** Fixtures that say nothing about the test type: options, configs, OTP. */
const NEUTRAL = new Set([
    'otpClient',
    'baseURL',
    'openapi',
    'database',
    'kafka',
    'amqp',
    'redis',
    'mongodb',
    'neo4j',
    'graphql',
    'otp',
    'appium',
]);

const isKnown = (f: string) => MOBILE.has(f) || E2E.has(f) || INTEGRATION.has(f) || API.has(f);
const isNeutral = (f: string) => NEUTRAL.has(f) || f.endsWith('Config');

export type Classification = { type: TestType; reason?: undefined } | { type: null; reason: string };

/**
 * Decides a test's type from the fixtures it requests (its own plus its hooks'):
 * appium → mobile; page/context/browser → e2e (even with API fixtures, which
 * set up data); a database/broker/cache client → integration; HTTP clients
 * only → api. Unknown custom fixtures make it ambiguous unless a browser or
 * device already decides it (custom fixtures there are usually page objects).
 */
export function classifyFixtures(fixtures: Iterable<string>): Classification {
    const set = new Set(fixtures);
    const has = (group: Set<string>) => [...set].some((f) => group.has(f));
    if (has(MOBILE)) return { type: 'mobile' };
    if (has(E2E)) return { type: 'e2e' };
    const custom = [...set].filter((f) => !isKnown(f) && !isNeutral(f));
    if (custom.length) return { type: null, reason: `uses custom fixtures (${custom.join(', ')}); can't tell which type they need` };
    if (has(INTEGRATION)) return { type: 'integration' };
    if (has(API)) return { type: 'api' };
    return { type: null, reason: 'needs no browser, device or service fixture (a unit-style test); place it yourself' };
}

/**
 * Names destructured from a test or hook callback's first parameter:
 * `async ({ page, openApiClient: api }) => ...` → ['page', 'openApiClient'].
 * Returns [] for a callback with no parameters and null when the parameter
 * isn't destructured (`async (fixtures) => ...`), which can't be read statically.
 */
export function fixturesOf(callback: string): string[] | null {
    const src = callback.trim();
    const head = /^(?:async\s+)?(?:function\s*[\w$]*\s*)?\(\s*/.exec(src);
    if (!head) return null;
    const i = head[0].length;
    if (src[i] === ')') return [];
    if (src[i] !== '{') return null;
    const close = matchClose(src, i);
    const names: string[] = [];
    for (const entry of splitArgs(src, i, close)) {
        const e = entry.trim();
        if (!e || e.startsWith('...')) continue;
        const m = /^([\w$]+)/.exec(e);
        if (m) names.push(m[1]);
    }
    return names;
}

const HOOK_RE = /^test\.(beforeEach|afterEach|beforeAll|afterAll)\s*\(/;

/** Fixtures requested by `test.beforeEach/afterEach/beforeAll/afterAll` hooks in a file. */
function hookFixtures(src: string): string[] | null {
    const all: string[] = [];
    for (let i = 0; i < src.length; ) {
        const skipped = skipNonCode(src, i);
        if (skipped !== -1) {
            i = skipped;
            continue;
        }
        if (src.startsWith('test.', i) && !/[\w$.]/.test(src[i - 1] ?? '')) {
            const m = HOOK_RE.exec(src.slice(i, i + 40));
            if (m) {
                const open = i + m[0].length - 1;
                const args = splitArgs(src, open, matchClose(src, open));
                const fixtures = args.length ? fixturesOf(args[args.length - 1]) : [];
                if (fixtures === null) return null;
                all.push(...fixtures);
                i = open + 1;
                continue;
            }
        }
        i++;
    }
    return all;
}

/** Where a Playwright test file gets `test` from. Other runners' files are ignored. */
// `(?:(?!\bfrom\b)[^;])*?` keeps a match inside one import statement even in files without semicolons.
const PLAYWRIGHT_IMPORT =
    /^\s*import\s+(?!type\b)(?:(?!\bfrom\b)[^;])*?\btest\b(?:(?!\bfrom\b)[^;])*?\bfrom\s+['"](@playwright\/test|@inluxc\/propmaster|\.{1,2}\/[^'"]+)['"]/m;

export interface TestSummary {
    title: string;
    line: number;
    fixtures: string[];
    type: TestType | null;
}

export interface FileAnalysis {
    /** False for files that aren't Playwright tests (Vitest, Jest, node:test, ...). */
    playwright: boolean;
    type: TestType | null;
    reason?: string;
    tests: TestSummary[];
}

/** Classifies one test file from its source. Pure, so it is easy to unit test. */
export function analyzeSource(src: string): FileAnalysis {
    if (!PLAYWRIGHT_IMPORT.test(src)) return { playwright: false, type: null, reason: 'not a Playwright test file', tests: [] };

    const hooks = hookFixtures(src);
    const found = findTests(src);
    if (found.length === 0) return { playwright: true, type: null, reason: 'no test() calls found', tests: [] };
    if (hooks === null) {
        return { playwright: true, type: null, reason: "a hook's fixtures aren't destructured, so they can't be read", tests: [] };
    }

    const tests: TestSummary[] = [];
    let firstReason: string | undefined;
    for (const t of found) {
        const own = fixturesOf(t.body);
        const line = lineOf(src, t.index);
        if (own === null) {
            firstReason ??= `"${t.title}" (line ${line}) doesn't destructure its fixtures, so they can't be read`;
            tests.push({ title: t.title, line, fixtures: [], type: null });
            continue;
        }
        const fixtures = [...new Set([...own, ...hooks])];
        const c = classifyFixtures(fixtures);
        if (c.type === null) firstReason ??= `"${t.title}" (line ${line}) ${c.reason}`;
        tests.push({ title: t.title, line, fixtures, type: c.type });
    }

    if (firstReason) return { playwright: true, type: null, reason: firstReason, tests };
    const types = [...new Set(tests.map((t) => t.type!))];
    if (types.length > 1) {
        const counts = types.map((ty) => `${ty} (${tests.filter((t) => t.type === ty).length})`).join(', ');
        return { playwright: true, type: null, reason: `mixes test types: ${counts}; split the file by type`, tests };
    }
    return { playwright: true, type: types[0], tests };
}

// ─── Destinations ───────────────────────────────────────────────────────────

const ROOT_SEGMENTS = new Set(['tests', 'test', '__tests__', 'playwright']);
const TYPE_SEGMENTS = new Set(['specs', 'spec', 'e2e', 'ui', 'browser', 'web', 'api', 'integration', 'mobile', 'functional', 'acceptance']);
/** Suffixes the old layout used to pick a project; in the new layout the folder does that. */
const RENAMED_SUFFIX = /\.(browser|mobile|e2e)\.((?:c|m)?[jt]sx?)$/;

/**
 * `tests/specs/users/create.spec.ts` + api → `tests/api/users/create.spec.ts`.
 * Drops one root folder (tests, test, __tests__, playwright) and then one
 * type-like folder (specs, e2e, api, ...), keeping the rest of the path, and
 * turns the old `.browser.ts` / `.mobile.ts` / `.e2e.ts` suffixes into `.spec.ts`.
 */
export function destinationFor(file: string, type: TestType): string {
    const parts = file.split('/');
    if (parts.length > 1 && ROOT_SEGMENTS.has(parts[0].toLowerCase())) parts.shift();
    if (parts.length > 1 && TYPE_SEGMENTS.has(parts[0].toLowerCase())) parts.shift();
    const name = parts.pop()!.replace(RENAMED_SUFFIX, '.spec.$2');
    return [typeInfo(type).dir, ...parts, name].join('/');
}

// ─── Import rewriting ───────────────────────────────────────────────────────

/** Relative specifiers in import/export-from, side-effect imports, import() and require(). */
const SPECIFIER_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"])(\.{1,2}\/[^'"\n]*)\2/g;
const CODE_FILE = /\.(?:c|m)?[jt]sx?$/;
const RESOLVE_EXTS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];
const SWAP_EXTS: Record<string, string[]> = { '.js': ['.ts', '.tsx'], '.jsx': ['.tsx'], '.mjs': ['.mts'], '.cjs': ['.cts'] };

type Form = { kind: 'exact' } | { kind: 'addExt'; ext: string } | { kind: 'swapExt'; written: string; actual: string } | { kind: 'index'; name: string };

/** Resolves a relative specifier the way TypeScript/bundlers do, against a set of project files. */
export function resolveSpecifier(importer: string, spec: string, files: ReadonlySet<string>): { file: string; form: Form } | null {
    const base = posix.normalize(posix.join(posix.dirname(importer), spec));
    if (files.has(base)) return { file: base, form: { kind: 'exact' } };
    const written = posix.extname(base);
    for (const actual of SWAP_EXTS[written] ?? []) {
        const f = base.slice(0, -written.length) + actual;
        if (files.has(f)) return { file: f, form: { kind: 'swapExt', written, actual } };
    }
    for (const ext of RESOLVE_EXTS) {
        if (files.has(base + ext)) return { file: base + ext, form: { kind: 'addExt', ext } };
    }
    for (const ext of RESOLVE_EXTS) {
        const f = `${base}/index${ext}`;
        if (files.has(f)) return { file: f, form: { kind: 'index', name: `index${ext}` } };
    }
    return null;
}

function specifierFor(fromFile: string, target: string, form: Form): string {
    let path = target;
    if (form.kind === 'addExt') path = target.slice(0, -form.ext.length);
    else if (form.kind === 'swapExt') path = target.slice(0, -form.actual.length) + form.written;
    else if (form.kind === 'index') path = posix.dirname(target);
    const rel = posix.relative(posix.dirname(fromFile), path) || '.';
    return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * Rewrites the relative imports of `src` (a file moving from `oldPath` to
 * `newPath`, or staying put when they're equal) so they still point at the
 * same files after `moves` (old → new). Returns the new source and how many
 * specifiers changed.
 */
export function rewriteImports(
    src: string,
    oldPath: string,
    newPath: string,
    moves: ReadonlyMap<string, string>,
    files: ReadonlySet<string>,
): { content: string; changed: number } {
    let changed = 0;
    const content = src.replace(SPECIFIER_RE, (whole, lead: string, quote: string, spec: string) => {
        const resolved = resolveSpecifier(oldPath, spec, files);
        if (!resolved) return whole;
        const target = moves.get(resolved.file) ?? resolved.file;
        if (target === resolved.file && newPath === oldPath) return whole;
        const next = specifierFor(newPath, target, resolved.form);
        if (next === spec) return whole;
        changed++;
        return `${lead}${quote}${next}${quote}`;
    });
    return { content, changed };
}

/** Code in a moved file that reads paths relative to the test file, which no rewrite can fix safely. */
const PATH_HINT = /__dirname|__filename|import\.meta\.(?:dirname|filename|url)|readFileSync\s*\(|setInputFiles\s*\(|storageState\s*:/;

// ─── Planning ───────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'playwright-report', 'test-results', 'blob-report']);
const TEST_FILE = /\.(?:spec|test|e2e|browser|mobile)\.(?:c|m)?[jt]sx?$/;

function walk(root: string, dir = root, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(root, full, out);
        else out.push(relative(root, full).split(sep).join('/'));
    }
    return out;
}

export interface Move {
    from: string;
    to: string;
    type: TestType;
    tests: number;
}

export interface OrganizePlan {
    root: string;
    moves: Move[];
    /** Files already in the right folder. */
    inPlace: { file: string; type: TestType; tests: number }[];
    /** Playwright test files the rules couldn't place; left where they are. */
    ambiguous: { file: string; reason: string }[];
    /** Files whose destination is taken. */
    conflicts: { file: string; to: string; reason: string }[];
    /** Moved files to check by hand afterwards. */
    warnings: { file: string; message: string }[];
    /** Every file whose content changes (moved files at their new path, importers in place). */
    edits: { file: string; imports: number }[];
}

/** Builds the plan for `root`. Reads files; changes nothing. */
export function planOrganize(root: string): OrganizePlan {
    const exempt = loadConfig(root).exemptDirs;
    const all = walk(root);
    const files = new Set(all);
    const plan: OrganizePlan = { root, moves: [], inPlace: [], ambiguous: [], conflicts: [], warnings: [], edits: [] };
    const claimed = new Map<string, string>();

    for (const file of all) {
        if (!TEST_FILE.test(file) || file.endsWith('.d.ts') || /\.prop\.(?:c|m)?[jt]s$/.test(file)) continue;
        if (exempt.some((d) => file.startsWith(d))) continue;
        const analysis = analyzeSource(readFileSync(join(root, file), 'utf8'));
        if (!analysis.playwright) continue;
        if (analysis.type === null) {
            plan.ambiguous.push({ file, reason: analysis.reason ?? 'unknown' });
            continue;
        }
        const to = destinationFor(file, analysis.type);
        const tests = analysis.tests.length;
        if (to === file) {
            plan.inPlace.push({ file, type: analysis.type, tests });
            continue;
        }
        const taken = (files.has(to) ? to : undefined) ?? claimed.get(to);
        if (taken) {
            plan.conflicts.push({ file, to, reason: taken === to ? `${to} already exists` : `${taken} also moves there` });
            continue;
        }
        claimed.set(to, file);
        plan.moves.push({ from: file, to, type: analysis.type, tests });
    }

    // Note: a destination whose current file also moves away is still reported
    // as a conflict. That over-reports a rare swap, which is the safe side.

    const moves = new Map(plan.moves.map((m) => [m.from, m.to]));
    for (const file of all) {
        if (!CODE_FILE.test(file)) continue;
        const src = readFileSync(join(root, file), 'utf8');
        const newPath = moves.get(file) ?? file;
        const { changed } = rewriteImports(src, file, newPath, moves, files);
        if (changed > 0) plan.edits.push({ file: newPath, imports: changed });
        if (newPath !== file && PATH_HINT.test(src)) {
            plan.warnings.push({
                file: newPath,
                message: 'reads files by a path relative to the test (__dirname, import.meta, readFileSync, storageState or setInputFiles); check those paths',
            });
        }
    }
    return plan;
}

// ─── Applying ───────────────────────────────────────────────────────────────

function git(root: string, args: string[]): string | null {
    try {
        return execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    } catch {
        return null;
    }
}

/** True when `root` is in a git work tree with uncommitted changes. */
export function hasUncommittedChanges(root: string): boolean {
    const status = git(root, ['status', '--porcelain']);
    return status !== null && status.trim() !== '';
}

/** Moves the files and rewrites imports. Uses `git mv` for tracked files. */
export function applyOrganize(plan: OrganizePlan): void {
    const { root } = plan;
    const all = new Set(walk(root));
    const moves = new Map(plan.moves.map((m) => [m.from, m.to]));
    const inGit = git(root, ['rev-parse', '--is-inside-work-tree'])?.trim() === 'true';

    // Compute every new file content from the original tree before touching it.
    const writes = new Map<string, string>();
    for (const file of all) {
        if (!CODE_FILE.test(file)) continue;
        const newPath = moves.get(file) ?? file;
        const { content, changed } = rewriteImports(readFileSync(join(root, file), 'utf8'), file, newPath, moves, all);
        if (changed > 0) writes.set(newPath, content);
    }

    for (const { from, to } of plan.moves) {
        mkdirSync(dirname(join(root, to)), { recursive: true });
        const tracked = inGit && git(root, ['ls-files', '--error-unmatch', '--', from]) !== null;
        if (tracked) execFileSync('git', ['mv', '--', from, to], { cwd: root, stdio: 'ignore' });
        else renameSync(join(root, from), join(root, to));
    }
    for (const [file, content] of writes) writeFileSync(join(root, file), content, 'utf8');

    // Remove folders the moves left empty, walking up but never past the root.
    for (const { from } of plan.moves) {
        let dir = dirname(join(root, from));
        while (dir.startsWith(root + sep) && existsSync(dir) && readdirSync(dir).length === 0) {
            rmdirSync(dir);
            dir = dirname(dir);
        }
    }
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function pad(s: string, n: number): string {
    return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

/** Human-readable plan. `applied` switches the wording from "would" to "did". */
export function formatPlan(plan: OrganizePlan, applied = false): string {
    const out: string[] = [];
    const width = Math.min(60, Math.max(0, ...plan.moves.map((m) => m.from.length)));
    const importsFor = new Map(plan.edits.map((e) => [e.file, e.imports]));

    if (plan.moves.length) {
        out.push(`${applied ? 'Moved' : 'Will move'} ${plan.moves.length} file(s):`);
        for (const m of plan.moves) {
            const n = importsFor.get(m.to);
            out.push(`  ${pad(m.from, width)}  →  ${m.to}${n ? `   (${n} import${n > 1 ? 's' : ''} updated)` : ''}`);
        }
    } else {
        out.push('Nothing to move.');
    }

    const moved = new Set(plan.moves.map((m) => m.to));
    const importers = plan.edits.filter((e) => !moved.has(e.file));
    if (importers.length) {
        out.push('', `Imports ${applied ? 'updated' : 'to update'} in files that stay:`);
        for (const e of importers) out.push(`  ${e.file}   (${e.imports})`);
    }

    if (plan.inPlace.length) out.push('', `Already in the right folder: ${plan.inPlace.length} file(s).`);

    if (plan.ambiguous.length || plan.conflicts.length) {
        out.push('', 'Left where they are — decide these yourself:');
        for (const a of plan.ambiguous) out.push(`  ${a.file}\n      ${a.reason}`);
        for (const c of plan.conflicts) out.push(`  ${c.file}\n      would move to ${c.to}, but ${c.reason}`);
    }

    if (plan.warnings.length) {
        out.push('', `Check after ${applied ? 'the move' : 'moving'}:`);
        for (const w of plan.warnings) out.push(`  ${w.file}\n      ${w.message}`);
    }
    return out.join('\n');
}

const USAGE = `Usage: propmaster organize [--apply] [--force] [--json] [--root <dir>]

  Sorts Playwright tests into tests/api, tests/integration, tests/e2e and
  tests/mobile by the fixtures they use. Dry run unless --apply is given.

  --apply   Move the files (git mv when tracked) and update relative imports
  --force   Allow --apply with uncommitted git changes
  --json    Print the plan as JSON
  --root    Project root (default: nearest folder with a package.json)`;

/** `propmaster organize [--apply] [--force] [--json] [--root <dir>]`. Returns the exit code. */
export function runOrganize(argv: string[]): number {
    if (argv.includes('--help') || argv.includes('-h')) {
        console.log(USAGE);
        return 0;
    }
    const i = argv.indexOf('--root');
    const root = i !== -1 && argv[i + 1] ? resolve(argv[i + 1]) : findProjectRoot();
    const plan = planOrganize(root);

    if (argv.includes('--json')) {
        const { root: _root, ...rest } = plan;
        console.log(JSON.stringify(rest, null, 2));
        if (!argv.includes('--apply')) return 0;
    }

    const apply = argv.includes('--apply');
    if (apply && plan.moves.length && hasUncommittedChanges(root) && !argv.includes('--force')) {
        console.error('✗ There are uncommitted changes. Commit or stash them first so the move is easy to review and undo, or pass --force.');
        return 1;
    }

    if (apply && plan.moves.length) applyOrganize(plan);
    if (!argv.includes('--json')) {
        console.log('');
        console.log(`  Propmaster — organize${apply ? '' : ' (dry run)'}`);
        console.log('');
        console.log(
            formatPlan(plan, apply)
                .split('\n')
                .map((l) => `  ${l}`)
                .join('\n'),
        );
        console.log('');
        const types = [...new Set([...plan.moves, ...plan.inPlace].map((m) => m.type))];
        if (types.length) {
            console.log('  Make sure playwright.config has a project for each folder. If it was not');
            console.log('  generated by `propmaster init`, add:');
            console.log('');
            console.log(
                configSnippet(TEST_TYPES.map((t) => t.type).filter((t) => types.includes(t)))
                    .split('\n')
                    .map((l) => `    ${l}`)
                    .join('\n'),
            );
            console.log('');
            const missing = types.filter((t) => !existsSync(join(root, typeInfo(t).dir, 'projects.ts')));
            if (missing.length) console.log(`  Missing projects.ts in: ${missing.map((t) => typeInfo(t).dir).join(', ')}. Run \`npx propmaster init\` to add them.\n`);
        }
        if (!apply && plan.moves.length) console.log('  Run `npx propmaster organize --apply` to make these changes.\n');
    }
    return 0;
}
