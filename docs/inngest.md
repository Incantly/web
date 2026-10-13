# Inngest — async document jobs contract

> Status: **contract, not yet installed.** There is no `inngest` dependency in `package.json` today. Do not invent Inngest imports, routes, or serve handlers until the package is added. This file defines what its integration must look like and how E2E tests verify it.

## Why Inngest here

Document work splits into two speeds: instant UI (typing, formatting, preview) and slow jobs (large exports, PDF rendering, AI operations, sync retries). Slow jobs belong in Inngest functions, never in request handlers or component effects, so they survive refresh, retry idempotently, and report progress.

## Rules for the future integration

- **Job inputs and outputs are canonical documents only** (`document-schema` skill). A function receives an `IncantlyDocument` (or fixture reference + revision) and returns artifacts plus a loss/warning report. Tiptap state never crosses the job boundary.
- **Every function is idempotent by key** (document id + revision + operation). Retries converge to the same artifacts; reruns never duplicate downloads, emails, or billed operations.
- **Progress, cancellation, and failure are first-class:** the client polls or subscribes to run status; every terminal state (completed / failed / cancelled) carries either artifacts or a structured error. Silent stalls are a bug.
- **Validation gates apply inside jobs too** (`document-validation` skill): re-validate on entry, because queued payloads may predate a migration.
- **Exports through jobs follow the export skill**: same projections, same loss reports, same preview-before-download UX — the job only changes *where* the work runs, never its shape.

## How E2E tests verify async jobs (`playwright` skill applies)

- Trigger the job from real UI, then assert the full lifecycle in-browser: pending indicator → progress updates → terminal state with artifacts or error. Assert each transition; never `sleep()` past the job.
- Bound every wait (Playwright `expect.poll` / `waitForResponse` with explicit timeouts). A job that never settles fails the test — that is the test working.
- Failure paths are first-class scenarios: failed export shows the error and offers retry; cancelled export leaves prior artifacts intact.
- Proof lands in `e2e-artifacts/` like any other flow: screenshots of pending/terminal states plus `results.json` checks per transition.
