# Backend API integration plan

Connect the web app to the Incantly backend for **Spaces, Notes, Note context, Library, Context, Imports and Assets**, and redesign the workspace UI around them.

## Sources of truth

| Document | Use it for |
| --- | --- |
| [frontend-api-integration.md](frontend-api-integration.md) | The endpoint contract: journeys, error codes, retry and idempotency rules (a copy of the backend guide) |
| `http://localhost:3002/v1/docs` (JSON at `/v1/docs/openapi.json`) | Exact request and response schemas. Credentials live only in the backend `.env`; never put them in this repo, browser code, URLs or logs |
| `incantly-backend/docs/spaces-and-library-implementation.md` | What Spaces, Library, Sources, links and bindings mean, plus their lifecycle rules |
| `incantly-backend/docs/spaces-context-artifacts-and-model-routing.md` § "Product vocabulary", "Context scopes" | Product model: what a Space is and is not, evidence priority |
| `incantly-backend/docs/notes-storage-sync-and-imports.md` | Note sync, conflict and upload invariants |
| `incantly-backend/docs/frontend-implementation-plan.md` | The backend team's frontend checklist (this plan supersedes it for this repo) |

Rules for every to-do: `AGENTS.md` (finish every to-do; no E2E tests or screenshots until asked), `docs/design-system.md`, the responsive rules, and the document skills (`document-schema`, `document-validation`, `document-storage`, `tiptap-adapter`).

Status key: `[ ]` open · `[x]` done · `[~]` deferred by an explicit user instruction (cite it).

---

## Product decisions (answered 2026-10-20)

- **D1. Papers and Journals are removed.** The backend Note has no type. Notes are organised by **Spaces**: the user creates a Space (a course, topic, project or research area), puts Notes in it, and links Library Sources to it.
- **D2. The Inbox is out of scope.** The backend has no notifications. Leave the current Inbox popover as-is: no new work, no new endpoints.
- **D3. Scope** is Spaces, Notes, Note context (bindings), Context (index status and evidence preview), Library, Imports and Assets.
- **D4. UI will be redesigned to look clean.** Layout and icons change as part of this work, following `docs/design-system.md` tokens.

## The product model

Read this first; the UI must follow it.

```text
User
|- Library            reusable catalog of Sources (PDF, text, audio, YouTube captions, web page, pasted text, Note revision)
|- Notes              editable, versioned documents; a Note may be standalone
`- Spaces             a bounded course / topic / project / research area
   |- Notes           each Note has at most ONE primary Space (or none)
   |- linked Sources  references to Library Sources, never copies; can be "used by default"
   `- home Note       optional landing Note for the Space
```

- **A Space is not a folder, a tenant or a copy of the Library.** Linking a Source to a Space adds a reference. Moving a Note between Spaces never creates a revision.
- **A Source is evidence, not an editable Note.** Uploading a PDF does not make it a Note. "Import as editable Note" is a separate action (Imports).
- **One uploaded file supports three choices** (backend design): *Display in Note* (asset node), *Add to Library / Space* (Source), or *Import as editable Note* (text and Markdown only).
- **Note context bindings** tell the system which Sources matter for a specific Note. Types: `PINNED` (included first), `AVAILABLE` (used when relevant), `RELATED` (shown, not searched), `GENERATED_FROM` (provenance). Revision policy: `TRACK_LATEST` (default) or `PINNED_VERSION`.
- **Folders:** the backend describes folders as optional presentation metadata. **There is no Folder API.** See gap G3.

## Backend gaps found while planning

Raise these with the backend owner. The workaround is what this plan builds until each gap is closed.

