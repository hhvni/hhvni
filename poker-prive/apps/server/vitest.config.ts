import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://poker:poker@localhost:5432/poker_test?schema=public',
      FAST_MODE: '1',
      SERVE_WEB: '0',
      PUBLIC_URL: 'http://localhost:3999',
      LOG_LEVEL: 'warn',
      STARTING_BANKROLL: '100000',
    },
  },
});
