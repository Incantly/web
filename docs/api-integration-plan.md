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
| G1 | `NoteDto` has no `spaceId`, and `GET /v1/notes` has no Space or standalone filter | Cannot cheaply show "Unsorted notes" or label a note with its Space | **Built in Phase 6:** Space pages use `GET /v1/spaces/{id}/notes`. "All notes" lists everything without Space labels. The open note shows its Space only when entered from that Space. Ask the backend to add `spaceId` to `NoteDto` and `?spaceId=` / `?standalone=true` |
| G2 | No note rename endpoint; title follows `document.metadata.title`, and no typed operation sets metadata | Renaming needs a full save | Rename = `PUT /v1/notes/{id}/checkpoint` with the updated `metadata.title` and `baseRevisionNumber`; handle `409 STALE_NOTE_REVISION`. Ask for a `setTitle` operation or `PATCH /v1/notes/{id}` |
| G3 | No Folder API | Folders inside Spaces cannot be stored | Do not build folders (client-only folders would not persist or sync). Ask the backend for folder metadata if folders are wanted |
| G4 | No search endpoint | — | **Built in Phase 8:** titles filter as you type over the loaded lists; Enter runs a content search through `POST /v1/context/preview` (LIBRARY, or one Space), which returns cited passages rather than a ranked list of documents. A dedicated search endpoint would still help (document-level results, paging, no evidence manifest per search) |
| G6 | File import keeps Markdown syntax as plain text (`# Heading` stays literal) and starts the note with empty paragraphs | A Markdown import doesn't look like the file | Shown as imported. Ask the backend to parse Markdown into headings and lists, and to skip leading blank paragraphs |
| G5 | Upload verification compares size, the declared `Content-Type` and the checksum, but never the bytes themselves | A text file named `fake.png` with type `image/png` becomes a READY image asset | The editor shows "This image couldn’t be loaded" with Retry when such a file fails to render. Ask the backend to sniff file signatures (magic bytes) before marking an asset READY |

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

- [x] **0.1 Same-origin proxy.** Add a `next.config.ts` rewrite from `/v1/:path*` to `AUTH_BACKEND_URL`, forwarding cookies and `Origin` unchanged. Confirm the backend `WEB_ORIGINS` includes `http://localhost:3000`. Presigned storage URLs are never proxied.
- [x] **0.2 Generated types.** Add the `openapi-typescript` dev dependency. Commit `src/lib/api/openapi.json` (no secrets inside) and the generated `src/lib/api/schema.d.ts`. Add an `npm run api:types` script. Never fetch the schema at runtime or embed docs credentials.
- [x] **0.3 `apiFetch` + `ApiError`** (`src/lib/api/client.ts`). Use the JSON body, `credentials: 'include'` and the `Idempotency-Key` header. `ApiError` carries `status`, `code`, `requestId` and `retryAfterSeconds`. Branch only on `code`.
- [x] **0.4 Retries.** Retry `429` and retryable `503` after `Retry-After` with the identical request and key, capped at 5 attempts with exponential backoff. Never retry `400/401/403/404/422`. Handle `409` per code at the call site.
- [x] **0.5 Session.** A `401` stops background work, keeps unsynced edits, and sends the user to `/auth?next=<path>`.
- [x] **0.6 Idempotency.** `newIdempotencyKey()` uses `crypto.randomUUID()`: one per user action, reused for that action's retries. It is persisted with pending uploads and imports in IndexedDB. `409 IDEMPOTENCY_KEY_REUSED` means log and stop.
- [x] **0.7 `poll()`.** 1 s growing by 1.5× to a 5 s cap, honours `AbortSignal`, pauses while the tab is hidden, stops on unmount.
- [x] **0.8 Error copy** (`src/lib/api/errors.ts`). Map stable codes to friendly text. Error toasts carry a copyable request ID and use the `--ui-danger` tokens. Never log bodies, document text, presigned URLs or cookies.
- [x] **0.9 Data layer.** One cache and mutation pattern for lists, details and invalidation. **Decision:** TanStack Query v5 (`AppProviders.tsx`), chosen for cursor-paged infinite lists, request de-duplication and mutation invalidation. Its own retries are off because `apiFetch` owns retry policy. Errors toast through `ApiErrorToaster` unless a query or mutation sets `meta: { silentErrors: true }` and renders its own error state.
- [x] **0.10 Unit tests (vitest).** Cover error mapping, retry with key reuse, codes that must not retry, the 401 redirect, and `poll()` backoff, abort and pause.

**Implemented:** `src/lib/api/{client,errors,diagnostics,idempotency,poll,types}.ts`, generated `schema.d.ts` from the committed `openapi.json` (`npm run api:fetch` with docs credentials from the environment, then `npm run api:types`), `AppProviders` + `ApiErrorToaster` around `Workspace`, the `/v1/:path*` rewrite, and 26 vitest unit tests (`npm test`).

**Done when:** a `/v1` call reaches the backend with the session cookie; a forced `401` returns to sign-in and back; a `429` retries after `Retry-After` with the same key; unit tests pass.

## Phase 1: Session and identity

