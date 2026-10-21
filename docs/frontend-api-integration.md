# Frontend integration guide for the implemented API

## Purpose and authority

This is the handoff contract for frontend engineers and coding agents connecting
to the Incantly backend. It documents only behavior implemented in this
repository at the time of this change. The protected OpenAPI document remains
the machine-readable authority for request schemas and routes; this guide
explains the journeys, security boundaries, retry rules, and client state
machines that schemas alone cannot express.

Implemented product resources are:

- Better Auth sessions through Google OAuth or passwordless email OTP;
- personal **Notes** and immutable canonical revisions;
- typed, idempotent note transactions for autosave and offline reconnect;
- direct private asset uploads to MinIO locally or R2 in production;
- passive text/Markdown file imports and isolated HTTPS URL-import jobs;
- personal Spaces, reusable Library Sources, and explicit Note context bindings;
- Context indexing status, processing controls, and evidence preview;
- the AI assistant: cited answers and practice questions over the user's own
  material, run as background jobs with progress events (`/v1/ai/*`);
- public liveness and readiness probes.

The following are not implemented public contracts yet: team workspaces,
sharing, Liveblocks collaboration, comments, the tutor, flashcard/quiz/study
guide artifacts, streaming AI chat, search, billing, notifications, exports, and
public asset metadata. Do not invent calls to the planned endpoints in `api-contract.md`.
In this release, a Note, Space, and Library Source belong directly to the
authenticated Better Auth user.

## Where requests go

