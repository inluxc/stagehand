import { defineConfig } from 'vitepress';

const repo = 'https://github.com/inluxc/propmaster';

export default defineConfig({
    title: 'Propmaster',
    description: '@inluxc/propmaster: ready-to-use Playwright Test fixtures for APIs, databases, messaging, caches, mobile devices and OTP.',
    // Served from https://propmaster.dev/ (custom domain on GitHub Pages)
    base: '/',
    cleanUrls: true,
    lastUpdated: true,
    // Keep repo-only files out of the site.
    srcExclude: ['**/README.md'],
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }]],

    markdown: {
        config(md) {
            // Inline code like `${{ secrets.X }}` must stay literal, not be read as a Vue template.
            const inlineCode = md.renderer.rules.code_inline!;
            md.renderer.rules.code_inline = (...args) => inlineCode(...args).replace(/^<code/, '<code v-pre');

            // Docs link to repo files with "../" paths (workflows, actions, README).
            // Those aren't site pages, so send them to GitHub instead.
            const render = md.renderer.rules.link_open ?? ((t, i, o, _e, self) => self.renderToken(t, i, o));
            md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
                const href = tokens[idx].attrGet('href');
                if (href?.startsWith('../') && !href.endsWith('.md')) {
                    const path = href.replace(/^(\.\.\/)+/, '');
                    const kind = /\.[a-z]+$/i.test(path) ? 'blob' : 'tree';
                    tokens[idx].attrSet('href', `${repo}/${kind}/main/${path}`);
                    tokens[idx].attrSet('target', '_blank');
                }
                return render(tokens, idx, options, env, self);
            };
        },
    },

    themeConfig: {
        logo: '/logo.svg',
        nav: [
            { text: 'Guide', link: '/guide/getting-started', activeMatch: '/guide/' },
            { text: 'Fixtures', link: '/openapi-fixture', activeMatch: '-fixture' },
            { text: 'CI/CD', link: '/ci', activeMatch: '^/ci' },
            { text: 'npm', link: 'https://www.npmjs.com/package/@inluxc/propmaster' },
        ],
        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Getting Started', link: '/guide/getting-started' },
                    { text: 'Configuration', link: '/guide/configuration' },
                    { text: 'Project Layout', link: '/guide/project-layout' },
                    { text: 'Writing Tests', link: '/guide/writing-tests' },
                    { text: 'Generating API Tests', link: '/guide/generate-api-tests' },
                ],
            },
            {
                text: 'Fixtures',
                items: [
                    { text: 'OpenAPI', link: '/openapi-fixture' },
                    { text: 'Database', link: '/database-fixture' },
                    { text: 'GraphQL', link: '/graphql-fixture' },
                    { text: 'Kafka', link: '/kafka-fixture' },
                    { text: 'RabbitMQ (AMQP)', link: '/amqp-fixture' },
                    { text: 'Redis', link: '/redis-fixture' },
                    { text: 'MongoDB', link: '/mongodb-fixture' },
                    { text: 'Neo4j', link: '/neo4j-fixture' },
                    { text: 'OTP (2FA)', link: '/otp-fixture' },
                    { text: 'Inbox (email)', link: '/inbox-fixture' },
                    { text: 'Mock server (third-party APIs)', link: '/mock-server-fixture' },
                    { text: 'Test data & cleanup', link: '/test-data' },
                    { text: 'Auth: tokens & roles', link: '/auth' },
                    { text: 'Appium & GADS', link: '/appium-fixture' },
                    { text: 'Custom Fixtures', link: '/custom-fixtures' },
                ],
            },
            {
                text: 'CI/CD',
                items: [
                    { text: 'Overview & GitHub Actions', link: '/ci' },
                    { text: 'GitLab CI/CD', link: '/ci-gitlab' },
                    { text: 'Jenkins', link: '/ci-jenkins' },
                    { text: 'Azure Pipelines', link: '/ci-azure-pipelines' },
                    { text: 'CircleCI', link: '/ci-circleci' },
                    { text: 'Bitbucket Pipelines', link: '/ci-bitbucket' },
                    { text: 'Docker Compose (any CI)', link: '/ci-docker-compose' },
                    { text: 'Testcontainers (no CI services)', link: '/testcontainers' },
                ],
            },
            {
                text: 'Operations',
                items: [
                    { text: 'Secrets Management', link: '/secrets' },
                    { text: 'MCP server for agents', link: '/mcp-server' },
                ],
            },
        ],
        socialLinks: [{ icon: 'github', link: repo }],
        editLink: {
            pattern: `${repo}/edit/main/docs/:path`,
            text: 'Edit this page on GitHub',
        },
        search: { provider: 'local' },
        outline: { level: [2, 3] },
        footer: {
            message: 'Released under the MIT License.',
        },
    },
});