- [x] **1.1** Protected pages render only after `GET /api/auth/get-session` confirms a session (the proxy cookie check stays as the early redirect).
- [x] **1.2** Replace the hard-coded name in the sidebar footer, Home greeting and Settings with the session user's name or email. Use the initial in the avatar.
- [x] **1.3** Sign-out clears in-memory caches. IndexedDB queues are keyed by user ID and never shown to another user.

**Implemented:** `SessionGate` (loading, retry-on-error, redirect to `/auth?next=` when signed out) + `useCurrentUser()` around `Workspace`; `src/lib/identity.ts` (display name, first name, initial, time-of-day greeting) with unit tests; sign-out does a full reload so no in-memory data survives; the interim local notes (`localStorage`) and local Library (IndexedDB) are keyed by user ID until Phases 3 and 5 replace them. The editor's local asset cache is shared until Phase 4 replaces it with server assets; asset IDs are only reachable through a user's own notes.

**Done when:** no hard-coded identity remains in `src/`; a second user sees none of the first user's data.

## Phase 2: UI redesign (information architecture)

Build the shell the later phases fill. Use clean layouts, consistent icons, design-system tokens, and mobile-first responsive design.

- [x] **2.1 Sidebar.** _(Updated to the owner's mockup: collapsible "Spaces ⌄" with + New Space and cube icons, and "My Library ⌄" listing sources with type icons.)_ Search · Home · **Library** · **Spaces** (the user's Spaces, a "New Space" button, Active/Archived toggle) · **Notes** (recent notes, "New note") · Settings. Remove the Papers/Journals sections and their `NoteKind` type. Keep the collapsible rail behaviour.
- [x] **2.2 Icons.** Add the missing icons (Space, Source kinds: PDF/file, audio, YouTube, web, pasted text, note revision; status: processing, ready, failed; archive, restore, link, unlink, pin, import, upload) to `AppIcon`, sharing one stroke style.
- [x] **2.3 Space page.** A header with icon, name, description and actions (edit, archive/restore, delete); tabs **Notes** · **Sources**; a home Note shown first when set.
- [x] **2.4 Note page.** Editor plus a collapsible right **Context panel** ("Sources for this note", searchable badge, "What would the AI see?" preview). Breadcrumb `Space › Note` when opened from a Space.
- [x] **2.5 Library page.** Kind and status filters, a list or grid of Sources with status chips, "Add to Library", and a Source detail drawer.
- [x] **2.6 New menu.** One "New" entry offering New note · New Space · Add to Library · Import file as note · Import from URL.
- [x] **2.7** Every view has loading (skeleton), empty, error-with-retry and offline states. _(Empty, offline and not-found states are live. `ListSkeleton` and `ErrorState` are built and attach to each list as it moves to server data in Phases 3–6.)_
- [x] **2.8** Every new view passes 320, 375, 768, 1024 and 1440 with no horizontal scroll, 44px targets and safe areas. _(Verified 2026-10-20 while signed in to the local backend: 15 screens × 5 widths, measured in the DOM, with no page overflow, no clipped controls and no target under 44px. Fixes made: 44px section headers, filter chips, priority select, title and search fields; long Space names truncate in cards; the action menu stays on screen at 320px.)_

**Implemented:** `src/components/product/workspace/` (`Sidebar`, `SpaceViews`, `LibraryView`, `NoteView` with Context panel, `views` for Home/Notes/Search/Settings, `dialogs`, shared `ui` primitives built on native `<dialog>`, `model` types from the OpenAPI schema, `sourceInput` validation with unit tests). Spaces and Library run on an in-memory `usePreviewStore` until Phases 5–6; notes stay local until Phase 3. The old local folders/files `WorkspaceLibrary` is removed.

## Phase 3: Notes and editor sync

