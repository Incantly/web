import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests only. End-to-end specs live in tests/e2e and run with Playwright.
export default defineConfig({
  resolve: {
    // Mirrors the `@/*` path in tsconfig.json, so modules using it can be unit-tested.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
