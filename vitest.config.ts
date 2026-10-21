import { defineConfig } from 'vitest/config'

// Unit tests only. End-to-end specs live in tests/e2e and run with Playwright.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
