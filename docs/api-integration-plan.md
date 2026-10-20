# Backend API integration plan

Connect the web app to the Incantly backend: Notes, Spaces, Library, Context, the AI agent, Assets, and Imports.

- **Contract:** [frontend-api-integration.md](frontend-api-integration.md), a copy of the backend guide. It covers journeys, error tables and retry rules.
- **Schemas:** the private OpenAPI reference at `http://localhost:3002/v1/docs`, with JSON at `/v1/docs/openapi.json`. The docs username and password live only in the backend `.env`. Never put them in this repo, browser code, URLs, or logs.
- **Backend's own checklist:** `incantly-backend/docs/frontend-implementation-plan.md`. This plan maps that checklist onto the code this app has today.
- **Not available from the backend yet:** team workspaces, sharing, collaboration, comments, tutor, flashcard/quiz/study-guide artifacts, streaming chat, search, billing, notifications, and exports. Do not call planned endpoints from `api-contract.md`.

Rules that apply to every to-do: `AGENTS.md` (finish every to-do; no E2E tests until asked), `docs/design-system.md`, the responsive rules, and the document skills (`document-schema`, `document-validation`, `document-storage`, `tiptap-adapter`).

Status key: `[ ]` open · `[x]` done · `[~]` deferred by an explicit user instruction (state the instruction).

---

## Starting point (verified 2026-10-20)

| Area | Today | Backend |
| --- | --- | --- |
| Auth | Better Auth client; `server.mjs` signs `/api/auth/*` | Done; no work beyond the session gate |
| Proxy | `next.config.ts` rewrites only `/api/auth/*` | Needs `/v1/*` on the same origin |
| Notes | `Workspace.tsx` seeds 4 mock notes into `localStorage` (`incantly-workspace-notes-v1`) | `/v1/notes` with revisions and typed transactions |
| Note kinds | `note` / `paper` / `journal` sidebar sections | **No kind field.** Notes have `title` only (decision D1) |
| Editor | `DocumentEditor` emits canonical `DocumentOperation`s (`transactionMapping.ts`); `useDocumentAutosave` exists | Accepts `@incantly/core` operations via `POST /v1/notes/{id}/transactions` |
| Assets | `IndexedDbAssetRepository`, `useAssetUploads` (local only) | Presigned direct uploads to MinIO/R2 |
| Library | `WorkspaceLibrary.tsx` uses a local IndexedDB `incantly-library` DB | `/v1/library/sources` with processing and index status |
| Spaces | None | `/v1/spaces` with Note membership and Source links |
| Inbox | Local mock list in `InboxPopover` | **No endpoint** (notifications not implemented; decision D2) |
| Search | Client filter over local notes | **No endpoint** (decision D3) |
| AI agent | None | `/v1/ai/*`: cited answers and practice questions as polled jobs |
| Tests | Playwright E2E only; no unit runner; no generated API types | — |

## Decisions needed from the product owner

These do not block Phase 0–1. They must be answered before the phase that names them.

- **D1. Papers and Journals (before Phase 2 UI).** The backend Note has no kind. Recommendation: make "Your Papers" and "Your Journals" **Spaces** (created on first use, by name). This makes them real server collections and also gives the agent a natural `SPACE` scope. Alternative: drop the distinction and show one Notes list.
- **D2. Inbox (before Phase 8).** The backend has no notifications. Recommendation: keep the popover and feed it from real events the app already knows: finished AI jobs, Sources that finished or failed processing, and completed imports. Remove the mock items.
- **D3. Search (before Phase 8).** The backend has no search endpoint. Recommendation: title search over the paged `/v1/notes` and `/v1/library/sources` lists. Content questions go to the agent ("Ask your notes").

---

## Phase 0: Foundation (API client)

