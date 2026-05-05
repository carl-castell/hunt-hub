import { defineConfig } from 'vitest/config';
import path from 'path';

const alias = { '@': path.resolve('./src') };

export default defineConfig({
  resolve: { alias },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/tests/**', 'src/db/seed.ts', 'src/db/enable-extensions.ts'],
    },
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          globals: true,
          environment: 'node',
          include: ['src/tests/unit/**/*.test.ts'],
          setupFiles: ['src/tests/setup.unit.ts'],
          env: {
            NODE_ENV: 'test',
            DB_PROVIDER: 'local',
            LOCAL_DATABASE_URL: 'postgresql://app:app@localhost:5434/appdb_test',
          },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          globals: true,
          environment: 'node',
          include: ['src/tests/integration/**/*.test.ts'],
          globalSetup: ['src/tests/global-setup.integration.ts'],
          setupFiles: ['src/tests/setup.integration.ts'],
          fileParallelism: false,
          env: {
            DB_PROVIDER: 'local',
            LOCAL_DATABASE_URL: 'postgresql://app:app@localhost:5434/appdb_test',
            SKIP_TOTP: 'true',
          },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'e2e',
          globals: true,
          environment: 'node',
          include: ['src/tests/e2e/**/*.test.ts'],
          globalSetup: ['src/tests/global-setup.integration.ts'],
          setupFiles: ['src/tests/setup.integration.ts'],
          fileParallelism: false,
          env: {
            DB_PROVIDER: 'local',
            LOCAL_DATABASE_URL: 'postgresql://app:app@localhost:5434/appdb_test',
          },
        },
      },
    ],
  },
});