| Request                                        | Browser destination                  | Why                                                                                                     |
| ---------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/api/auth/*`                                  | public web origin                    | The Node web server adds the signed, short-lived client identity required by the backend auth boundary. |
| `/v1/notes/*`, `/v1/spaces/*`, `/v1/library/*`, `/v1/context/*`, `/v1/ai/*`, `/v1/assets/*`, `/v1/imports/*` | same-origin web proxy to the backend | Keeps session cookies first-party and prevents CORS and proxy-secret mistakes.                          |
| Presigned upload URL                           | the exact returned MinIO/R2 URL      | Upload bytes directly; do not proxy file bodies through NestJS.                                         |
| `/v1/health/*`                                 | backend or service origin            | Public infrastructure probes; no session required.                                                      |

The browser must never generate `X-Incantly-*` identity headers or know
`AUTH_PROXY_SECRET`. That secret belongs only to the web server and backend.
Production traffic uses HTTPS. Requests that bypass the trusted auth forwarding
boundary fail with `403 UNTRUSTED_PROXY`.

## Shared HTTP rules

### Authentication and cookies

- Sessions are seven-day Better Auth sessions stored in `HttpOnly` cookies.
- Use `credentials: "include"` for cross-origin development calls. Prefer a
  same-origin server proxy in the product.
- Never copy a session or OAuth token into JavaScript, localStorage,
  sessionStorage, IndexedDB, logs, analytics, URLs, or error reports.
- Documentation credentials only unlock `/v1/docs`; they never authorize an
  application request.
- A `401` means the session is absent or expired. Stop protected work, retain
  unsynced local operations, and ask the user to authenticate again.

### Mutation origin protection

All authenticated `POST`, `PUT`, `PATCH`, and `DELETE` application operations validate
the request origin in addition to the session cookie. Send JSON with the exact
allowed web `Origin`. Do not disable this check to make local development work;
configure `WEB_ORIGINS` correctly.

### Validation and errors

- JSON bodies are allowlisted DTOs. Unknown properties are rejected.
- Treat stable `code` values as program logic. Do not branch on human messages.
- Every response carries `X-Request-Id`. Record it in client diagnostics and
  support reports, but do not use it as an authorization value.
- Ownership failures deliberately return `404` for many resources so callers
  cannot enumerate another user's IDs.
- `429` and retryable `503` responses may include `Retry-After`. Respect it.
- Do not automatically retry `400`, `401`, `403`, `404`, or `422`.
- Do not retry a `409` blindly. Its stable code determines whether the client
  must reuse the original request, fetch a new head, or stop.

### Idempotency

Create, upload-reservation, and import commands require an
`Idempotency-Key` header of 8–128 characters. Generate a random key once per
logical user action and persist it beside the pending local command. An exact
retry uses the same key and body. A changed body requires a new key.

`409 IDEMPOTENCY_KEY_REUSED` means the same key was reused for a different
request. This is a client bug; do not generate another key and silently repeat
the changed operation.

## Authentication journeys

Email authentication is passwordless. Password signup, password login,
verification links, forgotten-password, and reset-password routes are disabled.
There is therefore no password-reset frontend in this release.

Use the official Better Auth client where possible. The paths below explain the
wire behavior for debugging and non-browser test clients.

### Email OTP signup and sign-in

1. Collect email. Collect first and last name for a new account and combine
   them into a display name before verification.
2. `POST /api/auth/email-otp/send-verification-otp`:

   ```json
   { "email": "ada@example.com", "type": "sign-in" }
   ```

3. Show a six-digit OTP screen only after the request succeeds. Codes expire
   after five minutes, allow three wrong attempts, and rotate when resent.
4. `POST /api/auth/sign-in/email-otp`:

   ```json
   {
     "email": "ada@example.com",
     "otp": "123456",
     "name": "Ada Lovelace"
   }
   ```

5. The successful response sets the session cookie. Navigate to the protected
   product only after `GET /api/auth/get-session` confirms a session.

The account is created only after the OTP proves control of the email. Never
log the OTP or include it in telemetry. Resend belongs on the OTP screen and
must obey both the UI cooldown and server `429 Retry-After` response.

### Google OAuth

Start Google through Better Auth `POST /api/auth/sign-in/social` with provider
`google` and an allowlisted callback URL on the public web origin. The callback
is `/api/auth/callback/google`. The Google client secret stays in the backend
environment. Do not call Google's token endpoint from the browser.

Implicit email-based account linking is disabled. Linking requires an already
authenticated session and explicit user intent. A Google callback must never
be treated as proof of an unrelated existing email account.

### Session and sign-out

- `GET /api/auth/get-session` returns the sanitized user/session view or null.
- `POST /api/auth/sign-out` invalidates the current session.
- JSON session tokens are removed by the backend adapter even when a generic
  SDK schema displays a token field.

Auth adapter codes include `UNTRUSTED_PROXY` (403), `UNTRUSTED_ORIGIN` (403),
`INVALID_JSON` (400), `BODY_TOO_LARGE` (413), `RATE_LIMITED` (429), and
`AUTH_UNAVAILABLE` (503). Better Auth's own stable error codes pass through.

## Notes API

All routes below require the session cookie. Mutation routes also require the
allowed origin. A note is personal in this release; there is no `workspaceId`.

### Create a note

`POST /v1/notes` with `Idempotency-Key`:

```json
{ "title": "Calculus notes" }
```

Title is required, non-empty, and at most 300 characters. The server creates
and validates the initial canonical `IncantlyDocument`; the client does not
invent the initial checkpoint.

The `201` view contains `id`, `title`, lower-case `status`, `schemaVersion`,
`currentRevisionId`, `currentRevisionNumber`, `createdAt`, and `updatedAt`.

### List and open notes

- `GET /v1/notes?limit=25&cursor=...` returns `{ items, nextCursor }`.
  `limit` is 1–100. Treat `nextCursor` as opaque.
- `GET /v1/notes/{noteId}` returns metadata without document content.
- `GET /v1/notes/{noteId}/checkpoint` returns
  `{ revision, document }`, where `document` is canonical Incantly JSON.

Open from cached IndexedDB immediately when useful, but fetch the authorized
server head in parallel. IndexedDB is an untrusted cache, never proof of
ownership or accepted server state.

### Autosave with typed transactions

Preferred editing uses `POST /v1/notes/{noteId}/transactions`:

```json
{
  "version": 1,
  "transactionId": "txn:01JEXAMPLE123",
  "clientId": "browser_install_01",
  "localSequence": "42",
  "baseRevisionNumber": 7,
  "operations": [
    {
      "type": "replaceText",
      "nodeId": "paragraph:abc",
      "from": 0,
      "to": 5,
      "text": "Hello"
    }
  ]
}
```

Rules:

- `transactionId` is 8–128 URL-safe identifier characters and identifies one
  exact transaction payload.
- `clientId` is a stable 8–128 character installation identifier, not an auth
  credential.
- `localSequence` is a positive decimal string, monotonic for this
  `(noteId, clientId)` and within signed 64-bit range.
- `baseRevisionNumber` is the last acknowledged server revision.
- Send at most 1,000 valid `@incantly/core` operations per request.
- Keep the pending operation locally until the server returns an applied
  acknowledgement. Never delete it merely because bytes left the browser.

A `201` response contains:

```json
{
  "version": 1,
  "transactionId": "txn:01JEXAMPLE123",
  "status": "applied",
  "revision": { "id": "...", "revisionNumber": 8 }
}
```

Exact retries return the original acknowledgement and do not edit twice.

#### Transaction recovery table

| Response                                                      | Client action                                                                                                                                                                                                   |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `201 applied`                                                 | Persist the acknowledged revision and remove this pending transaction.                                                                                                                                          |
| `409 NOTE_TRANSACTION_CONFLICT`                               | Fetch the latest checkpoint. Rebase the still-pending logical operation by stable node IDs. Submit the rebased operation with a new transaction ID and next sequence. Never report success without applying it. |
| `409 TRANSACTION_ID_REUSED`                                   | Stop. The ID was reused with a different payload; this is local corruption or a client bug.                                                                                                                     |
| `409 CLIENT_SEQUENCE_REUSED` / `CLIENT_SEQUENCE_OUT_OF_ORDER` | Stop this client queue and reconcile its persisted sequence before sending more work.                                                                                                                           |
| `409 TRANSACTION_IN_PROGRESS`                                 | Back off and poll/retry the identical payload; do not mint a replacement operation immediately.                                                                                                                 |
| `422 INVALID_NOTE_TRANSACTION`                                | Keep a diagnostic copy, mark the local operation rejected, and show a recoverable editor error. Do not retry unchanged.                                                                                         |
| `503 NOTE_TRANSACTION_RETRYABLE`                              | Wait for `Retry-After`, then retry the identical transaction ID and identical payload. Use bounded exponential backoff.                                                                                         |

The server retries PostgreSQL serialization aborts internally three times.
Only exhaustion becomes `NOTE_TRANSACTION_RETRYABLE`; it is not a document
conflict and does not permanently mark the transaction receipt as conflicted.

### Full checkpoint save

`PUT /v1/notes/{noteId}/checkpoint` accepts:

```json
{
  "baseRevisionNumber": 8,
  "document": { "schemaVersion": 1, "id": "...", "content": [] }
}
```

Use this for explicit full-checkpoint workflows, not every keystroke. The
server parses, validates, normalizes, serializes, checks size, stores a new
immutable object, then advances the head with compare-and-swap. A
`409 STALE_NOTE_REVISION` requires a fresh checkpoint and merge; never overwrite
the newer head with a stale local document.

### History, restore, and delete

- `GET /v1/notes/{noteId}/revisions` returns up to 100 newest immutable
  revision metadata records.
- `GET /v1/notes/{noteId}/revisions/{revisionId}` returns that historical
  `{ revision, document }` after ownership validation.
- `POST /v1/notes/{noteId}/restore` with
  `{ "sourceRevisionId": "..." }` creates a new RESTORE revision. It does not
  mutate history or point the head at the old object.
- `DELETE /v1/notes/{noteId}` returns `204`, soft-deletes the note, and queues
  retention-aware cleanup. Remove it from active UI after success.

## Spaces and Library API

Spaces organize existing Notes and reusable Library Sources; they do not copy
Note revisions, Assets, or object bytes. The Library is a view over the current
user's Sources, not another tenant or authorization boundary. Another user's
Space, Note, Source, Asset, or binding ID is returned as a safe `404`.

Every route here is cookie-authenticated, and every mutation is
Origin-checked. Path IDs are bounded (`400 INVALID_RESOURCE_ID`). Every
operation's request, response, and stable error codes are in `/v1/docs`.

### Lists and cursors

List routes return `{ items, nextCursor }`. `nextCursor` is an opaque keyset
cursor: send it back unchanged as `cursor`, stop when it is `null`, and never
build or parse one. Cursors stay valid when listed rows change or are deleted.
A malformed cursor returns `400 INVALID_CURSOR`. `limit` is 1–100, default 25.

Space Source links and Note bindings are bounded collections and are returned
in full with their `limit` (200 links per Space, 50 bindings per Note).

### Space lifecycle and Note membership

- `POST /v1/spaces` requires `Idempotency-Key` and accepts `name`, optional
  `description`, and optional `icon`.
- `GET /v1/spaces?limit=25&cursor=...&status=ACTIVE|ARCHIVED` lists Spaces,
  newest first. Omit `status` to list both.
- `GET/PATCH /v1/spaces/:spaceId` reads or updates bounded metadata. An empty
  `description` or `icon` clears it.
- `POST /v1/spaces/:spaceId/archive` and `/restore` are reversible and
  idempotent. `DELETE` soft-deletes the Space, makes its Notes standalone, and
  removes its Source links; it never deletes Notes, revisions, Sources, or
  objects. Retrying `DELETE` returns `204`. An active retention hold returns
  `409 SPACE_RETENTION_HOLD`.
- `GET /v1/spaces/:spaceId/notes` lists the Space's active and archived Notes.
- `PUT /v1/spaces/:spaceId/notes/:noteId` assigns or moves an owned Note and is
  idempotent. `DELETE` makes it standalone. A move never creates a revision.
- `PUT /v1/spaces/:spaceId/home-note/:noteId` accepts only an active Note
  already in that active Space. Moving, unassigning, or deleting the home Note
  clears the home pointer atomically.

Archived Spaces remain readable but reject membership, home Note, and
Source-link changes with `409 SPACE_NOT_ACTIVE`. Restore the Space first.

### Library Sources and versions

`POST /v1/library/sources` requires `Idempotency-Key`. The stable Source is the
reusable knowledge identity; each `SourceVersion` is immutable evidence. Send
exactly one origin:

| `kind`                   | Origin field     | Notes                                       |
| ------------------------ | ---------------- | ------------------------------------------- |
| `FILE`                   | `assetId`        | An owned `READY` Asset: text, Markdown, or PDF |
| `AUDIO_TRANSCRIPT`       | `assetId`, `transcriptionConsent: true` | A verified `audio/*` Asset; consent is required (`422 TRANSCRIPTION_CONSENT_REQUIRED`) |
| `YOUTUBE_TRANSCRIPT`     | `assetId`, `youtubeUrl` | A caption file Asset (`text/vtt` or `application/x-subrip`) plus the video URL or ID (`422 YOUTUBE_VIDEO_REQUIRED`) |
| `WEB_PAGE`               | `url`            | An HTTPS page; `409 REMOTE_IMPORT_UNAVAILABLE` where the isolated fetch boundary is not deployed |
| `NOTE_REVISION`          | `noteRevisionId` | An owned immutable Note revision            |
| `PASTED_TEXT`            | `text`           | Up to 512 KiB of UTF-8 text                 |

The API never fetches a `url` or `youtubeUrl`. A web page is fetched only by
the isolated import boundary; the YouTube URL is identity for provenance and
timestamp links. Captions are never scraped from YouTube: ask the user for a
caption file they have the right to use (for example one downloaded from
YouTube Studio for their own video). Show a consent checkbox before adding
audio ("I have permission to record and transcribe this audio").

Optional `spaceIds` (up to 20) links the new Source to active Spaces in the same
transaction; any invalid Space rejects the whole command.

Adding the same Asset or Note revision again returns the existing Source
instead of a duplicate, and links any requested Spaces. This is how "upload
once, use in many Spaces" works: show the Asset in a Note through the normal
Asset reference, and add it to the Library once.

A new Source starts `PENDING`. Poll `GET /v1/library/sources/:sourceId` with
backoff until the latest version settles:

- Plain text, Markdown, pasted text, and Note revisions become `READY`
  quickly.
- PDFs, web pages, YouTube captions, and audio stay `PROCESSING` while
  `processingStage` moves through `QUEUED_FOR_PROCESSOR`, `FETCHING` (web),
  `PARSING`, `TRANSCRIBING` (audio), and `NORMALIZING`. Audio can take a few
  minutes; poll with backoff and show the stage.
- `PARTIALLY_READY` is usable but incomplete; `partialReason` says why
  (`PDF_PAGE_LIMIT`: only the first pages were parsed; `WEB_CONTENT_LIMIT`;
  `TRANSCRIPT_INCOMPLETE`: part of a long recording could not be
  transcribed).
- Images stay at `processingStage: "AWAITING_PROCESSOR"`: OCR is not offered.
  Show them as "added, not searchable".
- `FAILED` versions carry a stable `failureCode`, for example
  `PDF_NO_TEXT_LAYER` (scanned PDF), `PDF_ENCRYPTED`, `PDF_TOO_LARGE`,
  `AUDIO_TOO_LARGE`, `AUDIO_NOT_SPLITTABLE` (a long M4A/OGG; MP3 and WAV
  recordings of any length up to the limit are split automatically),
  `AUDIO_DURATION_LIMIT`, `TRANSCRIPTION_DISABLED`,
  `TRANSCRIPTION_POLICY_RESTRICTED` (a `RESTRICTED` Source is never sent to an
  external transcription provider), `CAPTIONS_INVALID`, `WEB_PAGE_NO_TEXT`, or
  a boundary code such as `REMOTE_IMPORT_REJECTED`.
- `QUARANTINED` versions failed a content check (the bytes are not what the
  upload claimed, a malformed PDF, or a disallowed web content type). They are
  not retryable. A failed or quarantined Source never changes the original
  Asset, which stays downloadable through its Note.
- Each version also returns `assetId`, `youtubeVideoId`, and `provenance`
  (`processor`, `pageCount`, `pagesParsed`, `durationMs`, `coverage`, `host`,
  `fetchedAt`, `documentTitle`). `documentTitle` is untrusted display text.

Never treat a Source as usable context unless its status is `READY` or
`PARTIALLY_READY`. Object keys, checksums, presigned URLs, and provider details
are never returned.

The other Source routes are list (`kind` and `status` filters), read (up to 25
newest versions), update title or `sensitivity`, archive, restore, and delete.

### Reusing Sources in Spaces and Notes

Use the Space Source routes to reuse one Source without copying it:

- `GET /v1/spaces/:spaceId/sources`
- `PUT /v1/spaces/:spaceId/sources/:sourceId` returns `{ link, created }`.
  `created: false` means it was already linked. Relinking after removal
  restores the previous `enabledByDefault` and `priority`.
- `PATCH` updates `enabledByDefault` or `priority` (−100 to 100).
- `DELETE` unlinks without deleting the Source. Retrying returns `204`.

Use the Note binding routes for explicit relevance:

- `GET /v1/notes/:noteId/context-bindings`
- `PUT /v1/notes/:noteId/context-bindings/:sourceId` returns
  `{ binding, created }` and replaces any existing binding for that pair.
- `DELETE /v1/notes/:noteId/context-bindings/:sourceId`; retries return `204`.

`TRACK_LATEST` follows the Source's newest ready version at job start and must
not include `pinnedSourceVersionId`. `PINNED_VERSION` requires a
`pinnedSourceVersionId` of that Source that is already `READY` or
`PARTIALLY_READY`. Never send a mutable latest pointer as the evidence for a
completed AI job.

Deleting a Source removes its Space links and Note bindings in the same
transaction, so the next read cannot use it. It does not delete the Asset or
Note revision. An Asset that a live Source still uses cannot be deleted
(`409 ASSET_IN_USE`). Archiving is reversible and keeps links, but archived
Sources are excluded from context and cannot be newly linked or bound. Do not
infer Source ownership, readiness, or permission from cached IndexedDB state.

## Context search and index status

Notes and READY Library Sources are indexed automatically in the background.
The frontend never builds search filters, sends vectors, or sends text claimed
to belong to a Note or Source; it sends identifiers only.

### Is it searchable yet?

- `GET /v1/notes/:noteId/index-status`
- `GET /v1/library/sources/:sourceId/index-status`

Both return `{ lexicalReady, vectorReady, building, indexedVersion,
passageCount, failureCode }`. Keyword search (`lexicalReady`) arrives first;
semantic search (`vectorReady`) follows. A Note is reindexed after its edits
pause for about a minute, so `indexedVersion` can briefly trail the Note's
current revision number. PDF, audio, and image Sources waiting for a processor
are not indexed yet.

### Processing controls

- `GET /v1/library/sources/:sourceId/processing` returns the latest version's
  ingestion state, search readiness (`index`), and `canRetry` / `canCancel`.
  Show retry and cancel buttons only when those flags are true.
- `POST /v1/library/sources/:sourceId/retry-processing` restarts failed
  ingestion (including PDFs and audio added before processors shipped), or a
  failed search-index build when ingestion succeeded. Safe to repeat;
  `409 NOTHING_TO_RETRY` when nothing failed. Rate limited.
- `POST /v1/library/sources/:sourceId/cancel-processing` stops a pending or
  processing version (`failureCode: CANCELED_BY_USER`). Repeating returns the
  same state; `409 NOT_CANCELLABLE` once it is ready. The upload is untouched.
- `POST /v1/notes/:noteId/reindex` (`202`) indexes a Note now instead of after
  the edit window. Normal editing never needs it. Rate limited.

### Previewing evidence

`POST /v1/context/preview` (Origin-checked, rate limited per user) returns the
cited passages the AI would use for a question:

```json
{
  "scope": "SPACE",
  "spaceId": "...",
  "query": "What do mitochondria produce?",
  "maxPassages": 8
}
```

| `scope`            | Required fields                 | Searches                                      |
| ------------------ | ------------------------------- | --------------------------------------------- |
| `SELECTION`        | `noteId`, `nodeIds`             | Exact selected nodes, plus the Note scope      |
| `NOTE`             | `noteId`                        | The Note and its context bindings              |
| `SELECTED_SOURCES` | `sourceIds`                     | Exactly those Sources                          |
| `SPACE`            | `spaceId` (+ `includeSpaceNotes`) | Enabled Space Sources and the Space's Notes |
| `CUSTOM`           | `noteIds` and/or `sourceIds`    | That explicit combination                      |
| `LIBRARY`          | —                               | Every usable Note and Source                   |

Send `LIBRARY` only after the user explicitly chooses broad search.
`excludeSourceIds` removes Sources from any scope.

The response is `{ manifestId, sufficiency, degraded, stale, sensitivity, evidence }`:

- `evidence[]` has an opaque `evidenceId` (`E1`, `E2`, …), the passage `text`,
  and a `citation` with the Note or Source ID, version, title, heading path,
  block range, `sourceKind`, `assetId`, and a `locator`. Render passage text as
  plain text, never HTML: it is untrusted user content.
- Render citations from `locator`:
  - `PAGE`: open the PDF Asset (`assetId`) at `page` (1-based), for example by
    appending `#page=N` to its short-lived download URL.
  - `TIME` with `youtubeVideoId`: link to
    `https://www.youtube.com/watch?v={id}&t={floor(startMs/1000)}s`.
  - `TIME` without it: seek the audio Asset's player to `startMs`.
  - `BLOCK`: scroll the Note to `blockId`, or show the passage for text.
- `sufficiency` is `SUFFICIENT`, `PARTIAL`, `AMBIGUOUS`, `NOT_FOUND`, or
  `STALE` (requested content is not indexed yet). `NOT_FOUND` always comes
  with an empty `evidence` list: passages that only share a stray word with
  the question are not returned. Show `NOT_FOUND` honestly; never fill it in.
- `degraded: true` means semantic search was skipped for some content
  (embeddings still filling or the provider unavailable); keyword search ran.
- `stale: true` means some content changed after it was indexed.
- `sensitivity` is the highest data classification among the returned
  passages (`PUBLIC`, `PRIVATE`, `SENSITIVE`, `RESTRICTED`; Notes count as
  `PRIVATE`). AI features never send `RESTRICTED` material to an external
  model provider; a request over such material fails with a clear error
  instead.

Every preview records a manifest with copies of the returned passages for 24
hours; manifests behind answers keep their evidence for 30 days, so an answer
can always show exactly what it used. Do not rely on a preview's `manifestId`
after a day. A `429 RATE_LIMITED`
response includes `Retry-After`.

## AI assistant API

The assistant answers questions and writes practice questions **from the
user's own material** (Notes and Library Sources), with citations. Each request
becomes a background **job**: submit, poll its events, then show the result.
There is no streaming chat endpoint yet.

All routes are cookie-authenticated; `POST` routes are Origin-checked. Jobs
belong to the session user: another user's job is a `404 AI_JOB_NOT_FOUND`.

| Operation | Route | Notes |
| --- | --- | --- |
| Ask | `POST /v1/ai/requests` | `Idempotency-Key` required; rate limited per user |
| Read a job | `GET /v1/ai/jobs/{jobId}` | `result` only when `COMPLETED` |
| Follow progress | `GET /v1/ai/jobs/{jobId}/events?after=-1` | Poll; stop when `done` |
| Cited passages | `GET /v1/ai/jobs/{jobId}/citations` | Completed jobs only |
| Cancel | `POST /v1/ai/jobs/{jobId}/cancel` | Idempotent |
| Allowance | `GET /v1/ai/allowance` | Today's remaining AI spend (estimate) |

### Asking

```http
POST /v1/ai/requests
Idempotency-Key: 9f2c1d1e-7a0b-4c55-9d1e-2b0f6f3a1c77
Content-Type: application/json

{
  "surface": "note",
  "text": "What gas does photosynthesis release?",
  "scope": { "kind": "NOTE", "noteId": "note:..." }
}
```

- `surface` is where the user asked: `chat`, `note`, or `space`. It only picks
  the default task.
- `text` is 2–2,000 characters of what the user typed.
- `scope` decides what may be searched; the server checks it now and on every
  search while the job runs. The model can never widen it.

| `scope.kind` | Required | Searches |
| --- | --- | --- |
| `NOTE` | `noteId` | The Note and the Sources bound to it |
| `SPACE` | `spaceId` | The Space's Notes and its enabled Sources |
| `SELECTED_SOURCES` | `sourceIds` (1–50) | Exactly those Sources |
| `LIBRARY` | — | Everything the user owns; only after the user explicitly chooses it |

- `command` (optional) picks the task explicitly and skips classification:
  `ask` or `answer.grounded` for a cited answer, `practice` or
  `study.practice` for practice questions. Use it for buttons such as
  "Quiz me".
- Without a command, the server routes by keywords ("quiz me", "flashcards",
  "practice questions" → practice; questions → answer) or by the surface
  default. When the server's AI router is enabled, it may decide instead.

Responses:

- **`202`** `{ outcome: "JOB", created, job, decision }`. `decision` is
  `{ taskClass, source }`; `source` is `COMMAND`, `RULE`, `DEFAULT`, or
  `ROUTER`. `created: false` means this `Idempotency-Key` was already used for
  the same request: the original job is returned and nothing is charged again.
- **`200`** `{ outcome: "CLARIFICATION_REQUIRED", options }`. Two tasks were
  nearly tied; no job was created. Show `options[].description` as choices.
  Resend the **same** `text` and `scope` with `command` set to the chosen
  `options[].command`, `clarified: true`, and a **new** `Idempotency-Key`. The
  server never asks twice.

Errors: `400 INVALID_IDEMPOTENCY_KEY` (or body validation),
`403 AI_TIER_NOT_ALLOWED`, `404 NOTE_NOT_FOUND | SPACE_NOT_FOUND |
SOURCE_NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSED`, `422 CONTEXT_SCOPE_INVALID |
CONTEXT_SCOPE_TOO_LARGE | AI_TASK_UNKNOWN | AI_TASK_NOT_SUPPORTED |
AI_JOB_INPUT_INVALID`, `429 RATE_LIMITED` (with `Retry-After`; default a burst
of 10, then one every 6 seconds).

### Following a job

Poll `GET /v1/ai/jobs/{jobId}/events?after={nextAfter}` starting with
`after=-1`. Poll about every second at first, backing off to 3–5 seconds.
Each response is `{ status, events, nextAfter, done }`; pass `nextAfter` on
the next call and stop when `done` is `true`, then read the job once.

| Event | Show |
| --- | --- |
| `ACCEPTED` | "Starting…" |
| `STEP_STARTED` / `STEP_COMPLETED` (`data.step`) | "Searching your material…" then "Writing…" |
| `WAITING_TURN` | "Queued behind your other requests" (at most 2 run at once per user) |
| `DEFERRED` (`data.code`) | "Busy, retrying shortly"; keep polling |
| `COMPLETED` | Read the job and render the result |
| `FAILED` / `CANCELED` / `EXPIRED` | Read the job for `failureCode` |

Events carry codes and numbers, never text. If the user leaves the page, keep
the `jobId` (for example in the URL or local state) and resume polling later;
the job keeps running server-side.

### Results

`GET /v1/ai/jobs/{jobId}` returns `{ id, jobType, status, stepsCompleted,
result, failureCode, deadlineAt, createdAt, completedAt }`.

`jobType: "agent.grounded_answer"` → `result`:

```json
{
  "answer": "Photosynthesis releases oxygen [S1E1].",
  "sufficiency": "SUPPORTED",
  "citations": [
    { "ref": "S1E1", "manifestId": "...", "evidenceId": "E1",
      "sourceId": null, "noteId": "note:...", "page": null, "startMs": null }
  ]
}
```

`jobType: "agent.practice_questions"` → `result`:

```json
{
  "sufficiency": "SUPPORTED",
  "questions": [
    { "question": "What gas does photosynthesis release?",
      "answer": "Oxygen.",
      "citations": [ { "ref": "S1E1", "...": "..." } ] }
  ]
}
```

- `sufficiency` is `SUPPORTED`, `PARTIAL`, or `NOT_FOUND`. For `NOT_FOUND`
  show "Your material doesn't cover this" and suggest adding Sources or a
  wider scope; never present it as an answer. Practice questions are empty
  for `NOT_FOUND`.
- The answer may contain refs like `[S1E1]`. Turn each into a citation chip
  that matches `citations[].ref`; leave unknown brackets as text.
- Model text is untrusted: render as plain text or sanitized Markdown (no raw
  HTML, no auto-loaded images or links to unknown hosts).

### Citations

`GET /v1/ai/jobs/{jobId}/citations` returns `{ jobId, passages }`, one per
citation: `{ ref, sourceId, noteId, page, startMs, endMs, headingPath, text }`.
`text` is the passage exactly as the model saw it, so it still matches the
answer after the Source is edited. Use it for hover cards or a side panel, as
plain text. Link to the original the same way as Context preview locators:

- `noteId`: open the Note (scroll by heading if you have one);
- `sourceId` with `page`: open the PDF Asset at `#page=N`;
- `sourceId` with `startMs`: seek audio, or a YouTube link with `t=` seconds.

Passages are kept at least 30 days; after that they are omitted while the
answer remains. `404 AI_RESULT_NOT_READY` means the job is not completed.

### Cancel and allowance

- `POST /v1/ai/jobs/{jobId}/cancel` stops the job at its next step. Work
  already sent to a provider still finishes and is charged; its result is
  discarded. Cancelling a finished job returns it unchanged.
- `GET /v1/ai/allowance` returns `{ remainingUsd, limitedBy, resetsAt }`. It is
  an estimate for display ("AI limit reached; resets at 00:00 UTC"). A
  request can be refused before it reaches zero because each call reserves its
  worst case. `503 AI_ALLOWANCE_UNAVAILABLE`: hide the indicator.

### Job failure codes

| `failureCode` | Meaning | Client action |
| --- | --- | --- |
| `AI_DAILY_LIMIT_REACHED` | The user's (or the service's) daily AI spend is used up | Show the reset time from `/v1/ai/allowance`; disable AI actions |
| `AI_REQUEST_TOO_COSTLY` | The request would exceed the per-request ceiling | Suggest a narrower scope or shorter question |
| `AI_SCOPE_FORBIDDEN` | A Note, Space, or Source in the scope was deleted or archived while the job ran | Refresh the scope and ask again |
| `AI_REFUSED` | The model declined (safety) | Show a neutral message; do not retry automatically |
| `AI_CONTEXT_TOO_LARGE` | The material is too large even after compaction | Narrow the scope |
| `AI_INVALID_OUTPUT`, `AI_AGENT_STEPS_EXHAUSTED`, `AI_ATTEMPTS_EXHAUSTED` | The model could not produce a valid result within its limits | Offer "Try again" (a new request with a new key) |
| `AI_NO_ELIGIBLE_ROUTE`, `AI_PROVIDER_UNAVAILABLE`, `AI_ROUTE_DISABLED` | No AI provider could serve it (outage, or the material's classification allows none) | "AI is unavailable right now"; retry later |
| `AI_DEADLINE_EXHAUSTED` | It ran out of time | Offer "Try again" |
| `EXPIRED` status (no code) | Not finished within its deadline (10 minutes) | Offer "Try again" |

Treat unknown codes as a generic failure with "Try again".

### Do and don't

- Do generate one `Idempotency-Key` per user action and reuse it only for
  network retries of that action.
- Do keep the scope explicit and visible ("Searching: this Note").
- Do check `GET /v1/notes/{noteId}/index-status` or the Source's processing
  state when an answer is `NOT_FOUND` right after an upload: the content may
  not be searchable yet.
- Don't send `LIBRARY` scope by default.
- Don't put secrets or other people's personal data in `text`: it is sent to
  an AI provider.
- Don't render answer or passage text as HTML, or log it to analytics.

## Asset upload API

Canonical document nodes store `assetId` and display metadata only. They never
store file bytes, storage keys, session credentials, or presigned URLs.

### Reserve and upload

1. `POST /v1/assets/uploads` with `Idempotency-Key`:

   ```json
   {
     "filename": "diagram.png",
     "contentType": "image/png",
     "byteLength": 184320,
     "checksumSha256": "sha256:optional-64-lowercase-hex"
   }
   ```

   Maximum size is 250 MiB. The backend allowlists MIME types (images, PDF,
   MP3/MP4/OGG/WAV audio, plain text, Markdown, and `text/vtt` or
   `application/x-subrip` caption files) and chooses all object keys. Never
   accept an object key from UI state. Audio for transcription must be at most
   200 MiB and four hours by default; long recordings take several minutes.

2. The `201` response contains `assetId`, `uploadId`, `mode`, `expiresAt`, and
   signed `parts`. Single uploads have one part. Files above 16 MiB use 8 MiB
   multipart parts, up to 32 parts.
3. Upload each byte range directly to the exact returned URL with the exact
   returned headers. Do not add cookies or authorization headers to the
   storage request. Do not persist or log the URL.
4. For multipart, retain every provider ETag with its part number.
5. `POST /v1/assets/uploads/{uploadId}/complete` (`201`) with `{}` for a
   single upload, or `{ "parts": [{ "partNumber": 1, "entityTag": "..." }] }`
   for multipart.
6. Completion verifies stored length, type, and optional checksum before the
   asset becomes `ready`. The returned asset view contains `id`, `state`,
   `filename`, verified `contentType`, verified `byteLength`, checksum, and
   `readyAt`.

Interrupted uploads may be resumed only while their instructions are valid.
Otherwise abort and reserve a new upload. Completion is idempotent after the
asset is ready. Verification mismatch returns
`422 UPLOAD_VERIFICATION_FAILED` and quarantines the asset.

### Download and deletion

- `GET /v1/assets/{assetId}/download` returns a private five-minute download
  instruction for the owning user and a READY asset. Fetch it only when
  needed; never persist the signed URL.
- `DELETE /v1/assets/uploads/{uploadId}` aborts a pending upload and returns
  `204`.
- `DELETE /v1/assets/{assetId}` returns `204` for an unreferenced asset.
  `409 ASSET_IN_USE` means a canonical note still references it.

There is currently no public `GET /v1/assets/{assetId}` metadata endpoint.

## Import API

Imports are asynchronous durable jobs. Poll their status with backoff; do not
hold an HTTP request open.

### File import

Upload a file through the asset flow first. When the asset is READY:

`POST /v1/imports/files` with `Idempotency-Key`:

```json
{
  "sourceAssetId": "asset:...",
  "targetNoteId": "optional-existing-note-id"
}
```

This release accepts UTF-8 `text/plain` and `text/markdown` up to 10 MiB. It
does not perform OCR and does not parse active HTML, SVG, XML, archives, or
scripts. If `targetNoteId` is omitted, processing creates a new note.

### URL import

`POST /v1/imports/urls` accepts an HTTPS URL and optional target note, but only
when the separately isolated remote-fetch boundary is configured. The Nest API
never fetches a user URL. It encrypts the descriptor; the isolated service must
re-resolve DNS, block private/link-local/metadata destinations, validate every
redirect, pin the approved address, enforce byte/time limits, inspect magic
bytes, and write to quarantine.

Without that service, the endpoint fails closed with
`409 REMOTE_IMPORT_UNAVAILABLE`. Never replace this with `fetch(url)` inside a
controller, service, queue consumer, or frontend proxy.

### Status and cancellation

- `GET /v1/imports/{importId}` returns owner-scoped `id`, `sourceType`,
  lower-case `status`, `targetNoteId`, stable `errorCode`, `attempts`, and
  lifecycle timestamps. It never exposes source URLs or object keys.
- Terminal success is `completed`; terminal failure is `failed` with an
  `errorCode`. Poll while `queued` or `running` using bounded backoff.
- `DELETE /v1/imports/{importId}` returns `204` for queued/already-cancelled
  jobs. Running or terminal jobs return `409 IMPORT_NOT_CANCELLABLE`.

## Health probes

- `GET /v1/health/live` returns `200 { "status": "ok" }` when the HTTP process
  is alive. It does not prove dependencies are ready.
- `GET /v1/health/ready` performs PostgreSQL `SELECT 1` and Redis `PING`.
  It returns `503 SERVICE_DRAINING` or `DEPENDENCY_UNAVAILABLE` when traffic
  should not be routed to the instance.

Application UI should not poll these endpoints. They are for the load balancer,
deployment controller, and local diagnostics.

## Frontend state-machine checklist

- Maintain one persistent `clientId` per installation and a monotonic sequence
  per note/client.
- Persist pending logical operations and their transaction IDs before network
  submission.
- Remove pending work only after an applied server acknowledgement.
- Serialize sends per note; concurrency between unrelated notes is fine.
- On reconnect, validate the session, fetch the current checkpoint, replay or
  rebase pending work, then resume live edits.
- Treat all IndexedDB records, cached documents, filenames, MIME types,
  dimensions, URLs, revision numbers, and ownership IDs as untrusted hints.
- Never render imported HTML as trusted markup. Render only validated canonical
  nodes through known components.
- Never place presigned URLs, OTPs, cookies, note bodies, or document text in
  analytics and error logs.
- Keep request IDs and stable error codes in diagnostics so frontend and
  backend traces can be correlated without sensitive content.
- Persist the `jobId` of running AI jobs so polling resumes after a reload;
  stop polling when `done` is true.

## Private OpenAPI reference

With `API_DOCS_ENABLED=true`, open
`http://localhost:3002/v1/docs/`. The login uses developer-only
`API_DOCS_USERNAME` and `API_DOCS_PASSWORD`; never ship them in browser code or
URLs. The protected JSON schema is `/v1/docs/openapi.json`. Try-it-out is
disabled intentionally. The documentation password grants access to reference
material only, not user data or application endpoints.

When adding an endpoint, update its controller OpenAPI declaration and this
guide in the same change. Document request and response schemas, session and
capability requirements, limits, stable errors, idempotency, retry behavior,
side effects, and explicit frontend dos and don'ts.
