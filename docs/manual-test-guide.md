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

## Phase 4a — Note sharing UI

Needs two users (Owner A, collaborator B) with verified emails, plus an
unverified/new address C. A and B sign in on separate browsers/profiles.

1. As A, open a note > Note actions (···) > Share…: EXPECT the share dialog
   with "Who has access" listing only A as Owner, an invite form, and a
   view-only links section.
2. Invite validation: submit empty, then "not-an-email", then A's own
   address: EXPECT inline errors ("Enter an email address.", "Enter a valid
   email address…", "That’s your own address…"). No request leaves the
   browser (check Network).
3. Invite B as Editor: EXPECT notice "now has access", B appears in the
   list with role Editor. Change B to Viewer via the role select: EXPECT
   the row updates. Change back to Editor.
4. Pending invite: invite C (unknown address) as Commenter: EXPECT "Invitation
   sent to …", a Pending row with the email as text. Revoke it: EXPECT a
   confirm dialog ("Revoke this invitation?"); confirm removes the row.
5. Non-owner view: as B, open the shared note > Share…: EXPECT the same
   people listed with role labels (no emails for pending invites), no role
   selects, no Remove buttons, no invite form, no links section, and the
   line "Only the owner can invite people or change who has access."
6. Revoke grant: as A, Remove B, confirm ("They lose access…"): EXPECT B
   disappears. As B, reload the note: EXPECT the "You no longer have
   access" view. Re-share for the steps below.
7. Invitations inbox: as A, invite a second verified user D. As D, open
   sidebar Invitations (?view=invitations): EXPECT one row (note title,
   "Invited by A", role + capability, Accept button). Click Accept: EXPECT
   "is now in Shared with me" with Open note; open Shared with me: EXPECT
   the note listed there. /invitations redirects to the same inbox.
8. Share links: as A, Share… > Create link: EXPECT a "View-only link"
   row with expiry and Copy/Revoke (the URL itself is never shown). Click
   Copy: EXPECT "Copied". Paste into a signed-out/private window: EXPECT
   the note title + read-only content, "View-only shared copy", no editing
   UI. Back as A, Revoke the link (confirm): EXPECT the row goes; reload
   the link: EXPECT "This link didn’t open / invalid or has expired".
9. Offline: disconnect, open Share… and Invitations: EXPECT the offline
   notice plus friendly error with Try again; reconnect + retry loads.
10. At 320px on the dialog and Invitations: EXPECT rows wrap, no horizontal
    scroll, all buttons tappable (44px targets).

## Phase 4b — Live presence

Two browsers: A owner, B collaborator. Backend :3012 with Liveblocks dev
credentials.

1. As A, open any unshared note: EXPECT no presence pill, no notice.
2. As A, Share… the note with B as Editor. As B, open Invitations, Accept:
   EXPECT the note under Shared-with-me.
3. Both open the shared note: EXPECT a "Live" pill within seconds (B may
   briefly show "Connecting…").
4. EXPECT each header shows the other's initials avatar.
5. As A, type a sentence, wait ~2s. As B, focus the window / wait 5s: EXPECT
   A's sentence appears with no toast, no conflict dialog.
6. As B, type without waiting: EXPECT A picks it up on poll; neither toasts.
7. As A, history → preview an old version → restore. As B: EXPECT inline
   notice "A restored the version from {time}." with Dismiss; dismiss it.
8. As B, switch notes: EXPECT B's avatar leaves A's stack within seconds.
9. As B, reopen; as A, revoke B's grant: EXPECT B's tab leaves for the notes
   list with one toast; reopening shows "You no longer have access".
10. Hide A's tab 3+ min (or throttle offline briefly): EXPECT Reconnecting…
    then Live on return, at most one inline notice, no toast storm.
11. Budget/pause path (needs exhausted guard on backend): EXPECT pill hidden,
    at most one inline "paused… Your changes still save." with Try again;
    edits still save.
12. Full room (11th tab): EXPECT "This note is full (10 people). Your changes
    still save." once; saves still work via poll.
13. At 320px with 2+ collaborators: EXPECT no horizontal scroll, title
    truncates.

## Phase 4c — Comments

Two users + @mention; backend :3012 + Liveblocks.

1. As owner A, open a note, Share it with B as Editor. Keep it open.
2. As A: Note actions → Comments: EXPECT panel opens, "No comments yet".
3. As A: type "Hello @", type B's first letters: EXPECT suggestion menu;
   ArrowDown/Enter picks B, draft shows "@Name ". Comment: EXPECT thread
   with A as author + "Just now".
4. As B (second browser): open note → Comments: EXPECT thread within ~5s.
   Reply "Got it": EXPECT it under A's comment for both after refresh.
5. As B: Resolve thread: EXPECT Resolved badge + move under "Show resolved
   (1)". Expand → Reopen: EXPECT back to open.
6. As A, post "@B please review" (pick from menu): EXPECT B gets a mention
   notification (bell lands in 4d; check Liveblocks dashboard meanwhile).
7. Owner changes B to Viewer. As B, reopen Comments: EXPECT readable
   threads, no composer/reply/resolve, explanatory note.
8. Open a non-shared note: EXPECT no Comments item in Note actions.
9. Offline: disconnect, open Comments on shared note: EXPECT offline note,
   submit disabled; reconnect: EXPECT list loads.
10. Live paused (guard/budget): EXPECT composer still posts (REST), list
    shows "needs the live connection" + Reconnect; rejoin: EXPECT threads.
11. Agent mention (if an enabled agent exists): post "@agent …" with 2+
    chars: EXPECT one backend run, no client repost.

## Phase 4d — Notifications

(TBD when the phase lands.)

## Phase 5 — Learning artifacts

(TBD when the phase lands.)

## Phase 6 — Web/papers search

(TBD when the phase lands.)