| # | Gap | Effect on the UI | Workaround in this plan |
| --- | --- | --- | --- |
| G1 | `NoteDto` has no `spaceId`, and `GET /v1/notes` has no Space or standalone filter | Cannot cheaply show "Unsorted notes" or label a note with its Space | Space pages use `GET /v1/spaces/{id}/notes`. "All notes" lists everything without Space labels. The open note shows its Space only when entered from that Space. Ask the backend to add `spaceId` to `NoteDto` and `?spaceId=` / `?standalone=true` |
| G2 | No note rename endpoint; title follows `document.metadata.title`, and no typed operation sets metadata | Renaming needs a full save | Rename = `PUT /v1/notes/{id}/checkpoint` with the updated `metadata.title` and `baseRevisionNumber`; handle `409 STALE_NOTE_REVISION`. Ask for a `setTitle` operation or `PATCH /v1/notes/{id}` |
| G3 | No Folder API | Folders inside Spaces cannot be stored | Do not build folders (client-only folders would not persist or sync). Ask the backend for folder metadata if folders are wanted |
| G4 | No search endpoint | — | Title filter over the loaded Notes, Spaces and Sources lists |

---

## Starting point (verified 2026-10-20)

| Area | Today | Change |
| --- | --- | --- |
| Proxy | `next.config.ts` rewrites only `/api/auth/*`; `server.mjs` signs auth | Add `/v1/*` |
| Notes | 4 mock notes in `localStorage` (`incantly-workspace-notes-v1`) in `Workspace.tsx` | Server Notes |
| Note kinds | Papers / Journals / Notes sidebar sections | Remove (D1) |
| Editor | `DocumentEditor` emits canonical `DocumentOperation`s (`transactionMapping.ts`); `useDocumentAutosave` | Feed the server transaction queue |
| Assets | `IndexedDbAssetRepository`, `useAssetUploads` (local) | Server upload repository |
| Library | `WorkspaceLibrary.tsx` with a local IndexedDB DB `incantly-library` | Server Sources |
| Spaces | None | New |
| Inbox | Mock popover | Unchanged (D2) |
| Identity | "Iteoluwakisi" hard-coded in the sidebar, Home and Settings | Session user |
| Tests | Playwright only; no unit runner; no generated API types | Add vitest + generated types |

---

## Phase 0: Foundation (API client)

- [ ] **0.1 Same-origin proxy.** Add a `next.config.ts` rewrite from `/v1/:path*` to `AUTH_BACKEND_URL`, forwarding cookies and `Origin` unchanged. Confirm the backend `WEB_ORIGINS` includes `http://localhost:3000`. Presigned storage URLs are never proxied.
- [ ] **0.2 Generated types.** Add the `openapi-typescript` dev dependency. Commit `src/lib/api/openapi.json` (no secrets inside) and the generated `src/lib/api/schema.d.ts`. Add an `npm run api:types` script. Never fetch the schema at runtime or embed docs credentials.
- [ ] **0.3 `apiFetch` + `ApiError`** (`src/lib/api/client.ts`). Use the JSON body, `credentials: 'include'` and the `Idempotency-Key` header. `ApiError` carries `status`, `code`, `requestId` and `retryAfterSeconds`. Branch only on `code`.
- [ ] **0.4 Retries.** Retry `429` and retryable `503` after `Retry-After` with the identical request and key, capped at 5 attempts with exponential backoff. Never retry `400/401/403/404/422`. Handle `409` per code at the call site.
- [ ] **0.5 Session.** A `401` stops background work, keeps unsynced edits, and sends the user to `/auth?next=<path>`.
- [ ] **0.6 Idempotency.** `newIdempotencyKey()` uses `crypto.randomUUID()`: one per user action, reused for that action's retries. It is persisted with pending uploads and imports in IndexedDB. `409 IDEMPOTENCY_KEY_REUSED` means log and stop.
- [ ] **0.7 `poll()`.** 1 s growing by 1.5× to a 5 s cap, honours `AbortSignal`, pauses while the tab is hidden, stops on unmount.
- [ ] **0.8 Error copy** (`src/lib/api/errors.ts`). Map stable codes to friendly text. Error toasts carry a copyable request ID and use the `--ui-danger` tokens. Never log bodies, document text, presigned URLs or cookies.
- [ ] **0.9 Data layer.** One cache and mutation pattern for lists, details and invalidation (e.g. a small store or `useSyncExternalStore`-based hooks). Decide and document it in this plan before Phase 2.
- [ ] **0.10 Unit tests (vitest).** Cover error mapping, retry with key reuse, codes that must not retry, the 401 redirect, and `poll()` backoff, abort and pause.