- [x] **3.1 Notes repository** (`src/lib/api/notes.ts`): list (cursor paging), create (with key), get, checkpoint get/put, revisions, revision get, restore, delete, transactions.
- [x] **3.2 Remove the mock notes and `localStorage` store.** "All notes" uses `GET /v1/notes` with infinite scroll that stops at `nextCursor: null`.
- [x] **3.3 Create.** `POST /v1/notes { title }` with a key, then open the note. When created inside a Space, follow with `PUT /v1/spaces/{id}/notes/{noteId}`.
- [x] **3.4 Open.** Show the IndexedDB cache immediately (marked syncing) while `GET /v1/notes/{id}/checkpoint` loads in parallel; the server wins. On `404 NOTE_NOT_FOUND`, drop the cache and show "Note not found".
- [x] **3.5 Transaction queue** (per note, in IndexedDB, behind core's `DocumentRepository`):
  - one persistent `clientId`;
  - a monotonic `localSequence` per (note, client);
  - batch `DocumentOperation`s after 1–2 s idle or 200 operations, at most 1,000 per request;
  - persist before sending, send serially per note, drop only on `201 applied`.
- [x] **3.6 Recovery by code.**
  - `NOTE_TRANSACTION_CONFLICT`: fetch the checkpoint, rebase by node ID, resend with a new ID and the next sequence.
  - `TRANSACTION_ID_REUSED` or `CLIENT_SEQUENCE_*`: stop the queue and report.
  - `TRANSACTION_IN_PROGRESS` or `503 NOTE_TRANSACTION_RETRYABLE`: resend the identical payload after `Retry-After`.
  - `422 INVALID_NOTE_TRANSACTION`: mark the batch rejected and show an editor error.
- [x] **3.7 Sync indicator** replacing "Saved on this device": Saved · Saving · Offline (n pending) · Conflict, announced with `aria-live`.
- [x] **3.8 Rename (G2).** Flush the queue, then `PUT` the checkpoint with the new `metadata.title`. On `409 STALE_NOTE_REVISION`, refetch and retry once, never overwriting newer content.
- [x] **3.9 Reconnect.** Check the session, fetch the checkpoint, replay or rebase pending work, resume.
- [x] **3.10 History.** List revisions, open a read-only preview, restore (warn before discarding local edits based on the old head).
- [x] **3.11 Delete.** Confirm, `DELETE`, then remove the note from lists, Space pages and the home Note.
- [x] **3.12 Unit tests:** persist-before-send, ack removal, each recovery code, sequence monotonicity, a stale response never overwriting newer content.

**Done when:** notes persist across reloads; offline edits sync on reconnect; two tabs converge without lost text; rename, restore and delete work; no `localStorage` note storage remains.

**Implemented:** `src/lib/api/notes.ts`, `src/lib/notes/{documentGate,syncStore,noteSync}.ts` (16 unit tests), `useNotes` (TanStack Query list, create, delete, revisions) and `useNoteSession` in `src/components/product/workspace/`, and `NoteScreen` (sync indicator, conflict dialog, history drawer, delete).

**Verified live 2026-10-20** against the local backend (test account `claude-test@incantly.test` via Mailpit):
- create, then type: Saving… → Saved, with the text on the server;
- rename, then the server title updates;
- reload, and the content and title persist;
- another device's overlapping edit → Conflict, then "Keep my version" saves the local copy;
- history preview (read-only) → restore creates a `restore` revision;
- simulated offline → "Offline · 1 pending" → reload sends it;
- delete removes the note.

**Design adjustments:**
- **3.6 Conflicts.** The backend already rebases edits to different nodes, so `409 NOTE_TRANSACTION_CONFLICT` means a true overlap. The client keeps the local copy and asks the user: Keep my version (full save on the latest revision) or Use the latest version. It never auto-merges or overwrites silently.
- **3.5 `DocumentRepository`.** Core's interface speaks binary update blobs, not typed operations. The typed-operation queue (`NoteSync`) sits beside it.
- **3.4 Opening a note.** The cached copy is shown read-only until the server answers, so no keystrokes can be lost when the authoritative copy loads.

**Known limitation until Phase 4:**
- ~~**Images and files in notes.**~~ Resolved in Phase 4: uploads now go to `/v1/assets`, so notes with images and files save to the server.
- **Old local notes.** Interim local notes in `localStorage` are no longer read. They stay in the browser and aren't migrated.

## Phase 4: Assets

- [x] **4.1 Server `AssetRepository`.** Reserve with `POST /v1/assets/uploads` + key. `PUT` each part directly to the returned URL with exactly the returned headers and no cookies (multipart concurrency 3, keep ETags). Then complete. The IndexedDB asset store stays only as an offline preview cache.
- [x] **4.2** Client-side type and size checks (types from the schema, 250 MiB limit) for friendly errors; the server decides.
- [x] **4.3** Progress, cancel (`DELETE /v1/assets/uploads/{id}`), and `409 UPLOAD_EXPIRED` (abort, reserve again with a new key). A reload mid-upload resumes or restarts cleanly.
- [x] **4.4** Media nodes store `assetId` only. Call `GET /v1/assets/{id}/download` just before display or download; never persist the URL; re-request after expiry.
- [x] **4.5** Quarantine or `422 UPLOAD_VERIFICATION_FAILED` shows "This file could not be verified". `409 ASSET_IN_USE` on delete shows "Still used in a note or the Library".
- [x] **4.6 Post-upload choice.** After an upload in the editor, offer "Also add to Library" (creates a `FILE` / `AUDIO_TRANSCRIPT` Source from the same `assetId`, no second upload).

**Done when:** a 1 MB image and a 100 MB PDF upload with progress; cancel works mid-upload; images still render after URL expiry; one uploaded PDF can be in a Note and in the Library without uploading twice.

**Implemented:**
- `src/lib/api/assets.ts`: `assetsApi` (reserve, complete, abort, download, remove).
- `src/lib/assets/upload.ts`: `uploadAsset`, which does the following.
  - **Checks:** the allowlisted type (with aliases, and the extension when the browser reports no type), the 250 MiB limit, and empty files.
  - **Checksum:** SHA-256 for single uploads.
  - **Parts:** each `PUT` goes over XHR (for progress), without credentials, three at a time, with ETags kept.
  - **Retries:** a transient storage error retries the part. An expired reservation (`UPLOAD_EXPIRED` or a storage 403) is aborted and reserved again once with a new key.
  - **Cancel:** aborts both the requests and the reservation.
- `src/lib/assets/serverAssetHost.ts`: `ServerAssetHost` implements core's `AssetRepository` and the editor's `DocumentAssetHost`.
  - **URLs:** download URLs are kept in memory only, until 30 seconds before they expire. `refresh` asks again.
  - **Offline previews:** uploaded images up to 16 MiB are kept in IndexedDB (`incantly-asset-previews`, keyed by user and asset).
  - **Pending uploads:** each upload in flight is recorded in the pending-command store and holds a Web Lock. `abortAbandonedUploads` frees reservations whose tab is gone.
- **Editor (backend-agnostic):**
  - `assetHost.tsx`: the `DocumentAssetHost` interface and `DocumentAssetsProvider`, with IndexedDB as the fallback.
  - `AssetNodeViews.tsx`: image, audio, PDF and file views resolve URLs just in time. A media error asks once for a fresh URL; repeated errors show Retry. "Open" is a link whose URL is fetched as the pointer or focus arrives.
  - `DocumentFileUploads`: progress bar, cancel, error copy, and an `afterUpload` follow-up.
  - Image width and height are stored on the node to avoid layout shift.
  - Slash items "Image" and "Upload file" open the system picker, for touch and keyboard users.
  - Uploads are inserted after a selected block instead of replacing it.
- **Product:** `workspace/useAssets.tsx` holds one host per user, abandoned-upload cleanup on load, and the "Also add to Library" offer: `FILE` for PDF, text and Markdown; `AUDIO_TRANSCRIPT` with a required consent checkbox. Images are not offered, since the Library doesn't accept them.
- **Unit tests:** `upload.test.ts` (11) and `serverAssetHost.test.ts` (5).

**Live-verified (local backend + MinIO, test account):**
- **1.4 MB PNG:** uploaded and rendered at its real size. The note saved with only `assetId`, `width` and `height`.
- **Another device:** with the local preview cleared, the image loads from a 5-minute MinIO URL. Breaking the image's URL made it request a new one and load again.
- **100 MB PDF:** 13 parts uploaded with progress (24% → 100%) in about 4 seconds, and the ETags were readable across origins.
- **Cancel:** cancelling at 20% sent `DELETE` (204), inserted nothing and cleared the card.
- **Reload mid-upload:** the reservation was freed and no pending record was left.
- **Library:** "Also add to Library" created a `FILE` Source with the same `assetId` as the note's PDF embed, so nothing uploaded twice.
- **`ASSET_IN_USE`:** the server answered `409 ASSET_IN_USE` for a referenced asset.
- **Audio:** the audio player renders, and the Library button stays disabled until consent is given.
- **Several uploads in a row:** all of them stay in the note.
- **Responsive:** 320, 375, 768, 1024 and 1440 px showed no overflow and no target under 44 px, for the upload panel and the media views.
- **Checks:** typecheck, lint, and 77 unit tests pass.

**Known limitations:**
- **PDF names after a reload:** PDF embeds store no filename in the canonical model, so after a reload the card says "PDF document". The name shows only during the session that uploaded it.
- **Asset deletion:** there is no delete-asset UI yet. The `ASSET_IN_USE` copy is in place for Phase 5, when Library management can delete Sources and their assets.
- **Sources in the Library page:** Sources added from a note appear on the Library page once Phase 5 replaces the preview store.
- **Opening files in the pane:** the in-app browser pane blocks new tabs, so "Open" was verified by checking that the link's URL serves the PDF (200, `application/pdf`), not by watching a tab open.
- **G5:** see the backend gaps table.

## Phase 5: Library (Sources)

- [x] **5.1** Replace `WorkspaceLibrary.tsx`'s local IndexedDB with `GET /v1/library/sources` (kind and status filters, cursor paging).
- [x] **5.2 "Add to Library" dialog, one tab per kind:**
  - File: PDF, text, Markdown.
  - Audio: with the required consent checkbox "I have permission to record and transcribe this audio".
  - YouTube: URL plus a `.vtt`/`.srt` caption file, with help saying captions come from YouTube Studio and the app never scrapes YouTube.
  - Web page: `409 REMOTE_IMPORT_UNAVAILABLE` shows "Web pages aren't available here yet".
  - Paste: at most 512 KiB.
  - Note revision: pick a Note; uses its `currentRevisionId`.
  - Plus optional title, sensitivity, and "Also add to Spaces" (up to 20). Re-adding the same Asset or revision returns the existing Source; treat it as success.
- [x] **5.3 Processing.** Poll `/processing` and show the stage (Validating, Queued, Fetching, Parsing, Transcribing, Normalizing) and the states:
  - `READY`;
  - `PARTIALLY_READY` with its `partialReason` in words;
  - `FAILED` with its `failureCode` in words;
  - `QUARANTINED`, not retryable;
  - images (`AWAITING_PROCESSOR`) show "Added, not searchable".

  Show Retry only when `canRetry` and Cancel only when `canCancel`; handle `409 NOTHING_TO_RETRY` and `NOT_CANCELLABLE`.
- [x] **5.4 Source detail drawer.** Versions (up to 25), provenance (pages parsed, duration, host, untrusted `documentTitle` as text), rename, sensitivity with help ("Restricted material is never sent to external AI"), archive/restore, delete (confirm: removes its Space links and Note bindings; the file stays), and "Open file" via the asset download.
- [x] **5.5** Show where a Source is used: Spaces it's linked to, from the Space pages' data when available.

**Done when:** every Source kind can be added, shows live progress, ends in a clear state, and can be retried, cancelled, renamed, archived, restored and deleted.

**Implemented (Phases 5 and 6 landed together):**
- **API clients:** `src/lib/api/library.ts` (list, get, create, update, archive, restore, delete, processing, retry, cancel) and `src/lib/api/spaces.ts` (Spaces, membership, home note, Source links).
- **Library data (`workspace/useLibrary.ts`):**
  - `useLibrarySources` reads every cursor page, 100 at a time.
  - **Filters are client-side:** they run over the full list, because the API's `status` filter takes one status while the UI chips group two (for example Ready plus Partly ready).
  - While anything is processing, the list refetches with backoff.
  - `useSourceProcessing` polls `/processing` from 1 second to 5 seconds until it settles.
  - `addSourceToLibrary` uploads the file (Phase 4 uploader), then sends `POST /v1/library/sources` with a new key per attempt.
- **Words for every state (`workspace/sourceStatus.ts`):** stage names, `partialReason`, `failureCode`, quarantine, and images awaiting a processor ("Added, not searchable"), with unit tests.
- **Add to Library dialog:**
  - Uploads with a progress bar, and Cancel stops the upload.
  - Errors appear inline, and the dialog stays open on failure.
  - A web page that answers 409 shows "Web pages aren’t available here yet".
  - "Also add to Spaces" sends `spaceIds`.
  - A note is added as its `currentRevisionId`.
- **Source drawer:**
  - Live status and stage, with Retry and Cancel shown only when `canRetry` / `canCancel`, and `NOTHING_TO_RETRY` / `NOT_CANCELLABLE` handled.
  - Search-index readiness, "Open file" through the asset download, rename (on blur or Enter), and sensitivity with help text.
  - Used in: the Spaces that link the Source, from each Space's link list.
  - Versions with provenance; `documentTitle` is shown as text.
  - Archive, restore, and delete behind a confirmation.
- **Sidebar and Search:** sources open their drawer.

**Live-verified:**
- **All six kinds:** each was created on the server: File (PDF), Audio (consent required before sending), YouTube (caption file plus link), Pasted text, Note revision, and Web page (409 shown in words).
- **Pasted text over 512 KB** is caught before sending.
- **Rename and sensitivity** are saved.
- **Cancel and retry:** cancel moves to `FAILED` / `CANCELED_BY_USER` ("You cancelled processing."), Retry appears, and retry goes back to `PENDING`.
- **Archive and restore:** archive makes the Source read-only, and restore brings it back.
- **Delete:** the Source is removed, and the PDF still shows in the note that embeds it.
- **Used in:** shows the linked Space.

**Not verifiable on this machine yet:**
- **Stage progression to READY.** The local backend isn't processing Sources: its `.env` has no `OUTBOX_RELAY_ENABLED` / `QUEUE_PUBLISHER_URL`, and the queue worker (`npm run worker`) isn't running.
  - Every Source therefore stays `PENDING`. That is why the user saw "Waiting".
  - The polling, stage names and final-state wording are implemented and unit-tested, but the live run from Parsing to Ready needs that worker.

## Phase 6: Spaces

- [x] **6.1** Spaces list in the sidebar and a Spaces overview: Active/Archived filter (`status`), create (name ≤ 120, description ≤ 1000, icon ≤ 64 characters, e.g. an emoji or icon key) with a key, and edit through `PATCH` (an empty description or icon clears it).
- [x] **6.2 Notes tab.** `GET /v1/spaces/{id}/notes` (paged). Add an existing note or move it from another Space (`PUT`), remove it to make it standalone (`DELETE`), create a note directly in the Space (3.3).
- [x] **6.3 Home Note.** Set it (`PUT .../home-note/{noteId}`, active notes in this Space only) and clear it (`DELETE .../home-note`). Show it first on the Space page.
- [x] **6.4 Sources tab.** List linked Sources; link from the Library picker (`PUT`, where `created: false` means already linked); toggle "Use by default" (`enabledByDefault`); priority (−100 to 100, as Low/Normal/High presets with the exact value behind them); unlink (`DELETE`, keeps the Source). The 200-link cap is shown when reached.
- [x] **6.5 Lifecycle.** Archive/restore, where an archived Space is read-only (actions hidden; `409 SPACE_NOT_ACTIVE` handled). Delete with confirmation "Notes become standalone; nothing else is deleted". Handle `409 SPACE_RETENTION_HOLD`.

**Done when:** a Space can be created, given notes and Sources, a home note set, archived, restored and deleted without losing notes or Sources.

**Implemented:**
- **Data (`workspace/useSpaces.ts`):** every Space (all pages), each Space's notes (paged, with "Load more"), each Space's Source links, and all the mutations.
  - **Create** uses a key per attempt.
  - **Edit** sends only the changed fields; a cleared description or icon is sent as `''`.
  - **Move:** a note moved in refreshes every Space's note list, since it leaves its old Space.
- **The in-memory preview store is removed.** Spaces and Sources survive a reload.
- **G1 workaround:**
  - A note opened from a Space carries that Space, for the header and for returning after delete.
  - "New note" inside a Space creates the note and then adds it to the Space.
  - "Add existing note" lists the notes not in this Space; picking one moves it.
- **Archived Spaces are read-only:** actions are hidden, a Restore banner shows, and they drop out of the sidebar.
- **Delete** confirms "Notes become standalone; nothing else is deleted" and is disabled under a retention hold. `SPACE_NOT_ACTIVE`, `SPACE_RETENTION_HOLD` and `SPACE_SOURCE_LIMIT_REACHED` show as toasts.
- **Sources tab:** "Use by default", Low/Normal/High priority (an exact value off the presets shows as "Normal (12)"), unlink, link from the Library, and the 200-link cap shown and enforced.

**Live-verified:**
- **Persistence:** the Space was created and was still in the sidebar after a reload, which was the user's bug.
- **Notes:** a note created inside the Space and an existing note added were both in the server's list.
- **Home note:** it was set on the server and listed first. Removing that note from the Space cleared the home pointer.
- **Edit:** the description and icon were saved, and clearing the description sent `''`, which became `null`.
- **Archive and restore:** archiving made the Space read-only and removed it from the sidebar; restore brought it back.
- **Source links:** "Use by default" went true → false and priority 0 → 50. Unlink and relink worked, and the server restored the earlier settings.
- **Delete:** the Space was removed, the notes stayed, and the Sources stayed in the Library.

**Responsive (Phases 5 and 6):**
- **Coverage:** the Spaces list, Space notes, Space sources, Library, the Source drawer, Add to Library (File and YouTube tabs) and New Space, at 320, 375, 768, 1024 and 1440 px.
- **Result:** no overflow and no target under 44 px, using a 120-character Space name and a long description.
- **Fixed:** the "Also add to Spaces" list overflowed at 320 and 375 px, because `<fieldset>` and grid items default to `min-width: min-content`. Adding `min-w-0` fixed it.
- **Checks:** typecheck, lint, and 81 unit tests pass.

## Phase 7: Note context (bindings)

> **Built (user, 2026-10-30):** the user asked for it after it was deferred on 2026-10-21. The Context panel's “Sources for this note” section replaces the “Coming soon” placeholder.

- [x] **7.1 Context panel list:** `GET /v1/notes/{id}/context-bindings` (up to 50), showing each Source with kind, status and how it's used.
- [x] **7.2 Add a Source to this note:** a picker of ready Library Sources, with the note's Space Sources first and marked “In this Space”, then `PUT .../context-bindings/{sourceId}` with `AVAILABLE` + `TRACK_LATEST`. Each row's “Use” is “Always include” (`PINNED`), “Use when relevant” (`AVAILABLE`) or “Reference only” (`RELATED`), and its “Version” is “Latest version” (`TRACK_LATEST`) or “Keep this version” (`PINNED_VERSION`, pinned to the Source's `currentReadyVersionId`).
- [x] **7.3** Changing “Use” or “Version” sends the same `PUT` with the rest of the binding carried over; the unlink button removes it (`DELETE`). `GENERATED_FROM` bindings show “This note was made from this source” and can only be removed.
- [x] **7.4** “How these settings work” explains each option in plain words.
- [x] **7.5** Pickers list only `READY`/`PARTIALLY_READY` Sources that aren't already bound. A bound Source that is archived, deleted, failed or blocked shows a warning; one still processing says it's used once ready; a kept version with a newer ready one offers “Use newest”. Library archive, restore, retry, cancel and delete refresh the bindings.

**Implemented:** API in `src/lib/api/bindings.ts`; logic in `src/hooks/use-note-bindings.ts` (`useNoteBindings`), shared by `features/note-bindings/NoteBindingsProvider.tsx` for the open note; pure rules in `workspace/bindingModel.ts` (unit tested); UI in `workspace/NoteSourcesSection.tsx`. Error copy for `NOTE_CONTEXT_BINDING_LIMIT_REACHED`, `NOTE_CONTEXT_BINDING_NOT_FOUND` and `PINNED_SOURCE_VERSION_REQUIRED`/`_NOT_ALLOWED`.

**Verified 2026-10-30 against the local backend:** attached a Source, switched to “Always include”, kept a version (the server pinned the current ready version), went back to “Latest version” (no pinned ID sent), removed it; the picker hid the bound Source. No console errors. At 320, 375, 768, 1024 and 1440 px: no overflow, no clipped control, no target under 44 px. The test bindings were removed.

**Backend gap:** the backend design doc says `RELATED` is “not searched by default”, but `scope-resolver.service.ts` searches every binding type (only `PINNED` gets a higher priority). The UI describes “Reference only” as the design intends; raise it with the backend owner.

## Phase 8: Context (index status and evidence preview)

- [x] **8.1 Searchable badge** on notes (`GET /v1/notes/{id}/index-status`) and Sources (`GET /v1/library/sources/{id}/index-status`): Indexing (`building`), Keyword-ready (`lexicalReady`), Ready (`vectorReady`), Failed (`failureCode`). Poll only while visible and building.
- [x] **8.2 "Index now"** on a note (`POST /v1/notes/{id}/reindex`, `202`; rate limited, shown in the Context panel only).
- [x] **8.3 "What would the AI see?" preview** (`POST /v1/context/preview`):
  - a query box and scope (This note, This selection, This Space with an include-notes toggle, Selected Sources, Custom, and Library only on explicit choice);
  - passages as plain text with locator links (PDF `#page=N` via asset download, audio seek, YouTube `t=`, note block scroll);
  - `sufficiency`, `degraded`, `stale` and `sensitivity` banners, with `NOT_FOUND` shown honestly;
  - `429` respects `Retry-After`.

**Implementation (Phase 8):**
- **API:** `src/lib/api/context.ts` (`contextApi`). Preview and reindex use `maxAttempts: 1`, so a `429` reaches the UI as a countdown instead of being retried silently.
- **Logic:** `workspace/contextModel.ts` (+ test) covers the badge, banners, grouping by note or Source, locator labels, YouTube links built only from a bare video ID, and `Retry-After`.
- **Hooks:** `workspace/useContextSearch.ts`. Index status polls 1 s → 5 s only while building; TanStack pauses it when the tab is hidden or offline. `useContentSearch` runs on submit only, aborts the previous search, and stores nothing.
- **UI:** `workspace/ContextSearch.tsx` (`IndexStatusView`, `EvidenceResults` and the opener) and `workspace/NoteContextPanel.tsx`.
  - **Where results show:** the Search page searches content on Enter (all notes and sources, or one Space). The note's Context panel has Searchable with "Index now", and "What would the AI see?" with scopes This note, Selected text, This Space (+ notes toggle), Notes and sources I choose (`SELECTED_SOURCES`, or `CUSTOM` once a note is picked, max 50), and All.
  - **Opening a result:** a PDF opens at `#page=N` and audio at `#t=s` (download URL fetched just in time), YouTube at `t=`; a note opens with the cited block range selected and scrolled into view. A passage starting at the note's title starts at the top. Anything else opens the Source drawer.
- **Library:** the Source drawer reads `/index-status` for its badge.
- **Editor fix:** `DocumentEditor` built its ref API inside `useImperativeHandle`, so `onReady` never fired without a `ref`. The API is now built outside it. Block helpers live in `src/lib/document-editor/blockNavigation.ts`, which keeps ProseMirror positions inside the editor library.

**Live-verified (local backend):**
- **Search page:** "osmosis water" found the pasted-text Source. "Calvin cycle glucose" found the new note, and clicking it opened the note with both paragraphs selected.
- **Context panel:** the badge read "Searchable · 1 passage", and "Index now" returned 202 and showed "Indexing scheduled". "This note" and "Selected text" previews returned the cited passages.
- **Responsive:** the Search page and Context panel (docked at 1024 and 1440 px, a sheet at 320, 375 and 768 px, including the 10-item picker) have no overflow and no target under 44 px.

## Phase 9: Imports

- [x] **9.1 Import file as note:** a `.txt`/`.md` file (at most 10 MiB) goes through Phase 4 upload, then `POST /v1/imports/files { sourceAssetId, targetNoteId? }` with a key. Poll `GET /v1/imports/{id}` until `completed` (open `targetNoteId`), `failed` (show `errorCode` in words) or `cancelled`. Offer it both as "new note" and "into this note".
- [x] **9.2 Import from URL:** `POST /v1/imports/urls`. `409 REMOTE_IMPORT_UNAVAILABLE` shows "URL import isn't available here yet"; also handle `INVALID_IMPORT_URL` and `IMPORT_URL_BLOCKED`.
- [x] **9.3** Cancel while queued (`DELETE`); hide Cancel once `running` (`409 IMPORT_NOT_CANCELLABLE`). Import IDs are persisted so a reload resumes polling.

**Implementation (Phase 9):**
- **API:** `src/lib/api/imports.ts` (`importsApi`; cancel answers 204).
- **Logic:** `workspace/importModel.ts` (+ test) validates `.txt`/`.md` up to 10 MiB and https only, parses stored records defensively (dropped after 24 h, at most 20), and sets the 2 → 5 s poll.
- **UI:** `workspace/imports.tsx`.
  - **Dialog:** `ImportDialog` handles file or web address, as a new note or into the open note. It shows upload progress, Cancel aborts the upload, and errors appear inline.
  - **Tray:** `ImportTray` is fixed bottom-left with safe-area insets and `aria-live`. It shows status, Cancel while `queued`, Open note when completed, the failure `errorCode` in words, and Dismiss.
  - **Tracker:** `useImportTracker` stores only `{id, file name or host, intoNoteId, startedAt}` under `incantly-imports:{userId}`. On completion it refreshes the notes list and reloads the open note if it has no unsent edits.
- **Entry points:** New → Import file as note / Import from web address, and Note actions → Import file into note / Import web page into note.

**Live-verified:**
- **New note:** `krebs-cycle.md` was imported as a new note, then Open note.
- **Into a note:** `pyruvate.txt` was imported into the open note, which reloaded with the text appended.
- **Reload:** after a reload, the tray still showed the finished import.
- **Web address:** `http://` was refused inline. `https://` returned 409 `REMOTE_IMPORT_UNAVAILABLE`, shown as "Importing from a web address isn’t available here yet."
- **Responsive:** the import dialog and tray are clean at 320 px.

## Phase 10: Hardening

- [x] **10.1** An offline banner; polling pauses when hidden or offline and resumes on reconnect.
- [x] **10.2** `aria-live` for uploads, processing, sync and imports. All dialogs, drawers and tabs work by keyboard with focus return.
- [x] **10.3** Security sweep: no tokens, presigned URLs or document text in storage, URLs, logs or analytics. All server text (titles, filenames, passages, `documentTitle`) is rendered as text.
- [x] **10.4** Update `docs/authentication.md`, this plan's statuses, and a Maintenance note (regenerate types when the backend changes; re-copy `frontend-api-integration.md`).

**Implementation (Phase 10):**
- **10.1:** `OfflineBanner` is sticky and announced politely; reconnecting shows "Back online. Syncing your changes…" for 4 s. All polling uses TanStack Query intervals, which pause while the tab is hidden (`refetchIntervalInBackground` is off) or offline (online manager) and refetch on reconnect. Note sync flushes on `online`.
- **10.2:**
  - **Announcements:** live regions cover uploads (`role=status` card), processing (drawer), sync (indicator), imports (tray), search results (count) and the offline banner.
  - **Keyboard:** dialogs are native `<dialog>`. Docked panels take focus, close on Escape and return focus. Tabs use arrow keys.
- **10.3:** the sweep found no tokens, presigned URLs or passages in storage, URLs or logs.
  - **Logging:** diagnostics keep only path templates and codes.
  - **Rendering:** server text is rendered as text (no `dangerouslySetInnerHTML` in product code). The E2E test proves `<b>` in a passage stays literal.
  - **New storage:** only import IDs. Search queries never go in a URL.
- **10.4:** `docs/authentication.md` covers `/v1/*` signing, 401 handling and what is stored on the device. The statuses here are updated, and the maintenance note is below.

**Maintenance:**
- **Backend API changes:** run `npm run api:fetch` (needs `API_DOCS_USERNAME`/`API_DOCS_PASSWORD` in the environment, never in the repo), then `npm run api:types`, then `npx tsc --noEmit`. Commit `openapi.json` and `schema.d.ts` together.
- **Integration guide changes:** re-copy `frontend-api-integration.md` from the backend repo.
- **Generated types:** they mark server-defaulted fields as required (see `ContextPreviewRequest`). Loosen them at the API module, never at call sites.

## Deferred until the product owner asks

- [x] **E2E tests (focused).** The user (2026-10-21) asked for a few straightforward Playwright specs, with mocked `/v1/*` (`tests/e2e/workspace-mocks.ts`):
  - `content-search.spec.ts`: passages grouped with page locators and rendered as text; a 429 counts down.
  - `imports.spec.ts`: queued → cancelled; only the ID and host are stored; tracking resumes after reload.
  - `offline-banner.spec.ts`: offline, then back online.

  All three pass with `PLAYWRIGHT_CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`.
- [x] **AI agent chat** (`/v1/ai/*`), requested 2026-10-29. `src/lib/api/ai.ts`; panel in `src/components/product/assistant/` (sparkles button in the top bar, ⌘J). Docks right from `lg`, sheet below.
  - [x] Ask (`POST /v1/ai/requests`) with one `Idempotency-Key` per send; `surface: chat`; scope pill (this note / this Space / all notes and sources). `LIBRARY` is only ever an explicit pick.
  - [x] "+" menu: Ask with sources (`ask`) or Quiz me (`practice`); suggestion chips send an explicit `command`.
  - [x] Clarification options resend the same text and scope with `command` + `clarified: true` and a new key.
  - [x] Poll `/events?after=` with 1 s → 4 s backoff (paused while hidden); progress copy from event codes; read the job when `done`.
  - [x] Grounded answer: `[S1E1]` refs become numbered markers (unknown brackets stay text), plain-text rendering, progressive reveal (the backend has no token stream), copy, ask again, sources list from `/citations` that opens the note or Source.
  - [x] Practice questions with "Show answer" disclosures and shared sources.
  - [x] `NOT_FOUND` shows "Your material doesn't cover this", `PARTIAL` is labelled; every `failureCode` has copy, refusals and limits are not retryable.
  - [x] Stop → `POST /cancel`; New chat cancels running jobs. Thread and running `jobId`s are kept in session storage and polling resumes after a reload.
  - [x] Allowance (`GET /v1/ai/allowance`): sending is disabled with the reset time when it is used up; a `503` hides it.
  - [x] Unit tests: `assistant/aiModel.test.ts`.
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
8. Gaps G1–G6 are raised with the backend owner, and each workaround is in place.
9. Every new view passes the responsive check (2.8).

### Intentionally unused operations

- `GET /v1/health/live`, `GET /v1/health/ready`: infrastructure probes; the UI must not poll them.
- `POST /v1/ai/requests`, `GET /v1/ai/jobs/{id}`, `GET /v1/ai/jobs/{id}/events`, `GET /v1/ai/jobs/{id}/citations`, `POST /v1/ai/jobs/{id}/cancel`, `GET /v1/ai/allowance`: AI agent deferred (see above).
- (Remove the AI entries from this list if the AI agent is brought into scope.)
