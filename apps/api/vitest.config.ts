import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './test/global-setup.ts',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/karibu_test',
      EXPOSE_DEV_SECRETS: 'true',
      PAYSTACK_SECRET_KEY: 'sk_test_karibu',
      STORAGE_LOCAL_DIR: '/tmp/karibu-test-uploads',
    },
    fileParallelism: false,
    testTimeout: 20000,
  },
});
