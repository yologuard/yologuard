import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/src/**/*.e2e.test.ts', 'e2e/**/*.test.ts'],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    pool: 'forks',
  },
})
