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
- personal and shared **Notes** and immutable canonical revisions;
- shared notes: grants, email invitations, shared-with-me, and view-only
  share links;
- live collaboration over Liveblocks rooms (join flow, saved sync,
  rotation, usage meter) and server-side comments;
- notifications: the merged bell, comment email preferences, and mutes;
- agents in shared notes (mentions, presence, proposal review);
- typed, idempotent note transactions for autosave and offline reconnect;
- direct private asset uploads to MinIO locally or R2 in production;
- passive text/Markdown file imports and isolated HTTPS URL-import jobs;
- personal Spaces, reusable Library Sources, and explicit Note context bindings;
- Context indexing status, processing controls, and evidence preview;
- the AI assistant: cited answers and practice questions over the user's own
  material, run as background jobs with progress events (`/v1/ai/*`);
- quizzes generated from the user's material, with live progress, attempts
  and server-side grading (`/v1/artifacts/*`, `/v1/artifact-jobs/*`,
  `/v1/quizzes/*`, `/v1/quiz-attempts/*`);
- BASIC flashcard decks with generation, answer reveal, reviews and scheduling
  (`/v1/flashcard-decks/*` and the shared artifact reads);
- public liveness and readiness probes.

The following are not implemented public contracts yet: team workspaces,
the tutor, study guide, roadmap and lesson plan artifacts,
streaming AI chat, search, billing, exports, and public asset metadata. Do
not invent calls to the planned endpoints in `api-contract.md`. In this
release, a Note, Space, and Library Source belong directly to the
authenticated Better Auth user. Sharing grants access; ownership never moves.

## Where requests go