- [ ] **0.1 Same-origin proxy for `/v1/*`.** Add a `next.config.ts` rewrite to `AUTH_BACKEND_URL`, forwarding cookies and `Origin` unchanged. Confirm the backend `WEB_ORIGINS` includes `http://localhost:3000`. Never proxy presigned storage URLs.
- [ ] **0.2 Generated types.** Add `openapi-typescript` as a dev dependency. Commit a downloaded `src/lib/api/openapi.json` (the schema holds no secrets) and generated `src/lib/api/schema.d.ts`. Add `npm run api:types` to regenerate from the committed file. Never fetch the schema at runtime or embed docs credentials. Document the manual download step in `docs/api-integration-plan.md` § Maintenance.
- [ ] **0.3 `apiFetch` + `ApiError`** (`src/lib/api/client.ts`). Use the JSON body, `credentials: 'include'`, and the `Idempotency-Key` header. `ApiError` carries `status`, `code`, `requestId` and `retryAfterSeconds`. Branch only on `code`.
- [ ] **0.4 Retry policy.** Retry `429` and retryable `503` after `Retry-After` with the identical request and key, capped at 5 attempts with exponential backoff. Never auto-retry `400/401/403/404/422`. Handle `409` per code at the call site.
- [ ] **0.5 Session handling.** Any `401` stops background work, keeps unsynced edits, and routes to `/auth?next=<current path>`. The auth screen already honours `next`.
- [ ] **0.6 Idempotency keys** (`newIdempotencyKey()` = `crypto.randomUUID()`). Use one per user action and reuse it for retries. Persist it with the pending command in IndexedDB for uploads and imports. `409 IDEMPOTENCY_KEY_REUSED` means log and stop.
- [ ] **0.7 `poll()` helper.** Start at 1 s, multiply by 1.5 up to a 5 s cap, honour `AbortSignal`, pause while `document.hidden`, and stop on unmount.
- [ ] **0.8 Error copy map** (`src/lib/api/errors.ts`). Map stable codes to friendly messages, with a copyable request ID in error toasts. Reuse the existing `--ui-danger` tokens. Never log bodies, document text, AI text, presigned URLs, OTPs, or cookies.
- [ ] **0.9 Unit test runner.** Add `vitest`. Unit-test `apiFetch` error mapping, `Retry-After` retry with key reuse, the no-retry codes, the 401 redirect, and `poll()` backoff, abort and pause.

**Done when:** a call through `/v1/*` reaches the backend with the session cookie. A forced `401` returns to sign-in and back. A `429` retries after `Retry-After` with the same key. Unit tests pass.

## Phase 1: Session and identity

- [ ] **1.1** Protected pages render only after `GET /api/auth/get-session` confirms a session. The proxy cookie check stays as the early redirect.
- [ ] **1.2** Replace the hard-coded "Iteoluwakisi" (sidebar footer, Home greeting, Settings profile) with the session user's name or email. Use the initial for the avatar.
- [ ] **1.3** Sign-out clears in-memory caches. IndexedDB pending edits are keyed by user ID and never shown to another user.

**Done when:** no hard-coded user name remains in `src/`, and signing in as a second user shows none of the first user's data.

## Phase 2: Notes and editor sync