**Done when:** a `/v1` call reaches the backend with the session cookie; a forced `401` returns to sign-in and back; a `429` retries after `Retry-After` with the same key; unit tests pass.

## Phase 1: Session and identity

- [ ] **1.1** Protected pages render only after `GET /api/auth/get-session` confirms a session (the proxy cookie check stays as the early redirect).
- [ ] **1.2** Replace the hard-coded name in the sidebar footer, Home greeting and Settings with the session user's name or email. Use the initial in the avatar.
- [ ] **1.3** Sign-out clears in-memory caches. IndexedDB queues are keyed by user ID and never shown to another user.

**Done when:** no hard-coded identity remains in `src/`; a second user sees none of the first user's data.

## Phase 2: UI redesign (information architecture)

Build the shell the later phases fill. Use clean layouts, consistent icons, design-system tokens, and mobile-first responsive design.

- [ ] **2.1 Sidebar.** Search · Home · **Library** · **Spaces** (the user's Spaces, a "New Space" button, Active/Archived toggle) · **Notes** (recent notes, "New note") · Settings. Remove the Papers/Journals sections and their `NoteKind` type. Keep the collapsible rail behaviour.
- [ ] **2.2 Icons.** Add the missing icons (Space, Source kinds: PDF/file, audio, YouTube, web, pasted text, note revision; status: processing, ready, failed; archive, restore, link, unlink, pin, import, upload) to `AppIcon`, sharing one stroke style.
- [ ] **2.3 Space page.** A header with icon, name, description and actions (edit, archive/restore, delete); tabs **Notes** · **Sources**; a home Note shown first when set.
- [ ] **2.4 Note page.** Editor plus a collapsible right **Context panel** ("Sources for this note", searchable badge, "What would the AI see?" preview). Breadcrumb `Space › Note` when opened from a Space.
- [ ] **2.5 Library page.** Kind and status filters, a list or grid of Sources with status chips, "Add to Library", and a Source detail drawer.
- [ ] **2.6 New menu.** One "New" entry offering New note · New Space · Add to Library · Import file as note · Import from URL.
- [ ] **2.7** Every view has loading (skeleton), empty, error-with-retry and offline states.
- [ ] **2.8** Every new view passes 320, 375, 768, 1024 and 1440 with no horizontal scroll, 44px targets and safe areas. Verify with DOM assertions or manually (no screenshots per `AGENTS.md`).

## Phase 3: Notes and editor sync

- [ ] **3.1 Notes repository** (`src/lib/api/notes.ts`): list (cursor paging), create (with key), get, checkpoint get/put, revisions, revision get, restore, delete, transactions.
- [ ] **3.2 Remove the mock notes and `localStorage` store.** "All notes" uses `GET /v1/notes` with infinite scroll that stops at `nextCursor: null`.
- [ ] **3.3 Create.** `POST /v1/notes { title }` with a key, then open the note. When created inside a Space, follow with `PUT /v1/spaces/{id}/notes/{noteId}`.
- [ ] **3.4 Open.** Show the IndexedDB cache immediately (marked syncing) while `GET /v1/notes/{id}/checkpoint` loads in parallel; the server wins. On `404 NOTE_NOT_FOUND`, drop the cache and show "Note not found".
- [ ] **3.5 Transaction queue** (per note, in IndexedDB, behind core's `DocumentRepository`):
  - one persistent `clientId`;
  - a monotonic `localSequence` per (note, client);
  - batch `DocumentOperation`s after 1–2 s idle or 200 operations, at most 1,000 per request;
  - persist before sending, send serially per note, drop only on `201 applied`.
- [ ] **3.6 Recovery by code.**
  - `NOTE_TRANSACTION_CONFLICT`: fetch the checkpoint, rebase by node ID, resend with a new ID and the next sequence.
  - `TRANSACTION_ID_REUSED` or `CLIENT_SEQUENCE_*`: stop the queue and report.
  - `TRANSACTION_IN_PROGRESS` or `503 NOTE_TRANSACTION_RETRYABLE`: resend the identical payload after `Retry-After`.
  - `422 INVALID_NOTE_TRANSACTION`: mark the batch rejected and show an editor error.
- [ ] **3.7 Sync indicator** replacing "Saved on this device": Saved · Saving · Offline (n pending) · Conflict, announced with `aria-live`.
- [ ] **3.8 Rename (G2).** Flush the queue, then `PUT` the checkpoint with the new `metadata.title`. On `409 STALE_NOTE_REVISION`, refetch and retry once, never overwriting newer content.
- [ ] **3.9 Reconnect.** Check the session, fetch the checkpoint, replay or rebase pending work, resume.
- [ ] **3.10 History.** List revisions, open a read-only preview, restore (warn before discarding local edits based on the old head).
- [ ] **3.11 Delete.** Confirm, `DELETE`, then remove the note from lists, Space pages and the home Note.
- [ ] **3.12 Unit tests:** persist-before-send, ack removal, each recovery code, sequence monotonicity, a stale response never overwriting newer content.

**Done when:** notes persist across reloads; offline edits sync on reconnect; two tabs converge without lost text; rename, restore and delete work; no `localStorage` note storage remains.

## Phase 4: Assets

- [ ] **4.1 Server `AssetRepository`.** Reserve with `POST /v1/assets/uploads` + key. `PUT` each part directly to the returned URL with exactly the returned headers and no cookies (multipart concurrency 3, keep ETags). Then complete. The IndexedDB asset store stays only as an offline preview cache.
- [ ] **4.2** Client-side type and size checks (types from the schema, 250 MiB limit) for friendly errors; the server decides.
- [ ] **4.3** Progress, cancel (`DELETE /v1/assets/uploads/{id}`), and `409 UPLOAD_EXPIRED` (abort, reserve again with a new key). A reload mid-upload resumes or restarts cleanly.
- [ ] **4.4** Media nodes store `assetId` only. Call `GET /v1/assets/{id}/download` just before display or download; never persist the URL; re-request after expiry.
- [ ] **4.5** Quarantine or `422 UPLOAD_VERIFICATION_FAILED` shows "This file could not be verified". `409 ASSET_IN_USE` on delete shows "Still used in a note or the Library".
- [ ] **4.6 Post-upload choice.** After an upload in the editor, offer "Also add to Library" (creates a `FILE` / `AUDIO_TRANSCRIPT` Source from the same `assetId`, no second upload).

**Done when:** a 1 MB image and a 100 MB PDF upload with progress; cancel works mid-upload; images still render after URL expiry; one uploaded PDF can be in a Note and in the Library without uploading twice.

## Phase 5: Library (Sources)

- [ ] **5.1** Replace `WorkspaceLibrary.tsx`'s local IndexedDB with `GET /v1/library/sources` (kind and status filters, cursor paging).
- [ ] **5.2 "Add to Library" dialog, one tab per kind:**
  - File: PDF, text, Markdown.
  - Audio: with the required consent checkbox "I have permission to record and transcribe this audio".
  - YouTube: URL plus a `.vtt`/`.srt` caption file, with help saying captions come from YouTube Studio and the app never scrapes YouTube.
  - Web page: `409 REMOTE_IMPORT_UNAVAILABLE` shows "Web pages aren't available here yet".
  - Paste: at most 512 KiB.
  - Note revision: pick a Note; uses its `currentRevisionId`.
  - Plus optional title, sensitivity, and "Also add to Spaces" (up to 20). Re-adding the same Asset or revision returns the existing Source; treat it as success.
- [ ] **5.3 Processing.** Poll `/processing` and show the stage (Validating, Queued, Fetching, Parsing, Transcribing, Normalizing) and the states:
  - `READY`;
  - `PARTIALLY_READY` with its `partialReason` in words;
  - `FAILED` with its `failureCode` in words;
  - `QUARANTINED`, not retryable;
  - images (`AWAITING_PROCESSOR`) show "Added, not searchable".

  Show Retry only when `canRetry` and Cancel only when `canCancel`; handle `409 NOTHING_TO_RETRY` and `NOT_CANCELLABLE`.
- [ ] **5.4 Source detail drawer.** Versions (up to 25), provenance (pages parsed, duration, host, untrusted `documentTitle` as text), rename, sensitivity with help ("Restricted material is never sent to external AI"), archive/restore, delete (confirm: removes its Space links and Note bindings; the file stays), and "Open file" via the asset download.
- [ ] **5.5** Show where a Source is used: Spaces it's linked to, from the Space pages' data when available.

**Done when:** every Source kind can be added, shows live progress, ends in a clear state, and can be retried, cancelled, renamed, archived, restored and deleted.

## Phase 6: Spaces

- [ ] **6.1** Spaces list in the sidebar and a Spaces overview: Active/Archived filter (`status`), create (name ≤ 120, description ≤ 1000, icon ≤ 64 characters, e.g. an emoji or icon key) with a key, and edit through `PATCH` (an empty description or icon clears it).
- [ ] **6.2 Notes tab.** `GET /v1/spaces/{id}/notes` (paged). Add an existing note or move it from another Space (`PUT`), remove it to make it standalone (`DELETE`), create a note directly in the Space (3.3).
- [ ] **6.3 Home Note.** Set it (`PUT .../home-note/{noteId}`, active notes in this Space only) and clear it (`DELETE .../home-note`). Show it first on the Space page.
- [ ] **6.4 Sources tab.** List linked Sources; link from the Library picker (`PUT`, where `created: false` means already linked); toggle "Use by default" (`enabledByDefault`); priority (−100 to 100, as Low/Normal/High presets with the exact value behind them); unlink (`DELETE`, keeps the Source). The 200-link cap is shown when reached.
- [ ] **6.5 Lifecycle.** Archive/restore, where an archived Space is read-only (actions hidden; `409 SPACE_NOT_ACTIVE` handled). Delete with confirmation "Notes become standalone; nothing else is deleted". Handle `409 SPACE_RETENTION_HOLD`.

**Done when:** a Space can be created, given notes and Sources, a home note set, archived, restored and deleted without losing notes or Sources.

## Phase 7: Note context (bindings)

- [ ] **7.1 Context panel list:** `GET /v1/notes/{id}/context-bindings` (up to 50), showing each Source with kind, status and binding type.
- [ ] **7.2 Add a Source to this note:** a picker from the Library or the note's Space Sources, then `PUT .../context-bindings/{sourceId}` with type (default `AVAILABLE`; "Always include" = `PINNED`; "Show only" = `RELATED`) and revision policy (default `TRACK_LATEST`; "Keep this version" = `PINNED_VERSION` with a READY/PARTIALLY_READY `pinnedSourceVersionId`).
- [ ] **7.3** Change the type or policy (the same `PUT` replaces it) and remove it (`DELETE`).
- [ ] **7.4** Plain-language explanations of Latest vs Pinned version and of the binding types, shown as help text.
- [ ] **7.5** Archived or deleted Sources disappear from pickers; a binding to a Source that is no longer usable shows a warning.

## Phase 8: Context (index status and evidence preview)

- [ ] **8.1 Searchable badge** on notes (`GET /v1/notes/{id}/index-status`) and Sources (`GET /v1/library/sources/{id}/index-status`): Indexing (`building`), Keyword-ready (`lexicalReady`), Ready (`vectorReady`), Failed (`failureCode`). Poll only while visible and building.
- [ ] **8.2 "Index now"** on a note (`POST /v1/notes/{id}/reindex`, `202`; rate limited, shown in the Context panel only).
- [ ] **8.3 "What would the AI see?" preview** (`POST /v1/context/preview`):
  - a query box and scope (This note, This selection, This Space with an include-notes toggle, Selected Sources, Custom, and Library only on explicit choice);
  - passages as plain text with locator links (PDF `#page=N` via asset download, audio seek, YouTube `t=`, note block scroll);
  - `sufficiency`, `degraded`, `stale` and `sensitivity` banners, with `NOT_FOUND` shown honestly;
  - `429` respects `Retry-After`.

## Phase 9: Imports

- [ ] **9.1 Import file as note:** a `.txt`/`.md` file (at most 10 MiB) goes through Phase 4 upload, then `POST /v1/imports/files { sourceAssetId, targetNoteId? }` with a key. Poll `GET /v1/imports/{id}` until `completed` (open `targetNoteId`), `failed` (show `errorCode` in words) or `cancelled`. Offer it both as "new note" and "into this note".
- [ ] **9.2 Import from URL:** `POST /v1/imports/urls`. `409 REMOTE_IMPORT_UNAVAILABLE` shows "URL import isn't available here yet"; also handle `INVALID_IMPORT_URL` and `IMPORT_URL_BLOCKED`.
- [ ] **9.3** Cancel while queued (`DELETE`); hide Cancel once `running` (`409 IMPORT_NOT_CANCELLABLE`). Import IDs are persisted so a reload resumes polling.

## Phase 10: Hardening

- [ ] **10.1** An offline banner; polling pauses when hidden or offline and resumes on reconnect.
- [ ] **10.2** `aria-live` for uploads, processing, sync and imports. All dialogs, drawers and tabs work by keyboard with focus return.
- [ ] **10.3** Security sweep: no tokens, presigned URLs or document text in storage, URLs, logs or analytics. All server text (titles, filenames, passages, `documentTitle`) is rendered as text.
- [ ] **10.4** Update `docs/authentication.md`, this plan's statuses, and a Maintenance note (regenerate types when the backend changes; re-copy `frontend-api-integration.md`).

## Deferred until the product owner asks

- [~] **E2E tests** for these flows. `AGENTS.md` (2026-10-20): do not write or run E2E tests until told.
- [~] **AI agent** (`/v1/ai/*`: ask, quiz, jobs, citations, allowance). Named in the first request but not in the scope confirmed on 2026-10-20. Planned separately when asked.
- [~] **Inbox / notifications.** No backend support (D2).

---

## Exit criteria (all must hold before this work is finished)

1. Every to-do in Phases 0–10 is `[x]`, or `[~]` with the user's instruction cited. No `[ ]` remains.
2. Every in-scope `/v1` operation is called by a shipped UI path:
   - Notes (10), Spaces (16), Library (10 including processing, retry and cancel), bindings (3), Context (4), Assets (5) and Imports (4): **52 operations**;
   - the remaining 8 are listed below as intentionally unused, with reasons.
3. No mock, `localStorage` or local-only IndexedDB data backs Notes, Spaces or the Library. IndexedDB is only a cache or pending-operation queue.
4. Papers/Journals are gone, and no hard-coded user identity remains in `src/`.
5. `npx tsc --noEmit`, `npm run lint` and the vitest unit tests pass. Generated types match the committed `openapi.json`.
6. No secret (docs password, `AUTH_PROXY_SECRET`, tokens) is in the repo, client bundle, URLs or logs. Checked with a grep over `src/`, `docs/` and `.next/static`.
7. Manual walkthrough against the local backend passes, with results and request IDs for any failure recorded here:
   - sign in, create a Space, create a note in it, edit, reload: it persists;
   - rename the note;
   - upload a PDF into the note and add it to the Library: it reaches READY or a clear state;
   - link it to the Space and bind it to the note;
   - preview context for a question;
   - import a Markdown file as a note;
   - archive and restore the Space;
   - delete the note.
8. Gaps G1–G4 are raised with the backend owner, and each workaround is in place.
9. Every new view passes the responsive check (2.8).

### Intentionally unused operations

- `GET /v1/health/live`, `GET /v1/health/ready`: infrastructure probes; the UI must not poll them.
- `POST /v1/ai/requests`, `GET /v1/ai/jobs/{id}`, `GET /v1/ai/jobs/{id}/events`, `GET /v1/ai/jobs/{id}/citations`, `POST /v1/ai/jobs/{id}/cancel`, `GET /v1/ai/allowance`: AI agent deferred (see above).
- (Remove the AI entries from this list if the AI agent is brought into scope.)
