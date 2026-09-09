import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.js'],
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 10000,
  },
});
