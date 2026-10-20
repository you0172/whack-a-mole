import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // PRD §6 (可测性): the rules layer must hold ≥95% statement coverage. UI and
      // audio are exercised in the browser, not here.
      include: ['src/game/**/*.ts', 'src/storage/**/*.ts'],
      thresholds: {
        lines: 95,
        functions: 85,
        branches: 85,
        statements: 95,
      },
    },
  },
});
