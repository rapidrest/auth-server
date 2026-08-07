import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { resolve } from 'path';

export default defineConfig({
    ssr: {
        noExternal: ['@rapidrest/service-core', '@rapidrest/core'],
    },
    plugins: [
        swc.vite({
            jsc: {
                parser: {
                    syntax: 'typescript',
                    tsx: true,
                    decorators: true,
                },
                transform: {
                    react: {
                        runtime: 'automatic',
                    },
                    decoratorMetadata: true,
                    legacyDecorator: true,
                },
                target: 'es2020',
            },
        }),
    ],
    test: {
        globals: true,
        // Server-side test/**/*.test.ts suite runs under plain `node`, matching the real server runtime.
        // Frontend (apps/www) tests render React components and need a DOM — each of those test files
        // opts into `jsdom` individually via a `// @vitest-environment jsdom` docblock at its top
        // (`environmentMatchGlobs`, the config-level way to do this per-directory, was removed in Vitest 4).
        environment: 'node',
        setupFiles: ['./test/apps/setup.ts'],
        include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
        fileParallelism: false,
        pool: 'forks',
        poolOptions: {
            forks: {
                execArgv: ['--no-experimental-strip-types'],
            },
        },
        clearMocks: true,
        coverage: {
            enabled: true,
            provider: 'v8',
            include: ['src/**/*.ts', 'apps/**/*.ts', 'apps/**/*.tsx'],
            exclude: ['**/node_modules/**', 'src/server.ts', 'src/**/Models.ts', '**/test/**'],
            reporter: ['text', 'json', 'html', 'lcov'],
            thresholds: {
                branches: 99,
                functions: 100,
                lines: 100,
                statements: 100,
                // The frontend (apps/www, apps/admin, and the apps/shared code they both depend on) is fully
                // unit-tested and held to 100% — this fails the build if new frontend code lands without
                // matching tests. The backend (src/**) keeps the relaxed 0% fallback above; its coverage
                // today comes from Server.*.test.ts's integration-level start/stop checks, not per-route
                // unit tests.
                'apps/www/**': {
                    branches: 100,
                    functions: 100,
                    lines: 100,
                    statements: 100,
                },
                'apps/admin/**': {
                    branches: 100,
                    functions: 100,
                    lines: 100,
                    statements: 100,
                },
                'apps/shared/lib/adminApi.ts': {
                    branches: 100,
                    functions: 100,
                    lines: 100,
                    statements: 100,
                },
                'apps/shared/components/admin/**': {
                    branches: 100,
                    functions: 100,
                    lines: 100,
                    statements: 100,
                },
            },
            reportsDirectory: 'coverage',
        },
        reporters: ['default', 'junit'],
        outputFile: {
            junit: 'junit.xml',
        },
    },
});