| Request                                                                                                                                                                                                                                                                                                                                                  | Browser destination                  | Why                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/api/auth/*`                                                                                                                                                                                                                                                                                                                                            | public web origin                    | The Node web server adds the signed, short-lived client identity required by the backend auth boundary. |
| `/v1/notes/*`, `/v1/spaces/*`, `/v1/library/*`, `/v1/context/*`, `/v1/ai/*`, `/v1/artifacts/*`, `/v1/artifact-jobs/*`, `/v1/quizzes/*`, `/v1/quiz-attempts/*`, `/v1/assets/*`, `/v1/imports/*`, `/v1/note-invitations/*`, `/v1/shared/*`, `/v1/liveblocks/*`, `/v1/notifications/*`, `/v1/notification-preferences`, `/v1/email/*`, `/v1/entitlements/*` | same-origin web proxy to the backend | Keeps session cookies first-party and prevents CORS and proxy-secret mistakes.                          |
| Presigned upload URL                                                                                                                                                                                                                                                                                                                                     | the exact returned MinIO/R2 URL      | Upload bytes directly; do not proxy file bodies through NestJS.                                         |
| `/v1/health/*`                                                                                                                                                                                                                                                                                                                                           | backend or service origin            | Public infrastructure probes; no session required.                                                      |

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

### Waitlist and gated sign-up

While `SIGNUP_MODE=waitlist` (the production default), only an email whose
waitlist entry is approved can create an account, by email OTP or Google.
Existing accounts sign in as before.

- Join: `POST /v1/waitlist` with `{ "name": "Ada Lovelace", "email":
"ada@example.com" }`. No session; call it through the web origin so the
  request carries the signed client identity (unsigned calls get
  `403 UNTRUSTED_PROXY`). Success is always `202 { "status": "joined" }`,
  whether or not the email was already listed, so the form must not say
  "already on the list". The first join queues one confirmation email; repeats
  send nothing. Limits: 5 joins per IP (refilling one a minute) and 3 per email
  (one per ten minutes); on `429 RATE_LIMITED` wait for `Retry-After`.
  `503 WAITLIST_UNAVAILABLE` means retry later.
- Unapproved email OTP: `POST /api/auth/email-otp/send-verification-otp` for an
  email with no account and no approval returns `403 { "code":
"WAITLIST_ONLY" }` and sends no email. Show the waitlist form instead of the
  OTP screen.
- Unapproved Google: the callback redirects to the error page with
  `error=WAITLIST_ONLY` (the web app sends that to `/auth?error=WAITLIST_ONLY`).
- Approval is operator-only (`/v1/internal/waitlist`, never from a browser) and
  emails an invite that links to `/auth`.

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
allowed origin. A note belongs to its owner; there is no `workspaceId`.
Owners share notes with collaborators (see Sharing and live collaboration
API); strangers get `404 NOTE_NOT_FOUND` on every note route — treat it as
"no access", never as "note missing".

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
- Send at most 1,000 valid `@incantly/canvas-core` operations per request.
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

### Page setup, headers and footers

Page layout is ordinary document data. There is no page-layout endpoint:
change it through the two save paths above, and read it back from
`GET /v1/notes/{noteId}/checkpoint` (or a historical revision).

- `metadata.pageSetup` (mode, size, orientation, margins, `headerDistance`,
  `footerDistance`, `mirroredMargins`, `startingPageNumber`, `columns`): send a
  `setPageSetup` transaction operation, or save a full checkpoint. Every field
  you send comes back exactly as sent, including `mirroredMargins: false`; the
  server does not fill in defaults you left out. Unknown `pageSetup` keys are
  dropped, as the SDK does.
- `metadata.layout` (sections with `default`/`first`/`odd`/`even` headers and
  footers): `@incantly/canvas-core` 0.3.0 has no transaction operation for it, so
  save a full checkpoint (`PUT /v1/notes/{noteId}/checkpoint`) after a header
  or footer change. Keep sending the layout on every later checkpoint; a
  checkpoint without `metadata.layout` removes it.
- `metadata.research` (title, authors, abstract, keywords, language,
  citation style) is kept the same way.

The server validates the layout in depth and answers
`422 INVALID_NOTE_DOCUMENT` with `issues[].path` under `$.metadata.layout`
when it breaks a rule:

- `layout.version` is `1`; `defaultSection` is required; `sections` holds at
  most 1,000 sections with unique `id`s (1–128 characters);
- each section's `pageSetup` follows the same rules as `metadata.pageSetup`
  (columns 1 or 2, `startingPageNumber` at least 1, margins 0–10,000 pt);
- a header or footer variant holds at most 100 items, counting each inline
  field as one item. An item is a `paragraph` node (text, marks and links
  follow the normal paragraph rules) or, in the older form, a field item;
- a field is `{ "type": "field", "field": ..., "format": ... }`, whose
  `field` is `pageNumber`, `pageCount`, `documentTitle` or `currentDate` and
  whose optional `format` is a string of at most 64 characters. Fields take
  no marks or other keys;
- no other keys anywhere in the layout, and no images or other media in
  headers or footers.

An empty variant (`"first": []`) is kept and means "nothing on that page",
for example no header on the first page.

Put fields inside the paragraph text (preferred):

```json
{
  "default": [
    {
      "id": "node:footer:page",
      "type": "paragraph",
      "attrs": { "alignment": "center" },
      "content": [
        { "type": "text", "text": "Page " },
        { "type": "field", "field": "pageNumber" },
        { "type": "text", "text": " of " },
        { "type": "field", "field": "pageCount" }
      ]
    }
  ]
}
```

The older form, field items next to the paragraphs
(`[paragraph "Page ", field, paragraph " of ", field]`), is still accepted and
returned unchanged, because existing notes may have it. Write new layouts in
the inline form.

Inline fields are valid only inside header and footer paragraphs. A field in
the note body (`document.content`) is rejected with
`422 INVALID_NOTE_DOCUMENT` on a checkpoint save, or
`422 INVALID_NOTE_TRANSACTION` in a transaction.

Do:

- build headers and footers with the SDK layout builders and save the whole
  document;
- treat calculated page breaks as view state, recomputed on load.

Don't:

- store calculated page breaks, page counts or rendered header text in the
  document;
- expect header or footer text in search results or in the note assistant's
  view of the note: page chrome is not indexed.

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
- On a shared note, restore replaces the live room content (connected
  clients see it at once) and delete cuts every grant holder's access
  immediately. See Sharing and live collaboration API for both.

### Trash and retention

Delete is soft first, then permanent. `DELETE /v1/notes/{noteId}` (owner
only, `204`) marks the note deleted; a background worker purges it after
the retention window. There is no API to purge early or to cancel a purge
except restoring first.

Endpoints:

- `DELETE /v1/notes/{noteId}` — soft-delete (owner only). `204` on
  success. Strangers and unknown IDs read as `404 NOTE_NOT_FOUND`.
- `GET /v1/notes/trash?limit=25&cursor=...` — the owner's trash, newest
  first, `{ items, nextCursor }` like note lists. Each item is note
  metadata plus `deletedAt` and `purgeAt`. A garbage cursor is
  `400 INVALID_CURSOR`.
- `POST /v1/notes/{noteId}/restore` with an empty or missing body —
  restores a soft-deleted note to live (`200` with the live note
  metadata). This is the trash restore; the same route with
  `{ "sourceRevisionId": "..." }` is a revision restore on a live note
  instead.

The 30-day window:

- A deleted note stays restorable for `NOTE_RETENTION_DAYS` (default 30
  days) after `deletedAt`. Each trash item carries its own `purgeAt`
  (`deletedAt` plus the retention window); show the countdown from that
  value, not from a client-computed date.
- A restore attempted after expiry still succeeds while the row exists:
  restore wins races against the purge. Past `purgeAt`, treat the note
  as gone at any moment.

What delete does immediately:

- The note leaves note lists, Spaces (a home-note pointer is cleared),
  and search.
- Every grant holder loses API access at once, their live connections
  are cut, pending invitations stop listing and accepting, share-link
  views fail, and AI jobs scoped to the note fail with
  `AI_SCOPE_FORBIDDEN`.
- Grants and invitations are kept, only their access is cut. Nothing is
  deleted yet.

What restore keeps:

- Grants and invitations survive the soft delete untouched, so a trash
  restore brings collaborators back automatically: room access is
  re-mirrored and search indexing is re-scheduled. Never re-invite
  people after a restore.
- A restore always lands on `active`: the pre-delete state (active vs
  archived) is not tracked, so re-archive from there when needed.
- A restored note becomes searchable again after the normal reindex
  window (edits pause for about a minute), not instantly.

What the purge removes:

- The note row, its revisions, checkpoint objects, Yjs recovery
  snapshots, and any quarantine snapshot: no restorable content
  survives. Grants, invitations, and share links go with the note.
- Library Sources that cite a revision keep their versions with the
  provenance link cleared; asset bytes are never deleted (only the
  note's references drop).
- After the purge, every route answers `404 NOTE_NOT_FOUND`. The note ID
  is safe to forget client-side.

Error and retry rules:

- Restoring a live note returns `409 NOTE_NOT_DELETED`. In particular, a
  trash restore retried after success answers `409`, so confirm with
  `GET /v1/notes/{noteId}` metadata instead of retrying blindly.
- A revision restore (`sourceRevisionId`) on a soft-deleted note returns
  `404 NOTE_NOT_FOUND`: restore from the trash first, then restore the
  revision.
- Strangers, unknown IDs, and purged notes all return `404
  NOTE_NOT_FOUND`; never distinguish them in the UI.

Do:

- remove the note from active UI, cached lists, and its collaboration
  cache (room, presence, pending live state) after a `204` delete.
- show the trash only to the owner, with each item's `purgeAt`.
- confirm a `409 NOTE_NOT_DELETED` with a metadata read before showing
  an error.
- refetch collaborators and live status after a restore; access returns
  on its own.

Don't:

- retry a trash restore on `409`, or a revision restore on a deleted
  note on `404`: the stable code says what to do instead.
- re-invite collaborators after a restore, or treat restored access as a
  new share.
- cache a deleted note as permanently gone before its purge: it can come
  back until the worker removes it.
- offer trash, restore, or delete actions to non-owners.

## Sharing and live collaboration API

Owners share notes with collaborators who edit, comment, or view live
through a Liveblocks room, or through saved sync when live is paused.
Every route below is cookie-authenticated (except `GET /v1/shared/{token}`),
every mutation is Origin-checked, and path IDs are bounded
(`400 INVALID_RESOURCE_ID`). Every operation's request, response, and stable
error codes are in `/v1/docs`.

### Capabilities at a glance

| Role      | Read | Comment | Edit | Manage sharing / delete |
| --------- | ---- | ------- | ---- | ----------------------- |
| Owner     | yes  | yes     | yes  | yes                     |
| Editor    | yes  | yes     | yes  | no                      |
| Commenter | yes  | yes     | no   | no                      |
| Viewer    | yes  | no      | no   | no                      |

Only the owner opens the share dialog in manage mode. Any grant holder may
list collaborators (read-only).

### Sharing endpoints

- `GET /v1/notes/{id}/grants` — active grants and pending invitations.
  Invited emails appear only for the owner; grant holders see names and
  avatars. No emails, tokens, or hashes anywhere else.
- `POST /v1/notes/{id}/grants` + `Idempotency-Key` (8–128 chars) with
  `{ email, role }` (`VIEWER` | `COMMENTER` | `EDITOR`, uppercase).
  A verified user gets a grant; anyone else gets an invitation email.
  Returns `201 { type: "grant", grant }` or `201 { type: "invitation",
invitation }`. Re-posting the same person and role is a no-op (`200`);
  re-posting with another role changes it.
- `PATCH /v1/notes/{id}/grants/{grantId}` with `{ role }` — owner only.
- `DELETE /v1/notes/{id}/grants/{grantId}` — the owner revokes any grant; a
  holder passes their own grant id to leave (`{ left: true }`).
- `DELETE /v1/notes/{id}/invitations/{invitationId}` — owner revokes a
  pending invitation (`204`). To change an invited role: revoke, then post
  again.
- `GET /v1/note-invitations` — my pending invitations (verified email only).
- `POST /v1/note-invitations/{invitationId}/accept` (empty body) — accept
  one listing; single-use; the signed-in verified email must match the
  invited one. The invitation email links to `/invitations` with no token:
  route it to a signed-in list with one accept button per invitation.
- `GET /v1/notes/shared-with-me?cursor=&limit=` — my active grants, newest
  first, cursor-paginated like note lists. Treat it as the shared-notes
  list; poll it like any cursor list, not the grants of each note.
- `POST /v1/notes/{id}/share-links` with `{ expiresAt? }` (ISO 8601, ≤ 365
  days out, defaults to 365 days when omitted) — owner only.
  `201 { id, token, capability: "VIEW", expiresAt }`. Links always expire.
  The token is returned once and cannot be listed again.
- `DELETE /v1/notes/{id}/share-links/{linkId}` — owner revokes (`204`).
- `GET /v1/shared/{token}` — public, no session. View-only latest
  checkpoint `{ note, revision, document }` for reading only. Render it
  read-only: no editor, no live connection, no transaction or comment
  calls. It never joins the room.

Sharing errors: `403 COLLABORATOR_LIMIT_REACHED` (`{ limit, used,
upgrade }`) means the owner's plan caps people per note (Free: 1) — show
upgrade UI. `422 SHARE_TARGET_INVALID` means the address is the owner's
own, malformed, or belongs to an unverified account — explain inline.
Surface `403 INVITATION_EMAIL_MISMATCH` ("sign in with the invited
address") distinctly from `404 INVITATION_INVALID` (expired, revoked,
already used). Do not retry `POST /grants` with a changed body under the
same `Idempotency-Key`: it returns `409 IDEMPOTENCY_KEY_REUSED`. Mint a
new key. Do not re-accept an invitation: the second accept returns
`INVITATION_INVALID`, which is final. Do not assume a collaborator count
from the grants list for limit math: the limit counts active grants plus
pending invitations server-side. Do not trust a cached role after any
grant mutation: refetch collaborators (roles, revocations, and leaves
apply immediately).

### Joining live

1. `GET /v1/notes/{noteId}/live-status` before connecting.
   - `{ mode: "live", roomId }` → authorize and connect.
   - `{ mode: "saved_sync", reason, resetsAt? }` → do not connect; use
     saved sync (below). Reasons: `NOT_SHARED` (use the note API),
     `GUARD_PAUSED`, `BUDGET_EXHAUSTED`.
   - `offlineEnabled` tells the client whether it may enable Liveblocks
     offline persistence. Gate offline mode on this flag; never enable it
     locally ahead of the server.
2. `POST /v1/liveblocks/authorize` with `{ noteId }` → `{ token, roomId }`.
   - The ID token (TTL **1 hour**) authenticates the Liveblocks client.
   - **Always re-read `roomId`.** After a revocation rotation the room ID
     changes (`note:{noteId}:{generation+1}`); the old connection is
     dropped.
3. Enter the room with the Liveblocks React/Tiptap provider.

On success the client joins exactly one room per open tab and reuses it
across editor, comments, and presence — never one connection per
component.

| Authorize outcome                                                                   | Client behavior                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `409 NOTE_NOT_SHARED`                                                               | Use the note API (transactions/checkpoint), not live.                                                                                                                                                                                                                                    |
| `429 LIVE_COLLABORATION_LIMIT_REACHED`                                              | Saved sync until `resetsAt`. Owner sees an upgrade option; others see "Live cursors are paused until {date}. Your changes still save."                                                                                                                                                   |
| `503 LIVE_COLLABORATION_PAUSED` (guard) / `LIVE_COLLABORATION_UNAVAILABLE` (outage) | Saved sync; retry after `Retry-After`.                                                                                                                                                                                                                                                   |
| Room error / disconnect at any time                                                 | Re-authorize, then rejoin the returned `roomId`, or fall back to saved sync. This is also the rotation path: expect a drop, re-authorize within a second or two, keep unsent Yjs operations (they merge on rejoin), and show "Reconnecting…" only if rejoining takes more than a second. |
| Liveblocks connection refused with code **4005**                                    | The note is full (10 connections including extra tabs). Show "This note is full (10 people)" and use saved sync; do not pre-count connections client-side (presence rows can race).                                                                                                      |
| `ACCESS_CHANGED` room event                                                         | Re-authorize at once. A removed user's client closes the note and clears its local collaboration cache.                                                                                                                                                                                  |
| `RESTORED` room event                                                               | Show who restored and when ("Ada restored the version from 14:05").                                                                                                                                                                                                                      |

Sessions are never cut server-side: budgets and guards apply on join and
token refresh, never mid-session. Close the note and clear its
collaboration cache when the room drops access (revocation) or the note
reads `404` after delete.

Required client settings:

- Visible tab: leave the room after **10 minutes** with no local activity
  (typing, selection, scrolling, pointer movement in the note) **and** no
  incoming remote changes. Someone watching others type stays live.
- Hidden tab: leave after **3 minutes** via `backgroundKeepAliveTimeout`
  (off by default in Liveblocks — set it).
- Rejoin on next interaction or when the tab becomes visible, without a
  reload.
- Presence throttling: cursor at most every 50 ms, selection on change
  only.
- One room per tab; share the room across editor, comments, and presence.

### Saved sync (when live is paused)

- Do not connect. Send edits as note transactions
  (`POST /v1/notes/{noteId}/transactions`); the server applies them into
  the room, so live users see them instantly.
- Poll checkpoint metadata with `If-None-Match` every 5 s while the tab is
  visible, and on focus. A 304 costs almost nothing.
- Comments go through `POST /v1/notes/{noteId}/comments`.
- When the budget resets or the guard reopens, join the room again; the
  room already holds every saved-sync edit.

### The one rule for shared notes

A shared note has exactly one live state: its Yjs room. Every write to a
shared note goes through the room — live edits, saved-sync transactions,
restores, imports and agent edits. The canonical head is always a
checkpoint of the room. Nothing writes past the room, and whole-document
`PUT /v1/notes/{noteId}/checkpoint` on a shared note returns
`409 USE_TRANSACTIONS`.

Transactions keep their contract: `transactionId` + `clientId` +
`localSequence` idempotency, exact-retry acknowledgement, and the existing
`409 NOTE_TRANSACTION_CONFLICT` body with `currentRevisionId` /
`currentRevisionNumber`. One divergence: a replayed room-applied
transaction acknowledges the live head, which a checkpoint may have
advanced since the first acknowledgement — treat the replay's revision as
newer-or-equal, not identical. The acknowledgement carries the current
head revision. The change is in the room immediately and lands in a
revision at the next checkpoint (automatic: 3 minutes quiet, 10 minutes
max, room empty, or an explicit save). On a saved-sync conflict, poll the
checkpoint until your own change is visible (or back off briefly) before
rebasing: a checkpoint for your own uncheckpointed change may still be
pending, and rebasing on a head that lacks it conflicts again. This
resolves itself within seconds. Page setup (`setPageSetup`) keeps working
through transactions on shared notes; it advances the head directly and is
never lost to a checkpoint. A transaction mixing page setup with content
is not atomic: the setup lands first, and if the room write then fails,
the exact retry conflicts on the stale base — rebase on the new head and
resend. Additions that would push the room past 8 MB return
`413 ROOM_DOCUMENT_TOO_LARGE`: split the note or attach files instead.

`GET /v1/notes/{noteId}/checkpoint` supports `ETag` / `If-None-Match`.
Poll with the validator every 5 seconds while the tab is visible, and on
focus. A `304` is cheap (no object read). Send `If-None-Match: <etag>`
and, on `200`, store the new `ETag` and reconcile against the returned
revision.

`GET /v1/notes/{noteId}` adds a `collaboration` object on notes with a
room: `roomId` (the authoritative room ID — always re-read it after
rotation), `checkpointHealth` (`healthy` | `quarantined`, owner only),
and the tracked Yjs size as `roomSizeBytes` / `roomSizeWarning`.
`quarantined` means recent room changes failed validation, the head did
not advance, and an operator was alerted. Show the owner "Some recent
changes couldn't be saved". It heals on the next successful checkpoint.
At 6 MB (`roomSizeWarning`) warn and suggest splitting the note; at 8 MB
large additions are rejected. Do not treat `checkpointHealth`, `roomId`, or
presence as authorization. Reference owner `READY` assets only in shared
notes: any other asset state fails validation at checkpoint.

### Save now and named versions

`POST /v1/notes/{noteId}/checkpoints` (`{ name? }`) checkpoints
immediately plus a provider safety-net version. It returns the revision,
`checkpointCreated` (false when the room was unchanged), `providerVersion`
(false only on a provider outage, which never fails the save), and the
echoed `versionName`. The optional `name` (1–140 chars) labels a
user-named version: it is persisted on the new revision and echoed; on an
unchanged room no revision is written, so there the echo is the only
record — read the label back from the revision's `versionName`. On an
unshared note it returns `409 NOTE_NOT_SHARED` (save with `PUT` instead).
On invalid room content it returns `422 INVALID_NOTE_DOCUMENT` and the
note quarantines.

### Restore and recover on shared notes

`POST /v1/notes/{noteId}/restore` (`{ sourceRevisionId }`) on a shared
note checkpoints the replaced state first, then replaces the room content
with the old revision (keeping its node IDs), records a `RESTORE`
revision, and broadcasts `RESTORED`. Everyone connected sees the note
change at once; show who restored and when ("Ada restored the version
from 14:05"). Edits made offline before the restore merge on top when
they reconnect; say so in the UI. A concurrent restore returns
`409 RESTORE_IN_PROGRESS`: wait and retry. Local unsynced edits based on
the old head are stale afterwards. If the source converts to empty room
content, the room gains a filler paragraph the `RESTORE` revision itself
does not contain, so the next checkpoint mints one extra revision holding
the filler.

After offline loss, `POST /v1/notes/{noteId}/recover` (`{ document }`)
stores the client-held canonical document as a separate recovered
revision (negative revision number in the history, parented on the head).
The head is untouched (`headUnchanged: true`) and nothing is applied over
the room. Show the recovered version beside the head and let the user
re-apply its content through transactions (or restore it wholesale via
the restore endpoint). Re-apply promptly: recovered revisions follow
normal retention. `422` codes are the usual document errors
(`INVALID_NOTE_DOCUMENT`, `NOTE_ID_MISMATCH`,
`NOTE_CHECKPOINT_TOO_LARGE`, `INVALID_ASSET_REFERENCE`). The local
canonical copy is recovery material only: `recover` is the only path for
it — never upload it over the room, and proposal review needs the API, so
it is unavailable offline.

### Version history on shared notes

The history panel lists `NoteRevision` rows: origin `collaboration`
means a checkpoint of the room (`createdBy` empty; list its
contributors), kind `manual` on an explicit save, else `autosave`. Origin
`restore` means a restore; the pre-checkpoint just below it holds the
replaced state. Negative revision numbers are recovered versions. Named
versions carry their label on the revision's `versionName`; list it in
the history next to the revision. Revisions older than the owner's
`versionRetentionDays` (3 / 30 / 90 for Free / Pro / Max) are pruned,
never the head or the last known-good checkpoint.

Editor engineers: the backend parses and patches rooms with a server-side
copy of the editor schema
(`src/modules/collaboration/document/tiptap-schema.ts`, currently
`tiptap-3.31.3+1`), kept at the same `@tiptap/*` version as the web app.
Mirrored: the restricted StarterKit (link with http/https/mailto/tel, no
openOnClick/autolink/linkOnPaste), Underline, TextAlign
(heading/paragraph, left/center/right), the custom doc/text/paragraph/
heading nodes, stock blockquote/lists extended with `id`, checklist,
code (lowlight, same languages), details (persist), block/inline math
(no input rules), stock table with the custom rows/cells, all asset and
embed nodes, the table schema roles, and the TextStyle/Color/Font/
Highlight/Citation/InlineMathMark marks. Not mirrored (schema-neutral):
placeholder, file handler, search, shortcuts, pagination, clipboard and
handle extensions, all NodeViews, and the ID-repair plugin — the server
validates strictly and quarantines instead.
When the editor schema changes (a node, mark, attribute or content
expression), the backend mirror, the adapter (`document-adapter.ts`), and
the server docs must change in the same release, or checkpoints of the
new content quarantine. Node IDs must stay stable across every edit path;
media nodes carry `assetId` plus display metadata only, never bytes or
URLs — the server drops unknown attributes and rejects unknown nodes and
marks. A details summary is plain text in the canonical document: any live
styling (bold, links) applied to a summary in the room is dropped at
checkpoint, where the summary is rebuilt by joining its text.

### Comments

Live comments go through the Liveblocks provider. Without a live
connection, `POST /v1/notes/{noteId}/comments` with
`{ threadId?, paragraphs, anchor? }` creates a thread or a reply through
the server (saved sync):

- Requires the `comment` capability (`NOTE_ACCESS_DENIED` for viewers)
  and the comment policy (`COMMENTS_NOT_ALLOWED` when the owner's plan or
  the app-wide backstop refuses; `COMMENT_LIMIT_REACHED`, 429 with
  `resetsAt`, when the Free owner's monthly budget is used).
- `paragraphs` is paragraphs of `text` / `mention` / `link` inlines.
  Mention `userId`s are bare Incantly user IDs (no `user:` prefix) and
  must share the note (`COMMENT_MENTION_INVALID` otherwise); only offer
  the mention suggestions from
  `GET /v1/notes/{noteId}/mention-suggestions?q=`. `agent:…` mentions
  start the agent flow (below).
- Limits: 50 paragraphs, 100 inlines each, 4000 characters total, 20
  mentions, http(s) links only (`COMMENT_BODY_INVALID` on violation).
- `anchor` (new threads only) is bounded thread metadata (≤16
  string/number/boolean values). Unknown `threadId`s are 404
  `THREAD_NOT_FOUND`.
- Requires `Idempotency-Key` (8–128 characters, unique per logical
  comment). Retrying with the same key and body returns the stored comment
  (200) instead of creating a duplicate; reusing the key with another body
  is 409 `IDEMPOTENCY_KEY_REUSED`. Always retry with the same key.
- On `LIVE_COLLABORATION_UNAVAILABLE` (503) retry with backoff and the
  same key; the comment is counted once per comment ID, so a retried
  create never double-counts the budget.

`POST /v1/liveblocks/users` (`{ userIds }`, ≤50) backs `resolveUsers`.
Strangers are silently omitted; cache briefly.
`GET /v1/notes/{noteId}/mention-suggestions?q=` backs
`resolveMentionSuggestions` (owner, grant holders, enabled agents; ≤10;
prefix match). Debounce keystrokes; cache per note. Someone without
access cannot be mentioned — the share dialog is the way to add them.
`userInfo` (name, avatar, color) is display state only; the server never
trusts roles or permissions from presence.

### Notifications

Two systems produce in-app notifications, and the bell shows both:

| Source           | Covers                                                           | API                                           |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Liveblocks inbox | Comments, replies, reactions, mentions (`thread`, `textMention`) | Liveblocks hooks (`useInboxNotifications`, …) |
| Incantly inbox   | Shares, invitations, AI notices, the 80% live-minutes notice     | `GET /v1/notifications` (cursor-paginated)    |

- Render one bell with a combined unread count. Marking read is per
  system: `POST /v1/notifications/{id}/read` or
  `POST /v1/notifications/read-all` for Incantly rows; the Liveblocks
  hooks for Liveblocks rows.
- Incantly payloads hold IDs only (`noteId`, `grantId`, `actorUserId`,
  `role`, …). Resolve titles, names, and avatars through authorized reads
  (note metadata, `POST /v1/liveblocks/users`); never render payload
  fields as titles or text.
- Another user's notification ID, or a missing one, answers 404
  `NOTIFICATION_NOT_FOUND`. Treat it as "gone", not as an error to retry.

Comment email is a fallback for missed activity, not a copy of every
event: Liveblocks waits its unread delay after a comment event and only
then sends the server a `notification` webhook — if the inbox
notification is still unread. So: mentioned in a comment, mentioned in
text, a reply in a followed thread, or a new comment on an owned note →
one email each, at most; read-in-app activity during the delay window
produces no email. Every email carries who, where, and a link — "Ada
mentioned you in _Biology notes_" with a "View comment" button — and
never comment or note text. Thread links are
`/notes/{noteId}?thread={threadId}`; implement the `thread` query param
to scroll to and highlight the thread. Share emails ("Ada shared _Biology
notes_ with you") are Incantly emails, not Liveblocks notifications, and
go through the same pipeline (access and preference re-checks at send
time). Invitation emails skip preference checks (the recipient has no
account yet); the worker re-checks that the invitation is still pending
and the note still live.

Preferences UI:

- `GET /v1/notification-preferences` returns `{ emailEnabledAll, notes,
threads }`. Absent rows mean email enabled.
- `PATCH /v1/notification-preferences` with `{ emailEnabled }` toggles
  all collaboration email. Offer this as the master switch.
- `PUT` / `DELETE /v1/notes/{noteId}/mute` mutes one note;
  `PUT` / `DELETE /v1/notes/{noteId}/threads/{threadId}/mute` mutes one
  thread. Mutes suppress email only; the in-app inbox is unaffected.
- Muting needs read access to the note (`NOTE_NOT_FOUND` otherwise), so
  only offer mute actions on notes and threads the user can open.
- Every email carries a one-click unsubscribe link for its scope (one
  thread, one note, or — for invitations — declining the invitation).
  `GET /v1/email/unsubscribe?token=…` is the email link (HTML
  confirmation, no session needed); `POST` is the mailbox one-click
  action. Surface the same scopes in the preferences UI.

Operators: email timing is configured in the Liveblocks dashboard, not in
code — enable the `thread` and `textMention` webhook kinds and set the
notification email delay to 10–30 minutes. Why the range: a shorter
delay emails faster but also emails activity the user was about to read;
longer than 30 minutes makes mentions feel lost.

### Usage meter

`GET /v1/entitlements/usage` shows the caller's plan, live minutes and
comments used as a note owner, limits, `resetsAt`, and the upgrade hint.
Poll at most once a minute while the meter is visible; do not compute
percentages locally. (Merges into `GET /v1/billing/usage` when billing
lands.) Limited owners also get a one-shot
`collaboration.live_budget_80` in-app notice at 80% of their live
minutes.

### Agents in shared notes

The web app mentions agents, shows their progress, and reviews their
edits. Agents add no HTTP endpoints: the mention flow is webhook-driven,
and proposal review reuses the existing AI endpoints.

Mention flow:

1. The mention suggestions
   (`GET /v1/notes/{noteId}/mention-suggestions?q=`) include enabled
   agents alongside people. Render them distinctly (name + "AI agent"
   label); their IDs are `agent:{id}` (currently only `agent:incantly`).
2. The user mentions the agent in a comment or a text mention, live or
   through `POST /v1/notes/{noteId}/comments` in saved sync. The comment
   text is the request: at least 2 characters besides the mention, at
   most 2000.
3. The server starts exactly one run per mention comment. Requirements,
   all server-checked: the commenter holds the `comment` capability on
   the note, and the commenter's own AI allowance is not exhausted. When
   either fails, no run starts and no reply is posted — the comment
   simply stands.
4. The run is owned by the commenter: it reads the note through the
   sharing policy, may search the commenter's material, and stores edit
   proposals the commenter reviews.

Parameters the client controls: the comment body (comment limits: ≤50
paragraphs, ≤4000 characters, ≤20 mentions) and the mentioned agent ID.
Everything else (note, thread, author, allowance) comes from the session
and the server. Do not offer agent mentions to users without the
`comment` capability; the server ignores them. Do not start a run
client-side: there is no endpoint for it — a mention comment is the only
trigger. Do not retry a mention by re-posting the comment: each comment
starts its own run. Edit-and-re-mention intentionally instead.

While the run works, the agent shows server-side presence in the room:
`{ status, jobId }` with the agent's name and color. Statuses: `reading`,
`searching`, `drafting`, `complete`, `failed` (`applying` is reserved for
a future milestone; render it like `drafting` if it ever appears). Render
it like a collaborator ("Incantly is drafting…"), with the `jobId`
available for lookups through the API. Presence is display state only: it
can lapse and resume without affecting the run — never treat a missing
presence as a failed run, as authorization, or as a job-health signal.
Milestones come from the run's job events, not from presence webhooks.
Poll the job (owner-scoped: only the commenter can follow it) for
progress and the final result. The agent's working time counts toward the
note owner's live minutes from the job record; the client reports
nothing.

When the run settles, the agent replies once in the originating thread:
its answer, plus a pointer when it suggested edits ("I suggested N edits
— review them in the note."). A failed run posts a short notice and
changes nothing. Replies arrive as normal thread comments: no special
rendering, no extra fetch. Replies are deduplicated server-side per run:
a redelivery never posts twice, and each mention in a thread gets its own
reply. When the comment policy refuses comments on the note, or the room
rotates mid-run (the old room 404s), the reply is skipped or orphaned —
but the run's result stays in its AI job and any proposals stay
reviewable. Tell the commenter to open their proposals if they expected a
reply. Mention comments created while offline, in saved sync, or live all
start runs identically once they reach the server.

The commenter reviews the run's proposals through the existing proposal
endpoints. Accepting or undoing on a shared note applies into the live
room: connected clients see the change at once. Only the commenter (the
run's owner) can review its proposals. Other collaborators see accepted
edits land live, exactly like human edits. New outcomes on a shared note:

- `503 LIVE_COLLABORATION_UNAVAILABLE` (room writer unreachable): wait for
  `Retry-After`, then retry the decision. Nothing was applied.
- `413 ROOM_DOCUMENT_TOO_LARGE`: the room is at its size limit; the
  change cannot apply — suggest splitting the note.
- `409` conflict: `RESTORE_IN_PROGRESS` means a restore holds the room —
  retry shortly. Otherwise re-read the proposal; conflicting changes
  settle `STALE` and the rest can be decided again.
- A change adding an image settles `STALE` only when the asset is not the
  note owner's ready image (checkpoints check assets against the note
  owner). Images already in the note apply normally.

| Agent outcome                                    | Client behavior                                                                                                                                          |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mention with <2 characters of request            | No run starts. Prompt for an actual request ("Ask Incantly to summarize, rewrite, …").                                                                   |
| Mention by a viewer, or after access was revoked | No run starts. Viewers must be granted comment or edit first.                                                                                            |
| Commenter's AI allowance exhausted               | No run starts. Point at the AI allowance page.                                                                                                           |
| Expected reply missing                           | The run may still be working (up to its deadline), the comment policy refused the reply, or the room rotated mid-run — open the run's proposals instead. |

### Collaboration dos and don'ts

Do:

- send a fresh `Idempotency-Key` per share click, and reuse the same key
  when retrying the same click (network failure, timeout). A `200` replay
  is success; keep the invitation id from the first `201`.
- route the invitation email link (`/invitations`) to a signed-in list
  with one accept button per invitation.
- poll the checkpoint with `If-None-Match`; do not refetch the body
  blindly.
- back off on a saved-sync conflict until your change is visible.
- reference owner `READY` assets only in shared notes.
- show the quarantine notice to the owner, and the 6 MB warning to
  everyone.
- merge both inboxes into one bell; resolve Incantly payload IDs through
  authorized reads; deep-link threads with `?thread=`; offer note/thread
  mutes where the user reads; honor 429 `Retry-After` everywhere.
- show agent presence like a collaborator, with its current milestone;
  send users to their proposals when a reply points at suggested edits.

Don't:

- store session or OAuth tokens in localStorage or IndexedDB (cookies
  only), or put share-link tokens in URLs you log — read the token from
  the link once, then keep it in memory. (Invitation links carry no
  token.)
- show invited emails to non-owners: the API omits them, and the UI must
  not fetch or fuse them from elsewhere.
- send `role` in lowercase or invent roles: only `VIEWER`, `COMMENTER`,
  `EDITOR` validate.
- `PUT` a checkpoint on a shared note; do not upload a local canonical
  copy over the room — `recover` is the only path for it.
- treat `checkpointHealth`, `roomId`, or presence as authorization.
- render payload or inbox fields as document text; offer mentions outside
  the suggestion list; retry `COMMENT_BODY_INVALID` or
  `COMMENT_MENTION_INVALID` without changing the body.
- link anonymous visitors to the live room: share links are API reads,
  and anonymous users never hold a connection.

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

| `kind`               | Origin field                            | Notes                                                                                                               |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `FILE`               | `assetId`                               | An owned `READY` Asset: text, Markdown, PDF, Word (`.docx`), or PowerPoint (`.pptx`)                                |
| `AUDIO_TRANSCRIPT`   | `assetId`, `transcriptionConsent: true` | A verified `audio/*` Asset; consent is required (`422 TRANSCRIPTION_CONSENT_REQUIRED`)                              |
| `YOUTUBE_TRANSCRIPT` | `assetId`, `youtubeUrl`                 | A caption file Asset (`text/vtt` or `application/x-subrip`) plus the video URL or ID (`422 YOUTUBE_VIDEO_REQUIRED`) |
| `WEB_PAGE`           | `url`                                   | An HTTPS page; `409 REMOTE_IMPORT_UNAVAILABLE` where the isolated fetch boundary is not deployed                    |
| `NOTE_REVISION`      | `noteRevisionId`                        | An owned immutable Note revision                                                                                    |
| `PASTED_TEXT`        | `text`                                  | Up to 512 KiB of UTF-8 text                                                                                         |

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
- PDFs, Word and PowerPoint files, web pages, YouTube captions, and audio
  stay `PROCESSING` while
  `processingStage` moves through `QUEUED_FOR_PROCESSOR`, `FETCHING` (web),
  `PARSING`, `TRANSCRIBING` (audio), and `NORMALIZING`. Audio can take a few
  minutes; poll with backoff and show the stage.
- `PARTIALLY_READY` is usable but incomplete; `partialReason` says why
  (`PDF_PAGE_LIMIT`: only the first pages were parsed; `PAGES_SKIPPED`: some
  pages could not be read in time, listed in `provenance.skippedPages`, and
  the rest is searchable; `SLIDE_LIMIT`; `WEB_CONTENT_LIMIT`;
  `TRANSCRIPT_INCOMPLETE`: part of a long recording could not be
  transcribed).
- Images stay at `processingStage: "AWAITING_PROCESSOR"`: OCR is not offered.
  Show them as "added, not searchable". Scanned PDFs fail with
  `PDF_NO_TEXT_LAYER` for the same reason.
- `FAILED` versions carry a stable `failureCode`, for example
  `PDF_NO_TEXT_LAYER` (scanned PDF), `PDF_ENCRYPTED`, `PDF_TOO_LARGE`,
  `DOCUMENT_TOO_COMPLEX` (the file took too long or too much memory to read),
  `DOCUMENT_UNREADABLE`, `DOCUMENT_NO_TEXT`, `DOCUMENT_TOO_LARGE`,
  `AUDIO_TOO_LARGE`, `AUDIO_NOT_SPLITTABLE` (a long M4A/OGG; MP3 and WAV
  recordings of any length up to the limit are split automatically),
  `AUDIO_DURATION_LIMIT`, `TRANSCRIPTION_DISABLED`,
  `TRANSCRIPTION_POLICY_RESTRICTED` (a `RESTRICTED` Source is never sent to an
  external transcription provider), `CAPTIONS_INVALID`, `WEB_PAGE_NO_TEXT`, or
  a boundary code such as `REMOTE_IMPORT_REJECTED`.
- `QUARANTINED` versions failed a content check (the bytes are not what the
  upload claimed, a malformed PDF or Office file (`PDF_MALFORMED`,
  `DOCUMENT_MALFORMED`), or a disallowed web content type). They are
  not retryable. A failed or quarantined Source never changes the original
  Asset, which stays downloadable through its Note.
- Each version also returns `assetId`, `youtubeVideoId`, and `provenance`
  (`processor`, `pageCount`, `pagesParsed`, `skippedPages`,
  `pagesWithoutText`, `slideCount`, `hiddenSlides`, `durationMs`, `coverage`,
  `host`, `fetchedAt`, `documentTitle`). `documentTitle` is untrusted display
  text.

User copy for the common outcomes:

| Code                                  | Status            | Message                                                                  |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `PAGES_SKIPPED`                       | `PARTIALLY_READY` | "We couldn't read pages {skippedPages}. The rest of this file is ready." |
| `PDF_PAGE_LIMIT`                      | `PARTIALLY_READY` | "Only the first 500 pages were added."                                   |
| `SLIDE_LIMIT`                         | `PARTIALLY_READY` | "Only the first 1,000 slides were added."                                |
| `PDF_NO_TEXT_LAYER`                   | `FAILED`          | "This PDF is a scan with no readable text."                              |
| `PDF_ENCRYPTED`                       | `FAILED`          | "This file is password protected. Remove the password and upload again." |
| `PDF_MALFORMED`, `DOCUMENT_MALFORMED` | `QUARANTINED`     | "This file seems damaged. Try re-saving or re-exporting it."             |
| `DOCUMENT_TOO_COMPLEX`                | `FAILED`          | "This file took too long to read. Try splitting it into smaller files."  |
| `DOCUMENT_NO_TEXT`                    | `FAILED`          | "This file has no text we can read."                                     |

### Folder uploads (many files at once)

Use the batch endpoints for a dropped folder or a multi-select of files
(up to 50 files, 2 GiB in total per batch; each file still at most 250 MiB):

1. `POST /v1/assets/uploads/batch` with `Idempotency-Key` and
   `{ "items": [ { "filename", "contentType", "byteLength" }, ... ] }`.
   The `200` response has one entry per file, in order:
   `{ index, ok: true, reservation }` or `{ index, ok: false, status, code }`
   (for example `422 ASSET_TYPE_NOT_ALLOWED` for an `.exe`). A rejected file
   never blocks the others; show it as "not supported".
2. Upload the accepted files straight to storage, 4–6 at a time, exactly as
   for single uploads, and `complete` each one as soon as its bytes are up.
3. `POST /v1/library/sources/batch` with a new `Idempotency-Key` and
   `{ "items": [ { "kind": "FILE", "assetId", "title"?, "spaceIds"? }, ... ] }`
   once the Assets are ready. Results are per item like step 1.
4. Poll each Source's `GET /v1/library/sources/{id}/processing` with backoff
   (start at 1 s). Enable "Ask about this file" as soon as
   `index.searchReadiness` is `KEYWORD`; show progress toward `FULL` with
   `index.embeddedPassageCount / index.passageCount`.

Retrying a batch with the same `Idempotency-Key` and body returns the same
reservations or Sources and finishes any item that failed transiently. Both
endpoints are rate limited per user (`429` with `Retry-After`).

Files are processed in parallel, a few per user at a time; the rest wait
their turn, so one large folder never slows other users. When the user asks
the AI about files that are still processing, those files move to the front
of that user's queue, and the agent says which files were not ready yet.

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

Both return `{ searchReadiness, lexicalReady, vectorReady, building,
indexedVersion, passageCount, embeddedPassageCount, failureCode }`.
`searchReadiness` is `NONE`, `KEYWORD` (keyword search works and the AI can
already answer from the file), or `FULL` (semantic search too). Keyword
search arrives first, typically within seconds of the upload completing;
semantic search follows. A Note is reindexed after its edits
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

| `scope`            | Required fields                   | Searches                                    |
| ------------------ | --------------------------------- | ------------------------------------------- |
| `SELECTION`        | `noteId`, `nodeIds`               | Exact selected nodes, plus the Note scope   |
| `NOTE`             | `noteId`                          | The Note and its context bindings           |
| `SELECTED_SOURCES` | `sourceIds`                       | Exactly those Sources                       |
| `SPACE`            | `spaceId` (+ `includeSpaceNotes`) | Enabled Space Sources and the Space's Notes |
| `CUSTOM`           | `noteIds` and/or `sourceIds`      | That explicit combination                   |
| `LIBRARY`          | —                                 | Every usable Note and Source                |

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
becomes a background **job**: submit, follow its events (poll or stream), then
show the result. Jobs are durable: they keep running when the user's network
drops or the tab closes, and the user can find them again later.

All routes are cookie-authenticated; `POST` routes are Origin-checked. Jobs
belong to the session user: another user's job is a `404 AI_JOB_NOT_FOUND`.

The agent never reads whole files. Over a Space or the Library it first looks
at the files in scope with their outlines (headings with page spans), then
searches, narrowed to the right file and pages when it can, and reads the
exact pages it needs, so a question over ten 300-page PDFs costs a few
thousand tokens. Citations name the file and page (or slide) either way. If
some files in scope are still processing, the answer says so and uses the
others; ask again once they are ready for a complete answer.

| Operation         | Route                                             | Notes                                                        |
| ----------------- | ------------------------------------------------- | ------------------------------------------------------------ |
| Ask               | `POST /v1/ai/requests`                            | `Idempotency-Key` required; rate limited per user            |
| List jobs         | `GET /v1/ai/jobs`                                 | Newest first, summaries only; filter by status or Note/Space |
| Read a job        | `GET /v1/ai/jobs/{jobId}`                         | `result` only when `COMPLETED`                               |
| Follow progress   | `GET /v1/ai/jobs/{jobId}/events?after=-1`         | Poll; stop when `done`                                       |
| Follow live       | `GET /v1/ai/jobs/{jobId}/stream`                  | Server-sent events; resumes from `Last-Event-ID`             |
| Mark opened       | `POST /v1/ai/jobs/{jobId}/seen`                   | Idempotent                                                   |
| Pending approvals | `GET /v1/ai/jobs/{jobId}/approvals`               | When `WAITING_APPROVAL`                                      |
| Decide            | `POST /v1/ai/jobs/{jobId}/approvals/{toolCallId}` | `{ decision, stateVersion }`; rate limited                   |
| Cited passages    | `GET /v1/ai/jobs/{jobId}/citations`               | Completed jobs only                                          |
| Cancel            | `POST /v1/ai/jobs/{jobId}/cancel`                 | Idempotent                                                   |
| Allowance         | `GET /v1/ai/allowance`                            | Today's remaining AI spend (estimate)                        |

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

| `scope.kind`       | Required           | Searches                                                            |
| ------------------ | ------------------ | ------------------------------------------------------------------- |
| `NOTE`             | `noteId`           | The Note and the Sources bound to it                                |
| `SPACE`            | `spaceId`          | The Space's Notes and its enabled Sources                           |
| `SELECTED_SOURCES` | `sourceIds` (1–50) | Exactly those Sources                                               |
| `LIBRARY`          | —                  | Everything the user owns; only after the user explicitly chooses it |

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

| Event                                                          | Show                                                                 |
| -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `ACCEPTED`                                                     | "Starting…"                                                          |
| `STEP_STARTED` / `STEP_COMPLETED` (`data.step`)                | "Thinking…" while no tool is running (prefer the tool events below)  |
| `TOOL_STARTED` / `TOOL_FINISHED` (`data.tool`, `data.outcome`) | One line per tool call; see "Assistant activity"                     |
| `WAITING_TURN`                                                 | "Queued behind your other requests" (at most 2 run at once per user) |
| `DEFERRED` (`data.code`)                                       | "Busy, retrying shortly"; keep polling                               |
| `COMPLETED`                                                    | Read the job and render the result                                   |
| `FAILED` / `CANCELED` / `EXPIRED`                              | Read the job for `failureCode`                                       |

Events carry codes and numbers, never text. If the user leaves the page, the
job keeps running server-side. Keep the `jobId` (for example in the URL) and
resume polling later; if it is lost, find the job again with `GET /v1/ai/jobs`.

#### Assistant activity (tool events)

Agent jobs (questions, the note assistant, practice questions) emit one
`TOOL_STARTED` and one `TOOL_FINISHED` per tool call, so the chat can show a
live list of what the assistant did:

```
✓ Read your note (2 blocks)
✓ Searched your material (3 passages)
… Preparing suggested edits
```

- `TOOL_STARTED.data`: `{ step, callId, tool, effect }`.
- `TOOL_FINISHED.data`: `{ step, callId, tool, effect, outcome, reason?, …counts }`.
- `callId` pairs the two events of one call (it is the call's ID). Draw a
  spinner on `TOOL_STARTED` and replace it with ✓ (or a muted line) on the
  `TOOL_FINISHED` with the same `callId`.
- `effect` is `read`, `propose`, `write`, or `external`.
- `outcome` is `ok`, `refused` (the tool declined, for example an invalid
  block ID; the assistant usually corrects itself and calls it again), or
  `failed`. `reason` is a code, present only when the outcome is not `ok`.
- `seq` always increases but is not contiguous (some state changes write no
  event): never treat a gap as a lost event. An empty `Last-Event-ID` header
  counts as none.
- Events arrive in `seq` order with the other events, on both
  `GET …/events?after=` and the SSE stream, and a client resuming with
  `after=<seq>` or `Last-Event-ID` gets the ones it missed.

| `tool`               | Suggested label                                  | Count fields on `TOOL_FINISHED` (`outcome: ok`)                                                                |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `read_note_blocks`   | "Reading your note"                              | `blocks` (shown), `totalBlocks`                                                                                |
| `knowledge_search`   | "Searching your material"                        | `evidence` (passages), `sufficiency` (`SUFFICIENT`, `PARTIAL`, `AMBIGUOUS`, `NOT_FOUND`, `STALE`, `FORBIDDEN`) |
| `library_overview`   | "Looking through your library"                   | `files`, `totalFiles`, `processing`                                                                            |
| `read_pages`         | "Reading pages" (not used by the note assistant) | `evidence`, `truncated` (boolean)                                                                              |
| `propose_note_edits` | "Preparing suggested edits"                      | `changes`                                                                                                      |
| `web_search`         | "Searching the web"                              | `results`                                                                                                      |
| `read_web_page`      | "Reading a web page"                             | `chars`                                                                                                        |
| `web_task`           | "Researching on the web"                         | `sources`                                                                                                      |
| `list_images`        | "Looking through your images"                    | `images`                                                                                                       |

`propose_note_edits` refusal reasons: `invalid_markdown`,
`unsupported_markdown`, `invalid_link`, `invalid_math`, `invalid_image`,
`unknown_asset`, `too_large`, `not_markdown`, `unknown_block`, `invalid_change`,
`does_not_apply`, `invalid_note`, `open_limit`, `too_many_changes`,
`old_revision`, `revision_not_found`, `not_note`. A refusal is not an error
to show: the assistant either retries or says in its answer that it could not
prepare the edit. Other reasons: `rejected` (the user declined an approval),
`AI_APPROVAL_EXPIRED`, `AI_TOOL_TIMED_OUT`, and tool error codes for `failed`.

Rules:

- Show an unknown `tool` as a generic "Working…": new tools must never break
  the list. Ignore count fields you do not know.
- Data is codes and numbers only (never queries, note text, passages, URLs,
  or model output), so it is safe to show and to log.
- Hidden tools never produce events: the final answer tools
  (`submit_answer`, `submit_questions`). Calls refused before they start (an
  unavailable tool, invalid arguments, a used-up budget) produce none either.
- A tool that needs approval emits `TOOL_STARTED`, then `APPROVAL_REQUESTED`,
  then, once decided, `TOOL_FINISHED` (`outcome: refused`, `reason:
rejected` when declined). An external tool emits `TOOL_STARTED`,
  `TOOL_WAITING`, then `TOOL_FINISHED` and `TOOL_RESUMED`.
- When a job ends with `CANCELED` or `EXPIRED`, a call that was still running
  gets no `TOOL_FINISHED`: treat the terminal event as the end of every open
  line.
- `STEP_*` events are unchanged; show "Thinking…" between tool calls.

### Coming back: lists, seen, and live progress

- `GET /v1/ai/jobs?status=&jobType=&subjectKind=&subjectId=&cursor=&limit=`
  returns `{ jobs, nextCursor }`, newest first. Each summary is `{ id, jobType,
status, subject, failureCode, seenAt, createdAt, completedAt }`; read the
  result with `GET /v1/ai/jobs/{jobId}`. `subject` is `{ kind: NOTE | SPACE |
SOURCES | LIBRARY, id }`, set by the server from the scope. Use
  `subjectKind=NOTE&subjectId={noteId}` for "answers about this Note".
  Page with `cursor=nextCursor` until it is null.
- "Answered while you were away": `status=COMPLETED` jobs with `seenAt: null`.
  Call `POST /v1/ai/jobs/{jobId}/seen` when the user opens one.
- `GET /v1/ai/jobs/{jobId}/stream` pushes the same events as the events
  endpoint (`id` = `seq`, `event` = type, `data` = the event). It closes with
  `done` once the job is terminal, or `timeout` after two minutes. Use
  `EventSource` with credentials: it reconnects with `Last-Event-ID`, so no
  event is lost or repeated. On error, fall back to polling. A user can hold
  three streams at once (`429 RATE_LIMITED` beyond that).
- The stream is sent with `Cache-Control: no-cache, no-store, no-transform`.
  If the web app proxies it (a Next.js route or rewrite), the proxy must pass
  it through unbuffered and uncompressed; otherwise every event arrives at
  once when the job ends.
- If the user lost access to the Note or Space a finished job ran over,
  `result` is `null` and `resultWithheld` is `true`.

### Web search (opt-in)

Send `webSearch: true` with `POST /v1/ai/requests` only when the user chose
it (for example a "Search the web too" toggle). When the server has a web
vendor configured, a cited answer may then also search the public web for
what the user's material does not cover. The question goes to the vendor; the
user's material never does. Web citations look like
`{ "ref": "W1R2", "kind": "web", "url": "https://…", "title": "…" }`.

- Make links **only** from `citations[].url`, with `rel="noopener noreferrer"`.
  Show any other URL in the answer text as plain text, and never load images
  or remote content from it: web pages can try to make the model leak private
  text through links.
- Render `title` as plain text.
- Without a configured vendor the flag changes nothing.

### `/search` and `/research`

The slash commands only set two fields; the server chooses vendors and limits.

| Command | Body fields |
|---|---|
| `/search <question>` | `webSearch: true`, `webScope: "web"` |
| `/research <question>` | `webSearch: true`, `webScope: "papers"` |

`webScope` is ignored without `webSearch: true`. Never send a vendor, URL, or
limit. The job echoes `webScope`.

Paper citations add a `paper` object:

```json
{
  "ref": "W1R2", "kind": "web", "url": "https://www.semanticscholar.org/paper/…",
  "title": "…",
  "paper": {
    "authors": ["…"], "year": 2024, "venue": "…", "citedBy": 120,
    "doi": "10.…", "arxivId": "2401.01234", "pdfUrl": "https://…"
  }
}
```

- Every `paper` field is optional. Render authors, year, venue, DOI, and arXiv
  ID as plain text. Do not build `doi.org` or `arxiv.org` links from them.
- Links come only from `url` and `paper.pdfUrl`, with `rel="noopener noreferrer"`.
- Search runs inside shared, free vendor allowances. When it is busy or used
  up for the day, the answer comes from the user's material and the
  `web_search` tool activity ends with `reason` `AI_WEB_RATE_LIMITED` or
  `AI_WEB_QUOTA_EXHAUSTED`. Show "Search is busy right now, so I answered from
  your material". Never retry the job automatically for this.
- A user may make a limited number of web tool calls per minute; past it the
  assistant continues without web search.

### Approvals (WAITING_APPROVAL)

Some agents can propose an action that changes the user's data or uses an
outside service. The job then pauses in `WAITING_APPROVAL` (event
`APPROVAL_REQUESTED`) until the user decides:

1. `GET /v1/ai/jobs/{jobId}/approvals` returns `{ jobId, stateVersion,
approvals: [{ toolCallId, tool, preview: { title, changes[] }, expiresAt }] }`.
   Show the preview as plain text and ask the user. Never approve on their
   behalf.
2. `POST /v1/ai/jobs/{jobId}/approvals/{toolCallId}` with `{ "decision":
"approve" | "reject", "stateVersion": <from step 1> }`. The job resumes:
   `approve` runs exactly the previewed action once; `reject` continues
   without it.
3. `409 AI_JOB_STATE_CHANGED`: reload the job and its approvals. Repeating the
   same decision is safe. There is no "approve all": one decision per action.

Unanswered approvals fail the job with `AI_APPROVAL_EXPIRED` (72 hours by
default). Cancelling the job withdraws its pending approvals. A job can also
pause in `WAITING_TOOL` while an outside service works; keep following it.

### Note edit suggestions (note assistant)

Design: `docs/agent-note-edits.md`.

1. **Ask about selected text.** Send `POST /v1/ai/requests` with
   `surface: 'note'`, `scope: { kind: 'NOTE', noteId }`, and
   `selection: { revisionNumber, ranges: [{ nodeId, from, to }] }`. Use the
   block IDs and UTF-16 offsets from the editor; never send the selected
   text. A selection without a `command` runs the note assistant
   (`agent.note_assist`). `command: 'edit'` runs it without a selection.
   A selection with another scope is `422 AI_SELECTION_NEEDS_NOTE`.
   The server preloads the note at `revisionNumber` and the selected text
   for the assistant, so an edit usually finishes in one or two model calls
   and its activity list shows only "Preparing suggested edits" (no
   "Reading your note" or search step unless the request asks to use the
   learner's material).
2. **Show the answer.** When the job completes, `result` is
   `{ answer, citations, proposalIds }`.
3. **Draw the suggestions.** `GET /v1/notes/{noteId}/proposals` lists open
   proposals: `{ id, summary, fromUntrusted, baseRevisionNumber, expiresAt,
changes: [{ id, kind, nodeId?, baseText?, text?, position?, blocks?,
texts?, nodeIds?, baseTexts?, state, reason?, undoable }] }`. Load it
   again when the note opens.
   - Draw each change as a **decoration**, never as document content, so
     autosave cannot submit it.
   - For `editText`, diff `baseText` against `text` word by word. Outline
     `insertBlocks`, `deleteBlock`, and `moveBlock`.
   - `insertBlocks` and `replaceBlocks` carry `blocks`: canonical note blocks
     of any type Markdown can express (paragraphs, headings, lists,
     checklists, tables, quotes, code, math with `latex`, rules, images by
     `assetId`), with bold, italic, strike, code, links, and inline math.
     Draw them read-only with the same renderer as the note (math with
     KaTeX; images through the asset routes) as the preview, and fall back
     to `texts` for a block you cannot draw. Never put them into the editor
     document; links stay unclickable until accepted.
   - `replaceBlocks` replaces the blocks `nodeIds` (their text when read is
     `baseTexts`): strike or dim those blocks and show the new `blocks` in
     their place. When one block becomes one of the same type it keeps its
     ID.
   - Show an unknown `kind` as a generic change with Accept/Reject only.
   - Render all text as text. Label `fromUntrusted` proposals "includes web
     content".
   - If the block in the editor no longer matches `baseText`, show the change
     as possibly stale; the server decides.
4. **Accept or reject.** Send
   `POST /v1/notes/{noteId}/proposals/{proposalId}/decisions` with
   `{ accept?: ['c1'], reject?: ['c2'], all?: 'accept' | 'reject' }`.
   - The response gives each change's `state` (`ACCEPTED`, `REJECTED`,
     `STALE` with `reason`, `EXPIRED`, `UNDONE`) and `currentRevisionNumber`.
   - Load the note at that revision; do not reapply the change locally.
   - For a `STALE` change, offer "Ask the assistant to redo this part": a new
     request with that block selected.
   - Retrying is safe. On `409 NOTE_PROPOSAL_DECISION_IN_PROGRESS`, retry
     shortly. `409 NOTE_PROPOSAL_EXPIRED` means the proposal expired.
5. **Undo.** Send
   `POST /v1/notes/{noteId}/proposals/{proposalId}/changes/{changeId}/undo`
   for a change with `undoable: true`. If the block changed since,
   `409 PROPOSAL_UNDO_STALE` is returned: offer restoring an earlier revision.
   - **Ctrl+Z / Cmd+Z.** Right after an accept, and until the user types
     again, Ctrl+Z (Cmd+Z on macOS) and the editor's Undo button must call
     this endpoint for the accepted change(s), newest first, then load
     `currentRevisionNumber`.
   - **Keep the accept out of the editor's own history.** Load the accepted
     revision with `addToHistory: false`, so the editor's local undo never
     reverts it on its own. A local revert would be saved as an ordinary user
     edit, and the server would still show the change as accepted.
   - **Accept all.** After "Accept all", one Ctrl+Z undoes every change that
     request accepted: call undo for each, in reverse order.
   - **Once the user edits again,** Ctrl+Z goes back to the editor's normal
     undo. The change stays undoable from its own Undo control while the block
     is unchanged.
   - **An undone change is closed.** It shows as `UNDONE` and is not shown as
     a suggestion again.
6. **History.** Accepted changes and undos are revisions with
   `origin: 'ai'`. Show them as "Edited by AI, accepted by you".

### Results

`GET /v1/ai/jobs/{jobId}` returns `{ id, jobType, status, stateVersion,
stepsCompleted, result, resultWithheld, failureCode, subject, webAllowed,
seenAt, deadlineAt, createdAt, completedAt }`.

`jobType: "agent.grounded_answer"` → `result`:

```json
{
  "answer": "Photosynthesis releases oxygen [S1E1].",
  "sufficiency": "SUPPORTED",
  "citations": [
    {
      "ref": "S1E1",
      "manifestId": "...",
      "evidenceId": "E1",
      "sourceId": null,
      "noteId": "note:...",
      "page": null,
      "startMs": null
    }
  ]
}
```

`jobType: "agent.practice_questions"` → `result`:

```json
{
  "sufficiency": "SUPPORTED",
  "questions": [
    {
      "question": "What gas does photosynthesis release?",
      "answer": "Oxygen.",
      "citations": [{ "ref": "S1E1", "...": "..." }]
    }
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

| `failureCode`                                                            | Meaning                                                                              | Client action                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `AI_DAILY_LIMIT_REACHED`                                                 | The user's (or the service's) daily AI spend is used up                              | Show the reset time from `/v1/ai/allowance`; disable AI actions |
| `AI_REQUEST_TOO_COSTLY`                                                  | The request would exceed the per-request ceiling                                     | Suggest a narrower scope or shorter question                    |
| `AI_SCOPE_FORBIDDEN`                                                     | A Note, Space, or Source in the scope was deleted or archived while the job ran      | Refresh the scope and ask again                                 |
| `AI_REFUSED`                                                             | The model declined (safety)                                                          | Show a neutral message; do not retry automatically              |
| `AI_CONTEXT_TOO_LARGE`                                                   | The material is too large even after compaction                                      | Narrow the scope                                                |
| `AI_INVALID_OUTPUT`, `AI_AGENT_STEPS_EXHAUSTED`, `AI_ATTEMPTS_EXHAUSTED` | The model could not produce a valid result within its limits                         | Offer "Try again" (a new request with a new key)                |
| `AI_NO_ELIGIBLE_ROUTE`, `AI_PROVIDER_UNAVAILABLE`, `AI_ROUTE_DISABLED`   | No AI provider could serve it (outage, or the material's classification allows none) | "AI is unavailable right now"; retry later                      |
| `AI_DEADLINE_EXHAUSTED`                                                  | It ran out of time                                                                   | Offer "Try again"                                               |
| `AI_APPROVAL_EXPIRED`                                                    | Nobody approved or rejected the proposed action in time                              | Offer "Try again"                                               |
| `AI_TOOL_TIMED_OUT`                                                      | An outside service did not finish in time                                            | Offer "Try again" later                                         |
| `EXPIRED` status (no code)                                               | Not finished within its deadline (10 minutes)                                        | Offer "Try again"                                               |

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

## Quizzes API

A quiz is a **learning artifact** generated from the user's own material.
Generation runs in the background: request it, follow it live (or poll), then
let the user take the quiz as **attempts**. Grading is done by the server in
code; it never calls a model and costs nothing. Question types today:
single choice (3–5 options) and true/false.

All routes are cookie-authenticated; mutations are Origin-checked. Every
resource belongs to the session user: another user's quiz, generation or
attempt is `404`.

| Operation                   | Route                                                 | Notes                                      |
| --------------------------- | ----------------------------------------------------- | ------------------------------------------ |
| Generate                    | `POST /v1/artifacts/generations`                      | `Idempotency-Key`; `202`; rate limited     |
| Follow live                 | `GET /v1/artifact-jobs/{jobId}/stream`                | Server-sent events                         |
| Read a generation (polling) | `GET /v1/artifact-jobs/{jobId}`                       | Fallback for the stream                    |
| Cancel a generation         | `POST /v1/artifact-jobs/{jobId}/cancel`               | Idempotent                                 |
| List artifacts              | `GET /v1/artifacts?type=QUIZ&cursor=…`                | 50 per page; archived hidden by default    |
| Read an artifact            | `GET /v1/artifacts/{artifactId}`                      | Status, current version, latest generation |
| Versions                    | `GET /v1/artifacts/{artifactId}/versions`             | Newest first                               |
| Read a version's questions  | `GET /v1/artifacts/{artifactId}/versions/{versionId}` | No answers                                 |
| Replace questions           | `POST /v1/artifacts/{artifactId}/regenerations`       | `Idempotency-Key`; new version             |
| Archive                     | `POST /v1/artifacts/{artifactId}/archive`             | Idempotent                                 |
| Delete                      | `DELETE /v1/artifacts/{artifactId}`                   | Permanent                                  |
| Start an attempt            | `POST /v1/quizzes/{quizId}/attempts`                  | `Idempotency-Key`                          |
| Attempt history             | `GET /v1/quizzes/{quizId}/attempts`                   | Newest 50                                  |
| Resume an attempt           | `GET /v1/quiz-attempts/{attemptId}`                   | Questions and saved answers                |
| Save answers                | `PUT /v1/quiz-attempts/{attemptId}/answers`           | Merge; safe to retry                       |
| Submit                      | `POST /v1/quiz-attempts/{attemptId}/submit`           | `Idempotency-Key`; graded once             |
| Result                      | `GET /v1/quiz-attempts/{attemptId}/result`            | Only after submit                          |

`quizId` is the artifact ID. Decks use the same artifact list, metadata, version,
archive and delete routes; see the flashcard flow below.

### Flashcards

New generations also accept `preferences.cardTypes`: any non-empty unique
subset of `BASIC`, `REVERSE`, `CLOZE`. Omit it to keep BASIC. `itemCount`
counts facts, from 5 to 40. A REVERSE fact becomes two cards, so a deck can
contain up to 80 review cards; due pages still contain at most 40.

REVERSE fronts include `pairId` and `direction` (`FORWARD` or `REVERSE`).
Each direction has its own card ID and schedule. Both prompts are visible
in the deck: the other direction's prompt is intentionally the answer to
this direction. Replacing either direction replaces both, resetting their
schedules while preserving every unchanged card's schedule. Select either
ID; selecting both still generates one replacement pair.

CLOZE fronts contain exactly one `[[c1]]` marker and `clozeIds: ["c1"]`.
Render it as a blank; do not render artifact strings as HTML. Reveal returns
`back` and `clozeAnswers: { "c1": "omitted text" }`. Fronts, due pages and
previews never include that mapping. Reviews use the same rating/state-version
contract for every type and never call AI. Existing v1 decks remain readable.

All routes require the session cookie. Mutations also need an allowed Origin
and `Idempotency-Key`. Another user's deck, version or card is `404`.

| Action | Route | Result |
| --- | --- | --- |
| Generate | `POST /v1/flashcard-decks/generations` | `202 { created, generation }` |
| List decks | `GET /v1/artifacts?type=FLASHCARD_DECK` | Same artifact pagination/lifecycle as quizzes |
| Read fronts | `GET /v1/artifacts/{deckId}/versions/{versionId}` | Version metadata and `deck: { schemaVersion, title, cards[] }` |
| Due cards | `GET /v1/flashcard-decks/{deckId}/due?limit=20&cursor=…` | `{ deckId, versionId, policyVersion, items[], nextCursor }` |
| Flip a card | `GET /v1/flashcard-decks/{deckId}/versions/{versionId}/cards/{cardId}` | Front, `back`, and citation locations |
| Review | `POST /v1/flashcard-decks/{deckId}/reviews` | Review ID, version/card IDs, policy and next schedule |
| Replace cards | `POST /v1/flashcard-decks/{deckId}/regenerations` | `202`; body `{ "cardIds": ["c1"] }`, 1–8 unique IDs |

Generate with the same `scope` as a quiz, and optional `preferences` containing
`title`, `topic`, `language` (default `en`), `difficulty` (default `MIXED`) and
`itemCount` (5–40, default 20). No `type` or quiz-specific options are needed:

```json
{
  "scope": { "kind": "SELECTED_SOURCES", "sourceIds": ["source-id"] },
  "preferences": { "topic": "network protocols", "itemCount": 6 }
}
```

Follow `/v1/artifact-jobs/{id}` or its SSE stream. Deck generations have
`type: FLASHCARD_DECK`, `progress.cardsReady` and preview batches with `cards`
(slot, card type, front, difficulty). Their legacy `questions` array is empty.
Previews are provisional: validation can remove cards. On `COMPLETED`, fetch
the final version, then due cards. Every front contains `id`, `type`, `front`,
nullable `hint`, `difficulty`, `conceptKey`, and `tags`. Due items also carry
`dueAt`, nullable `reviewedAt`, and `stateVersion`. Backs appear only in the
explicit reveal response. Render all text as text or sanitized Markdown.

Pass `nextCursor` unchanged to continue the due list (1–40 per page). It pins a
cutoff and version. Cards becoming due after that cutoff wait for a fresh list;
cards reviewed during paging can disappear. Refresh on
`409 FLASHCARD_VERSION_CHANGED`; malformed cursors are
`400 FLASHCARD_CURSOR_INVALID`. An unfinished deck returns
`409 FLASHCARD_DECK_NOT_READY`. Archived decks remain readable/practisable;
deletion stops reads immediately and queues file/history cleanup.

After revealing the answer, submit the learner's rating with the version and
state version from the due response:

```json
{
  "versionId": "version-id",
  "cardId": "c1",
  "rating": "GOOD",
  "elapsedMs": 1800,
  "expectedStateVersion": 0
}
```

Elapsed time is 0–3,600,000 ms. The server picks review time; clients cannot
choose the next date. The deterministic `flashcard-intervals-v1` policy is:

| Rating | Next interval |
| --- | --- |
| AGAIN | 1 minute; reset successful-review streak |
| HARD | At least 10 minutes, or previous interval × 1.2 rounded; keep streak |
| GOOD | 1 day when streak is zero; otherwise at least 3 days or previous interval × 2 |
| EASY | At least 4 days or previous interval × 3 |

Intervals are capped at 365 days. GOOD/EASY advance the streak. The response
contains `schedule: { dueAt, reviewedAt, intervalMinutes, successStreak,
stateVersion }`. This is a simple versioned policy, not FSRS or SM-2.

Retry a lost response with the same key and identical body: it returns the
original review without changing the schedule again, including after a newer
deck version exists. Different input with that key returns
`409 IDEMPOTENCY_KEY_REUSED`. A new submission with an old card state returns
`409 FLASHCARD_REVIEW_CONFLICT`; a new submission against an old deck version
returns `409 FLASHCARD_VERSION_CHANGED`. Refresh the due list and let the
learner review the current card. Do not automatically submit a second rating.

Replacement retries use the saved base version. Other cards keep their text
and the latest accepted schedules; replaced cards start due with state version
zero. A replacement that cannot pass validation keeps that card unchanged; if
none pass, the generation fails. Competing replacements cannot overwrite a
newer accepted version. Old immutable versions remain readable.

Generation/replacement share the quiz rate limits and AI allowance. Review
submissions allow burst 60 then one per second; respect `Retry-After` on `429`.
Due reads, reveal, review and scheduling make no AI calls or generation charge.
Revoked source access or stricter privacy stops new generation/replacement.
Generation can fail with `ARTIFACT_ACCESS_REVOKED`,
`FLASHCARD_TOO_FEW_VALID_CARDS`, or `FLASHCARD_REGENERATION_FAILED`; show the
safe failure code and allow an explicit new request. BASIC is the default;
REVERSE and CLOZE require an explicit `cardTypes` preference.
Overdue generation ends `EXPIRED` with `ARTIFACT_DEADLINE_EXHAUSTED`; it cannot
publish late output. Retrying generation needs a new key. An already completed
deck remains readable and can be replaced after its old generation deadline.

### Generating a quiz

```http
POST /v1/artifacts/generations
Idempotency-Key: 3b1f0c9e-0d4a-4a3e-9f57-6c1e2f9d8a10
Content-Type: application/json

{
  "type": "QUIZ",
  "scope": { "kind": "SELECTED_SOURCES", "sourceIds": ["src:…"] },
  "preferences": {
    "topic": "B-tree page splits",
    "itemCount": 10,
    "difficulty": "MIXED",
    "questionTypes": ["SINGLE_CHOICE", "TRUE_FALSE"],
    "optionCount": 4,
    "durationMinutes": 15
  }
}
```

- `scope` uses the same kinds as the AI assistant (`NOTE`, `SPACE`,
  `SELECTED_SOURCES`, `LIBRARY`). The server checks it now (`404` or `422`
  immediately) and again at every background step.
- Every preference is optional. `topic` (2–200 characters) focuses the quiz;
  without it the questions spread over the outline of everything in scope.
  `itemCount` 3–30 (default 10), `difficulty` `MIXED` (default), `EASY`,
  `MEDIUM` or `HARD`, `optionCount` 3–5 (default 4), `durationMinutes` 1–240
  (omit for untimed), `language` (default `en`), `title` (up to 120).
- Never send prices, models, limits or the user ID; the server picks them.

Response **`202`** `{ created, generation }`. `created: false` means this key
was already used with the same body: the original generation is returned and
nothing runs or is charged twice. The same key with a different body is
`409 IDEMPOTENCY_KEY_REUSED`.

The generation (`GenerationDto`) is `{ id, artifactId, type, mode, state,
failureCode, versionId, reused, progress: { batches, completedBatches,
failedBatches, questionsReady }, preview, createdAt, completedAt }`.
`reused: true` means identical material, options and policy already produced
a quiz: it is returned at once, with no model call and no charge.

Errors: `400 INVALID_IDEMPOTENCY_KEY`, `404 NOTE_NOT_FOUND | SPACE_NOT_FOUND |
SOURCE_NOT_FOUND`, `409 IDEMPOTENCY_KEY_REUSED`, `422 CONTEXT_SCOPE_INVALID |
CONTEXT_SCOPE_TOO_LARGE | ARTIFACT_SCOPE_EMPTY | ARTIFACT_SCOPE_NOT_READY`
(files still processing: wait for readiness, then retry with a new key),
`429 RATE_LIMITED` with `Retry-After` (default burst 5, then one every 20 s).

### Following a generation

Prefer the stream; fall back to polling if `EventSource` errors.

```js
const events = new EventSource(`/v1/artifact-jobs/${id}/stream`, {
  withCredentials: true,
});
events.addEventListener('batch', (e) => showIncoming(JSON.parse(e.data)));
events.addEventListener('state', (e) => showProgress(JSON.parse(e.data)));
events.addEventListener('done', (e) => {
  events.close();
  finish(JSON.parse(e.data));
});
events.addEventListener('timeout', () => {
  events.close();
  poll(id);
});
events.onerror = () => {
  events.close();
  poll(id);
};
```

| Event     | Data                                                                            | Show                                                       |
| --------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `state`   | `{ state, progress }` on every change                                           | "Finding material…", "Writing questions (2 of 3 batches)…" |
| `batch`   | one preview batch `{ batch, questions[] }`                                      | Questions arriving, read-only (no answers, options sorted) |
| `done`    | `{ state, artifactId, versionId, failureCode, reused }`, then the stream closes | Open the quiz, or the failure                              |
| `timeout` | `{ state }` after 2 minutes                                                     | Reconnect or poll                                          |
| `error`   | `{ code: "ARTIFACT_STREAM_FAILED" }`                                            | Poll                                                       |

Polling: `GET /v1/artifact-jobs/{jobId}` about every second, backing off to
3–5 seconds; stop at a terminal state. Keep the `jobId` (URL or local state)
so the page can resume after a reload; the generation keeps running
server-side.

States: `REQUESTED`, `AUTHORIZED`, `SCOPE_RESOLVED`, `BUDGET_RESERVED`,
`CONTEXT_PLANNED`, `EVIDENCE_RETRIEVED`, `ROUTED`, `GENERATING`,
`VALIDATING`, `PERSISTING` (all "in progress"), then exactly one of
`COMPLETED`, `FAILED`, `CANCELED` or `EXPIRED` (terminal). Treat any state
you don't know as "in progress".

Preview questions are not the quiz: the final version may drop a
near-duplicate and its option order differs. Start an attempt to take it.

Typical timing (benchmark, 10 questions over a 590-page book): the first
questions arrive in about 3 seconds (95% within 4.5 s) and the quiz is ready
in about 6 seconds (95% within 10 s). Explanations follow in about 4 seconds,
in the background.

### Generation failure codes

| `failureCode`                                                                    | Meaning                                                                                          | Client action                                                                              |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `ARTIFACT_EVIDENCE_NOT_FOUND`                                                    | Nothing in scope matched the topic                                                               | Suggest another topic or a wider scope                                                     |
| `ARTIFACT_TOO_FEW_VALID_ITEMS`                                                   | Too few questions passed the quality checks                                                      | "Try again" (new key) or fewer questions                                                   |
| `ARTIFACT_REGENERATION_FAILED`                                                   | No replacement passed the checks; the quiz is unchanged                                          | Keep the current version                                                                   |
| `ARTIFACT_EVIDENCE_EXPIRED`                                                      | The original passages for a regeneration are gone                                                | Generate a new quiz                                                                        |
| `CONTEXT_ACCESS_REVOKED`, `ARTIFACT_ACCESS_REVOKED`                              | Original evidence is no longer allowed, was removed from scope, or has stricter privacy settings | Refresh the selected material; start a new generation only with currently allowed evidence |
| `AI_JOB_AUTHORIZATION_UNAVAILABLE`                                               | A required server access check is unavailable; no model call is made                             | Contact the operator; retry after the server configuration is corrected                    |
| `ARTIFACT_DEADLINE_EXHAUSTED` (state `EXPIRED`)                                  | Not finished within 10 minutes                                                                   | "Try again"                                                                                |
| `AI_DAILY_LIMIT_REACHED`                                                         | Daily AI allowance used up (every batch was refused)                                             | Show the reset time (`GET /v1/ai/allowance`)                                               |
| `AI_JOB_BUDGET_EXHAUSTED`, `ARTIFACT_PLAN_INVALID`                               | The quiz would cost more than its limit                                                          | Fewer questions or a narrower scope                                                        |
| `NOTE_NOT_FOUND`, `SOURCE_NOT_FOUND`, `SPACE_NOT_FOUND`, `CONTEXT_SCOPE_INVALID` | Something in scope was deleted or archived while it ran                                          | Refresh and try again                                                                      |
| other `AI_*` codes                                                               | Provider trouble                                                                                 | "Try again later"                                                                          |

`CANCELED` has no code. Treat unknown codes as a generic failure.

Cancel: `POST /v1/artifact-jobs/{jobId}/cancel` stops the generation at its
next step. Batches already talking to a provider finish and are charged, but
their output is discarded. A new quiz with no version ends `FAILED` in lists;
a regeneration leaves the current version as it was.

### Reading, regenerating, archiving, deleting

- `GET /v1/artifacts/{artifactId}` returns `{ id, type, title, status,
spaceId, sourceNoteId, currentVersion, latestGeneration, createdAt,
updatedAt, archivedAt }`. `status` is `GENERATING`, `READY`, `FAILED` or
  `ARCHIVED`. `currentVersion.explanationsReady` turns true when background
  explanations are stored.
- `GET /v1/artifacts/{artifactId}/versions/{versionId}` returns the questions
  and options without answers, for a preview screen.
- Regeneration: `POST /v1/artifacts/{artifactId}/regenerations` with
  `{ "questionIds": ["q2", "q5"] }` (1–8 IDs of the current version) and an
  `Idempotency-Key`. It returns `202` like a generation; follow it the same
  way. On success a new version becomes current; every other question stays
  exactly the same. Attempts already started keep their own version.
  Repeating the same key and selected question IDs returns the original
  generation, including after publication or a newer version; ID order does
  not matter. A different artifact or question selection with that key is
  `409 IDEMPOTENCY_KEY_REUSED`. Background work checks the original scope and
  evidence again before AI attempts and publication; revoked access or stricter
  privacy settings stop new output without changing an already-started attempt.
  Errors: `409 ARTIFACT_NOT_READY` (no current version yet),
  `422 ARTIFACT_QUESTIONS_INVALID`, `429 RATE_LIMITED` (separate bucket from
  generation; default burst 5, then one every 30 s).
- Archive hides the quiz from the default list (`includeArchived=true` shows
  it); it can still be taken.
- Delete is permanent: the quiz disappears at once, a running generation is
  stopped, and its versions, attempts, stored payloads and the evidence copies
  only it used are removed in the background. A second delete is `404`.

### Taking a quiz

Opt in to the additional types through `preferences.questionTypes`. The default
remains `SINGLE_CHOICE` and `TRUE_FALSE`. New versions use `quiz-v2`; existing
`quiz-v1` attempts retain their pinned content. `optionCount` (3–5) also bounds
multiple select, matching and ordering. Every new question is worth one point
and has `scoring: "EXACT"`: tell learners that there is no partial credit.

| Type | Public fields | Answer sent under the question ID |
| --- | --- | --- |
| `MULTIPLE_SELECT` | `options` with stable IDs | Array of selected option IDs, with no duplicates; order does not matter |
| `SHORT_ANSWER` | Prompt and normalization policy | String, at most 800 characters |
| `FILL_IN_THE_BLANK` | Prompt with `[[b1]]`…`[[b4]]` and `blanks` IDs | Map such as `{ "b1": "Mercury", "b2": "Venus" }` |
| `MATCHING` | `options` (left) and `right`, both with stable IDs | Map from left ID to right ID; no reused right IDs |
| `ORDERING` | `options` with stable IDs | Complete ordered array of all option IDs |

Text grading uses accepted factual variants with NFKC Unicode normalization,
case folding and whitespace collapse (`NFKC_CASE_WHITESPACE`). Punctuation is
preserved: `C++` is different from `C`. Short answers ask for short factual
completions, with a private rubric/concepts; there is no subjective evaluator
or grading charge. Fill-in requires every blank to match. Matching and ordering
require the complete correct mapping/sequence. Ordering uses an explicit sequence
inside one cited passage, with each item phrase occurring once. It does not infer
prerequisite graphs from unordered prose or order different passages.

Save accepts partial blank/matching maps; incomplete answers earn zero on
submission. An empty selection is allowed; unknown/duplicate IDs, malformed
values and oversized text return `422 QUIZ_ANSWER_INVALID`. `null` still clears
a saved question. Render options/right items in the attempt's returned order;
their stable IDs stay fixed on resume. Results return `correctAnswer` in the
same type-specific shape. Private accepted variants, rubrics and answer maps
remain absent from pre-submission responses, previews and SSE events.

1. **Start** with `POST /v1/quizzes/{quizId}/attempts` and a new
   `Idempotency-Key` per "Start" press. `201` creates the attempt; a retry
   with the same key is `200` with the same attempt. The attempt is bound to
   the quiz's current version and fixes this attempt's option order.
2. Render `attempt.questions` in order: `{ id, type, prompt, difficulty,
   points, options?, right?, blanks?, scoring?, normalization? }`. Options appear for choice, matching and ordering questions and are
   already in this attempt's order; show them as given. A timed quiz has a
   server `deadlineAt`; count down from it, never from the client clock.
3. **Save** as the learner answers: `PUT /v1/quiz-attempts/{attemptId}/answers`
   with `{ "answers": { "q1": "b", "q2": true, "q3": null } }`. Values are an
   option ID for single choice, a boolean for true/false, or `null` to clear.
   It merges into what is saved and is safe to retry. Debounce to about one
   save every few seconds or per question.
4. **Submit** with `POST /v1/quiz-attempts/{attemptId}/submit`, an
   `Idempotency-Key`, and optionally the last unsaved answers in the body.
   The response is the result. Any repeat submit returns the same result: one
   attempt has one grade. After a timed quiz's deadline (30 seconds grace),
   answers in the body are ignored and only saved answers count. Unanswered
   questions score zero.
5. **Resume** after a reload with `GET /v1/quiz-attempts/{attemptId}`.

Attempt errors: `404 QUIZ_NOT_FOUND | QUIZ_ATTEMPT_NOT_FOUND`,
`409 QUIZ_NOT_READY | QUIZ_ATTEMPT_SUBMITTED | QUIZ_ATTEMPT_EXPIRED` (save
after the deadline: submit instead) `| QUIZ_ATTEMPT_CONFLICT` (retry),
`422 QUIZ_ANSWER_INVALID` (unknown question, wrong answer type or unknown
option), `429 RATE_LIMITED` with `Retry-After`. Start, save and submit have
separate per-user buckets (defaults: start burst 10 then one every 6 s; save
burst 60 then 2 per second; submit burst 10 then one every 2 s), so saving
never blocks a submit.

### Results

`GET /v1/quiz-attempts/{attemptId}/result` (or the submit response):
`{ attemptId, quizId, versionId, score, maxScore, passingScore, passed,
submittedAt, explanationsComplete, questions[] }`. Each question has
`{ id, type, prompt, options, yourAnswer, correctAnswer, correct,
explanation, citations[] }`. `correctAnswer` is an option ID or a boolean.
Citations name the file and page (`sourceId`, `page`, `headingPath`), a
Note, or a timestamp (`startMs`), like the assistant's citations.

Explanations are written in the background right after the quiz is
published, usually before the learner finishes. While `explanationsComplete`
is false, show what is there and read the result again every few seconds
until it is true. `409 QUIZ_ATTEMPT_NOT_SUBMITTED` means submit first.

`GET /v1/quizzes/{quizId}/attempts` lists the newest 50 attempts with
`{ attemptId, versionId, state, score, maxScore, startedAt, submittedAt }`.

### Do and don't

- Do use one `Idempotency-Key` per user action (generate, start, submit) and
  reuse it only for network retries of that action.
- Do take the quiz only through attempts; never grade on the client.
- Do render prompts, options and explanations as plain text.
- Don't cache results or answers in IndexedDB or analytics; answers are
  sensitive learner data.
- Don't show preview batches as a takeable quiz.
- Don't retry a `FAILED` generation automatically; let the user decide.

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
   Word `.docx` and PowerPoint `.pptx` (not legacy `.doc`/`.ppt`),
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
- Persist running quiz generation IDs and open attempt IDs the same way; never
  persist quiz results or answers on the client.

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
