const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        fileParallelism: false,
        globals: true,
        setupFiles: ['./test/vitest-setup.mjs'],
        include: ['test/**/*_spec.js'],
        isolate: false,
        maxWorkers: 1,
        hookTimeout: 10000,
        testTimeout: 10000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            include: ['bin/**/*.js', 'lib/**/*.js', 'migrations/**/*.js', 'loggingrc.js'],
            exclude: ['test/**', 'vitest.config.js'],
            thresholds: {
                branches: 80,
                functions: 80,
                lines: 80,
            },
        },
    },
});
