---
name: playwright-e2e
description: End-to-end verification with Playwright. Use when asked to verify anything user-visible, write an E2E test, or prove a flow works in this app.
---

# Playwright E2E Rules

Prove behavior in a real browser. "It builds" is not verification.

## Must

- Drive the running app (`npm run dev`, default `http://localhost:3000`) with the specs in `tests/e2e/` via `npm run test:e2e`. Never invent a parallel harness — extend the committed one.
- Every spec asserts behavior a user can observe (renders, text, navigation, downloads, previews) with literal expected values, plus a zero-problems gate: no console errors, no page errors, no failed (4xx/5xx) requests. Favicon noise is the only exempted URL.
- Every spec leaves proof in `e2e-artifacts/`: a `results.json` entry per check (suite, name, pass, detail) via `tests/e2e/artifacts.ts`, and a PNG screenshot per meaningful state. Screenshots are named after the state they prove (`landing.png`, `pdf-preview.png`), never `screenshot-1.png`.
- Show the decisive screenshots and the pass/fail table in the final report. A red check fails the whole task — fix the product, not the assertion.
- Keep specs hermetic: reset state (fixtures, localStorage) in `beforeEach` where a prior test could leak; scope selectors to the feature under test.

## Never

- Never assert on implementation details (component names, store shape, CSS classes as proof of behavior) — assert what the user sees.
- Never weaken a failing assertion to green. A failing E2E means the product is wrong or the expectation is documented-stale; resolve which, explicitly.
- Never leave a run without artifacts. No PNG + no `results.json` entry = the test didn't happen.

## Environment

- `playwright.config.ts` uses bundled Chromium by default. On machines without the Playwright browser download, set `PLAYWRIGHT_CHROME_PATH` to a system Chrome instead — same suite, no config change.
