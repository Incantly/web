# Backend catch-up implementation plan

Frontend adoption of backend main (PRs #29–31: Liveblocks multiplayer, sharing,
comments, notifications, trash, quizzes, flashcards, artifacts, web/papers search).

Live contract: backend main on `:3012`, OpenAPI at `/v1/docs/openapi.json`
(127 paths / 151 ops at kickoff). Guides: backend `docs/multiplayer/*.md`,
`docs/frontend-api-integration.md` (re-copied in Phase 1).

## Process (every phase)

Frozen-brief subagents, strictly sequential: **implement → review →
security**. Each gate returns pass/fail; fail sends precise findings back for
one fix round (max two), then re-review. Nothing advances on fail. Parent
verifies the diff, re-runs gates, and commits per phase. No pushes.

Standing rules in every brief: `docs/design-system.md` tokens only (never raw
colors), feature-context/hook patterns per `AGENTS.md`, mobile-first responsive
at 320/375/768/1024/1440, 44px targets, vitest for logic, no E2E, no secrets.

## Phases

1. **Contract refresh.** `src/lib/api/openapi.json` + `schema.d.ts` from live,
   re-copy `docs/frontend-api-integration.md`. Type fallout only, zero behavior
   change. Gates: `npx tsc --noEmit`, `npm run lint`, `npm test`.
2. **Sharing correctness.** `NOTE_ACCESS_DENIED` (403) copy + states on note
   flows; `USE_TRANSACTIONS` branch for rename/conflict-resolve on shared notes
   (`NoteDto.collaboration` present); new `RESTORE_IN_PROGRESS` (409),
   `ROOM_DOCUMENT_TOO_LARGE` (413), `LIVE_COLLABORATION_UNAVAILABLE` (503,
   retry after Retry-After) handling; checkpoint ETag/304 polling.
   Files: `src/lib/api/{client,errors,notes,proposals}.ts`, note sync + session
   UI, `use-note-suggestions.ts`.
3. **Trash + Shared-with-me.** `GET /v1/notes/trash` view (`purgeAt`), trash
   restore via bodyless `POST restore` (`NOTE_NOT_DELETED`), updated delete
   copy (30-day soft delete, owner-only); `GET /v1/notes/shared-with-me`
   section + shared badges (`NoteCollaborationDto`).
4. **Sharing + live + comments + notifications.**
   a. Grants/invites/share-links CRUD + `/v1/shared/{token}` viewer.
   b. Liveblocks authorize/users + live-status + mention suggestions.
   c. Comment creation UI. d. Notification inbox, read-all/mark-read,
   preferences, note/thread mutes, unsubscribe page.
5. **Learning artifacts.** Quiz attempts (start/save/submit/result/history),
   flashcard decks (generate/regen/due/reveal/reviews), artifact generations
   (create/regen/versions/stream/cancel/archive/delete).
6. **Web/papers search.** `webSearch` + `webScope` modes in chat, web citation
   rows (title + `url` link), paper metadata rows (authors/year/venue,
   `pdfUrl` link, doi/arxiv as text), `AI_WEB_RATE_LIMITED` /
   `AI_WEB_QUOTA_EXHAUSTED` step wording. Fixes web citations rendering as
   "Your material" (`toItem` in `AssistantPanel.tsx`).

## Verification per phase

`npx tsc --noEmit`, `npm run lint`, `npm test`, secrets grep over changed
files, responsive check of touched views, manual steps appended to
`docs/manual-test-guide.md`.

## Commit log

| Phase | Commit | Notes |
| --- | --- | --- |
| 1 | chore(api): refresh contract to backend main | 127 paths/151 ops; webScope loosening; lint gate green (config ignores + 30 reasoned disables) |
| 2 | feat(notes): shared-note correctness | denied states, transaction-only shared saves, 409/413/503 copy, conditional checkpoint GET; known: pure shared rename is local-only (backend G2), decide/undo denial double-toasts |
