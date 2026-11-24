import { defineConfig } from 'vitest/config';

const THRESHOLD = { lines: 90, statements: 90, functions: 90, branches: 90 };

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/application/ports/index.ts'],
      reporter: ['text-summary', 'text'],
      thresholds: {
        'src/domain/**': THRESHOLD,
        'src/application/**': THRESHOLD,
      },
    },
  },
});