- [ ] **2.1 Notes repository** (`src/lib/api/notes.ts`): list (cursor paging), create (with key), get, checkpoint get/put, revisions, revision get, restore, delete, transactions.
- [ ] **2.2 Remove the mock notes and the `localStorage` store** from `Workspace.tsx`. Lists come from `GET /v1/notes`, with infinite scroll that stops at `nextCursor: null`.
- [ ] **2.3 Create.** `POST /v1/notes { title }` with a key, then open the new note. The server makes the initial checkpoint; the client never invents one.
- [ ] **2.4 Open.** Render the IndexedDB cache immediately (marked syncing) while `GET /v1/notes/{id}/checkpoint` runs in parallel; the server copy wins. On `404 NOTE_NOT_FOUND`, drop the cache and show "Note not found".
- [ ] **2.5 Transaction queue** (per note, persisted in IndexedDB, behind core's `DocumentRepository`):
  - one persistent `clientId` per installation;
  - a monotonic `localSequence` per (note, client);
  - batch editor `DocumentOperation`s after 1–2 s idle or 200 operations, at most 1,000 per request;
  - persist each batch before sending, send serially per note, and drop a batch only on `201 applied`.
- [ ] **2.6 Recovery table, implemented per code.**
  - `NOTE_TRANSACTION_CONFLICT`: fetch the checkpoint, rebase by node ID, and resend with a new ID and the next sequence.
  - `TRANSACTION_ID_REUSED` or `CLIENT_SEQUENCE_*`: stop the queue and report.
  - `TRANSACTION_IN_PROGRESS` or `503 NOTE_TRANSACTION_RETRYABLE`: resend the identical payload after `Retry-After`.
  - `422 INVALID_NOTE_TRANSACTION`: mark the batch rejected and show an editor error.
- [ ] **2.7 Sync indicator** in the note top bar, replacing "Saved on this device": Saved · Saving · Offline (n pending) · Conflict. Announce changes with `aria-live`.
- [ ] **2.8 Title edits.** The backend has no title-only update. Confirm against the OpenAPI schema whether the title travels in the document (`PUT` checkpoint or a transaction). Implement it that way, or record the gap for the backend.
- [ ] **2.9 Reconnect.** Check the session, fetch the checkpoint, replay or rebase pending work, then resume.
- [ ] **2.10 History panel.** List revisions, open a read-only preview, and restore (warn before discarding local edits based on the old head).
- [ ] **2.11 Delete** with confirmation, then remove the note from lists, Spaces and AI scope pickers.
- [ ] **2.12 Apply D1** to the sidebar sections and collection views.
- [ ] **2.13 Unit tests:** the queue (persist-before-send, ack removes, each recovery code), sequence monotonicity, and a stale response never overwriting newer local content.

**Done when:** notes persist across reloads and devices. Offline edits sync on reconnect. Two tabs converge without lost text. Restore and delete behave as specified. No `localStorage` note storage remains.

## Phase 3: Assets

- [ ] **3.1 Server `AssetRepository`.** Reserve with `POST /v1/assets/uploads` + key, `PUT` each part directly to the returned URL with exactly the returned headers and no cookies (multipart concurrency 3, ETags kept), then complete. Keep the IndexedDB repository for offline previews only.
- [ ] **3.2** Client-side type and size checks for friendly errors; the server stays authoritative. Allowed types are in the schema; the limit is 250 MiB.
- [ ] **3.3** Upload progress, cancel (`DELETE /v1/assets/uploads/{id}`), and `409 UPLOAD_EXPIRED` (abort and reserve again with a new key). A reload mid-upload resumes or restarts cleanly.
- [ ] **3.4** Media nodes store `assetId` only. Fetch `GET /v1/assets/{id}/download` just before display or download, never persist the URL, and re-request after expiry.
- [ ] **3.5** On quarantine or `422 UPLOAD_VERIFICATION_FAILED`, show "This file could not be verified". On `409 ASSET_IN_USE` during delete, show "Still used in a note or the Library".

**Done when:** a 1 MB image and a 100 MB PDF upload with progress, cancel works mid-upload, and images still render after their URL expires.

## Phase 4: Library (Sources)

- [ ] **4.1** Replace the local `incantly-library` IndexedDB store in `WorkspaceLibrary.tsx` with `GET /v1/library/sources` (kind and status filters, cursor paging).
- [ ] **4.2 "Add to Library" dialog with one tab per kind:** File (PDF/text/Markdown), Audio (with the required consent checkbox), YouTube (URL plus caption file, with help explaining captions come from YouTube Studio), Web page, Paste (up to 512 KiB), and Note revision. Add an optional "Also add to Spaces" picker (up to 20). Re-adding the same Asset counts as success.
- [ ] **4.3 Processing status.** Poll `/processing` and show the stage (Queued, Fetching, Parsing, Transcribing, Normalizing), `READY`, `PARTIALLY_READY` with its `partialReason`, `FAILED` in plain words, and `QUARANTINED`. Images show "Added, not searchable". Show Retry only when `canRetry` and Cancel only when `canCancel`.
- [ ] **4.4 Source detail.** Versions, rename, a sensitivity selector (with help text: `RESTRICTED` is never sent to external AI), archive/restore, and delete (confirm that Space links and Note bindings go; the file stays).

**Done when:** every Source kind can be added, shows live progress, ends in a clear state, and can be retried, archived and deleted.

## Phase 5: Spaces

- [ ] **5.1** Spaces list with an Active/Archived filter. Create (with key); edit name, description and icon; archive/restore; delete (confirm that Notes become standalone).
- [ ] **5.2 Space page, Notes tab.** List the Space's notes, add or move a note, remove it, and set or clear the home note (active notes in the Space only).
- [ ] **5.3 Space page, Sources tab.** Link and unlink Sources, toggle "Use in AI by default", and set priority (−100 to 100).
- [ ] **5.4** An archived Space is read-only in the UI; handle `409 SPACE_NOT_ACTIVE`.
- [ ] **5.5** Sidebar: Spaces section with create and navigation, and the D1 sections if chosen.

**Done when:** a Space can be created, filled with notes and Sources, archived, restored and deleted without losing notes.

## Phase 6: Note context bindings and Context

- [ ] **6.1** "Sources for this note" panel: list, add with Latest (`TRACK_LATEST`, the default) or Pinned (a READY/PARTIALLY_READY version), and remove. Explain the difference between Latest and Pinned in the UI.
- [ ] **6.2 Searchable badge** on notes and Sources: Indexing, Keyword-ready, Ready, or Failed. Poll only while visible and building. Optional "Index now" (`POST /v1/notes/{id}/reindex`).
- [ ] **6.3** "What would the AI see?" preview (`POST /v1/context/preview`): show passages as plain text with locator links (PDF page, audio time, YouTube `t=`, note block) and the sufficiency, degraded and stale banners. `LIBRARY` scope only on explicit choice.

## Phase 7: AI agent

- [ ] **7.1 AI repository:** submit with key, job, events, citations, cancel, and allowance.
- [ ] **7.2 Entry points.** In a note: "Ask about this note" and "Quiz me" (`command: 'practice'`). In a Space: the same with `SPACE` scope. On Home: a general box (`surface: 'chat'`) with a scope picker.
- [ ] **7.3 Scope picker.** This note · This Space · Selected Sources (up to 50, only READY/PARTIALLY_READY and not archived) · Whole Library (explicit only, never the default). Always show "Searching: …" next to the input.
- [ ] **7.4 Submit.** Validate 2–2,000 characters, one key per click (network retries reuse it), and map the error codes from the guide.
- [ ] **7.5 Clarification.** On `CLARIFICATION_REQUIRED`, show the options. Resend the same text and scope with `command`, `clarified: true` and a new key.
- [ ] **7.6 `useAiJob(jobId)`.** Poll events from 1 s up to 5 s and show a status line (Starting, Searching your material, Writing, Queued, Busy). Read the job once when `done`. Persist running job IDs per user so a reload resumes them. Allow several jobs at once.
- [ ] **7.7 Results.** Render the answer as plain text or sanitized Markdown (no raw HTML, `javascript:` links, or remote images). Turn `[S1E1]` refs into numbered citation chips and leave unknown brackets as text. Practice questions get cards with "Show answer" hidden by default. Map sufficiency: `PARTIAL` shows "Partly covered by your material"; `NOT_FOUND` shows an empty state with "Add Sources" and "Search a wider scope" plus the searchable badge.
- [ ] **7.8 Citations.** On the first chip interaction, load `/citations` once and cache by ref. Show a passage hover card or side panel (plain text) with an "Open" action (note, PDF `#page=N`, audio seek, YouTube `t=`).
- [ ] **7.9 Cancel, failures and allowance.** Map every `failureCode` from the guide's table; unknown codes get a generic message with "Try again" (a new key). Show the allowance in the AI panel header when low or limited, and hide it on `503 AI_ALLOWANCE_UNAVAILABLE`.
- [ ] **7.10 Unit tests:** ref-to-chip parsing, event-to-status mapping, failure-code mapping, and job ID persistence and resume.

**Done when:**
- a question about a note returns a cited answer whose chips open the right passages;
- "Quiz me" on a Space returns questions with hidden answers;
- the clarification flow works;
- cancel, reload mid-job, `NOT_FOUND`, and the daily limit each show the right state.

## Phase 8: Imports, Inbox, Search

- [ ] **8.1 File import** (`.txt`/`.md`, at most 10 MiB): asset upload, then `POST /v1/imports/files` with a key, then poll and open `targetNoteId`. Cancel while queued, and hide Cancel once running.
- [ ] **8.2 URL import:** handle `409 REMOTE_IMPORT_UNAVAILABLE` ("URL import is not available here"), `INVALID_IMPORT_URL` and `IMPORT_URL_BLOCKED`.
- [ ] **8.3 Apply D2** to the Inbox popover and remove its mock items.
- [ ] **8.4 Apply D3** to sidebar search and ⌘K.

## Phase 9: Cross-cutting hardening

- [ ] **9.1** An offline banner. Polling pauses when hidden or offline and resumes on reconnect.
- [ ] **9.2** Every async view has loading, empty, error and retry states.
- [ ] **9.3** `aria-live` announcements for uploads, processing, sync and AI jobs. Citation chips and "Show answer" work by keyboard.
- [ ] **9.4** Security sweep: no tokens, presigned URLs or document/AI text in storage, URLs, logs or analytics. All server text is rendered as text or validated nodes.
- [ ] **9.5** Responsive check of every new view at 320, 375, 768, 1024 and 1440px (no horizontal scroll, touch targets of 44px or more, safe areas).
- [ ] **9.6** Update `docs/authentication.md` and this plan's statuses. Add a "Maintenance" note: regenerate types when the backend changes.

## Deferred until the product owner asks

- [~] **E2E tests** for the integration flows: note sync, uploads, Sources, Spaces, AI ask → events → result → citations, clarification, and cancel. These run against a local backend with `AI_ENABLED_PROVIDERS=fake`, and `[[fake:UNAVAILABLE]]` / `[[fake:REFUSAL]]` cover failure injection. **Instruction (2026-10-20): do not write or run E2E tests until told.**

---

## Exit criteria (all must hold before this work is called finished)

1. Every to-do in Phases 0–9 is `[x]`, or `[~]` with the user's instruction recorded. No `[ ]` remains.
2. D1, D2 and D3 are answered, and the answers are recorded here.
3. Every implemented `/v1` operation in the OpenAPI schema (58, excluding the two health probes) is called by a shipped UI path or the repository layer, or is listed below as intentionally unused with a reason.
4. No mock or `localStorage`/local-IndexedDB-only data backs Notes, the Library or the Inbox. IndexedDB is used only as a cache or pending-operation queue.
5. No hard-coded user identity in `src/`.
6. `npx tsc --noEmit`, `npm run lint` and the unit tests (`vitest`) all pass. Generated API types match the committed `openapi.json`.
7. No secret (docs password, `AUTH_PROXY_SECRET`, tokens) is in the repo, client bundle, URLs or logs. Verify with a grep over `src/`, `.next/static` and `docs/`.
8. Manual verification against the local backend: sign in, create and edit a note, reload, then see it persist; add a Source and watch it reach READY; create a Space with that note and Source; ask the agent and open a citation. Record the results here with request IDs for any failure.
9. Each new view has passed the responsive check (9.5).
10. E2E tests remain deferred unless the user has asked for them. If asked, they are written and passing.

### Intentionally unused operations

Fill in during the work, one line each with a reason. Example: `GET /v1/health/*`: infrastructure probes, the UI must not poll them.
