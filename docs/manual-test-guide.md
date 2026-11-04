# Manual test guide (backend catch-up)

Run the app against the local backend (main, `:3012`) with `npm run dev`
(`:3000`). Sign in with a test account. Each section matches a phase in
`docs/api-catchup-plan.md`.

## Phase 1 — Contract refresh (no UI change)

- App boots with no console errors; workspace loads as before.
- Network: `/v1/*` calls unchanged; no new failures in normal use.

## Phase 2 — Sharing correctness

Needs two users (Owner A, collaborator B) and a shared note. Share via the
backend/API directly until Phase 4 lands its UI.

1. As A, create note "Shared plan", note its ID from the URL. Share with B as
   editor. As B, open the URL: note loads, editable.
2. As A, remove B's grant. As B, reload: EXPECT dedicated "You no longer have
   access" view with "All notes" button (not a generic error). Click it:
   EXPECT the notes list.
3. Re-share. As B, type a sentence, wait for Saved. As A, remove the grant.
   As B, type more, wait ~2s: EXPECT toast "You no longer have access..." with
   Copy ID, sync pill "Read only", read-only editor/title, typed text visible.
4. As B, reload: EXPECT the no-access view. As A, re-share; as B, reload:
   EXPECT editable again.
5. As B (editor), rename in the top bar with Network open: EXPECT no PUT
   .../checkpoint (transactions/GETs only). NOTE: the title shows locally but
   reverts on reload — the protocol has no title op (backend gap G2).
6. As B, force a conflict (A edits the same paragraph elsewhere), choose "Keep
   my version": EXPECT POST .../transactions (never PUT), back to Saved.
7. Version history while denied: open history after losing access: EXPECT the
   dialog closes into the denied state (toast + read-only), not inline errors.
8. Restore-busy copy: two tabs restore concurrently: EXPECT one shows
   "Another restore is in progress. Try again shortly."
9. Regression (unshared note, as A): rename + edit + conflict-resolve behave
   exactly as before (PUT checkpoint for full saves).

## Phase 3 — Trash + Shared-with-me

1. Create note "Trash me", open Note actions (···) > Delete note. Confirm the
   dialog reads "restorable for 30 days from Trash" and mentions immediate
   access loss. Confirm.
2. Verify it is gone from All notes and Home > Recent notes.
3. Open sidebar Trash (?view=trash): EXPECT "Trash me" with "Deleted <date> ·
   Permanently deleted on <date>".
4. Click Restore: button shows "Restoring…", then banner "is back in your
   notes" with Open note. Click Open note: EXPECT the note opens.
5. All notes shows it again; Trash no longer does ("Trash is empty" if alone).
6. Refresh on ?view=trash and ?view=shared: EXPECT the same page reopens.
7. Shared-with-me: have another user share a note with you, open "Shared with
   me" (?view=shared): EXPECT "Shared by <name>" row; open it: EXPECT normal
   note session.
8. Share one of your own notes: EXPECT a "Shared" pill on that row in All
   notes and Home > Recent notes, and only there.
9. Offline: disconnect, open Trash and Shared with me: EXPECT friendly
   connection error with Try again; reconnect + retry loads.
10. At 320px on Trash: EXPECT rows wrap, no horizontal scroll, Restore
    tappable.

## Phase 4 — Sharing + live + comments + notifications

(TBD when the phase lands.)

## Phase 5 — Learning artifacts

(TBD when the phase lands.)

## Phase 6 — Web/papers search

(TBD when the phase lands.)
