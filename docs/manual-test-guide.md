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

Setup: two users, A (owner) and B (collaborator), in two browsers. A owns a
note shared with B; both signed in.

1. Bell + inbox. As A: open the note → Share… → share with B (if not
   already). As B: EXPECT the top-bar bell shows an unread badge within ~45s
   (or refocus the tab). Open the bell: EXPECT a row "A shared a note with
   you" + the note title as text.
2. Row navigation. As B: click the inbox row: EXPECT the note opens and the
   row marks read (badge count drops). Reopen the bell: EXPECT the row reads
   as read (no dot, no mark-read button).
3. Per-row mark-read + read-all. As A: remove B's access, then share again
   (two unread rows for B). As B: bell → mark-read button on one row:
   EXPECT only that row marks read. "Mark all read": EXPECT every row read,
   badge gone.
4. Offline. As B: disconnect, open the bell: EXPECT the offline note; rows
   stay readable. Reconnect + refocus: EXPECT a refresh.
5. Master email switch. As B: Settings → Notifications: EXPECT
   "Collaboration emails" On. Turn Off: EXPECT it persists after closing and
   reopening Settings. Turn back On.
6. Note mute. As B: open the shared note → Note actions → "Mute email for
   this note": EXPECT the item flips to "Unmute…". Settings → Notifications:
   EXPECT the note listed as Muted. Toggle it back On there: EXPECT the
   Note-actions item flips back.
7. Thread mute. As B: Note actions → Comments → Mute on one thread: EXPECT
   the button flips to Unmute. Settings → Notifications: EXPECT "Thread on
   {note}" listed as Muted.
8. Thread deep link. As B: in the comments panel, note a thread's id (from
   the muted entry's "Thread {id}" line, or the network tab). Open
   `/notes?note={noteId}&thread={threadId}` fresh: EXPECT the note opens,
   the Comments panel opens, and the thread scrolls into view highlighted.
   Resolve the thread first, then reload the link: EXPECT the resolved
   section auto-expands with the highlight. Also try the email shape
   `/notes/{noteId}?thread={threadId}`: EXPECT a redirect to the same view.
9. Bare-@ mentions. As B: in a comment box type "@" with no letters: EXPECT
   the mention menu with the default list. Type letters: EXPECT filtering.
   Escape: EXPECT the menu closes until the next keystroke.
10. Unsubscribe. Open `/unsubscribe` with no token: EXPECT the "link isn't
    complete" text (no request sent). Open `/unsubscribe?token=bogus`:
    EXPECT the confirm screen; press "Yes, unsubscribe me": EXPECT the
    expired-link text. With a real token from a collaboration email:
    EXPECT the confirm screen on load (nothing unsubscribed yet); press the
    button: EXPECT "You're unsubscribed".
11. Missing access. As A: remove B's access. As B: bell row for the note:
    EXPECT clicking still marks read; the note itself shows the no-access
    state (unchanged from 4c).

## Phase 5a — Quizzes

Needs backend :3012 with at least one READY quiz. Quiz entry is direct-URL
(?quiz=<id>); list/generation UI lands in 5b/5c.

1. Sign in, open /workspace. In DevTools console run:
   fetch('/v1/artifacts?type=QUIZ',{credentials:'include'}).then(r=>r.json())
   .then(d=>console.log(d.items.map(i=>i.id))) — copy one quiz id.
2. Go to /workspace?quiz=<id>. EXPECT "Quiz" page; with no attempts see
   empty state + Start.
3. Click Start attempt. EXPECT taker with title, instructions,
   "0 of N answered", "Answers save as you go."
4. Answer one choice question. Within ~2s EXPECT "Saving…" then
   "Saved <time>"; progress count rises.
5. Reload, reopen ?quiz=<id>, click Resume. EXPECT answers restored.
6. DevTools Network → Offline; change an answer. EXPECT offline notice +
   "Offline — answers stay on this page…"; go online → it saves.
7. Click Submit attempt → confirm dialog shows unanswered count → Submit.
   EXPECT result with score headline, per-question Correct/Incorrect, your
   vs correct answers, explanations/citations.
8. Back via "All attempts"; EXPECT history row with score; "View result"
   reopens it.
9. Timed quiz only: verify countdown ticks and expiry copy prompts submit.
10. Resize to 320px: no horizontal scroll; keyboard-tab through every
    input; focus ring visible.

## Phase 5b — Flashcard decks

Needs backend :3012 with AI generation configured. Deck entry is direct-URL
(?deck=new to generate, ?deck=\<id> to review); no deck list yet.

Generate flow:

1. Go to /workspace?deck=new. EXPECT "New deck" with a scope picker
   (one note / a Space / sources / everything) and options.
2. Pick "Everything", leave options default, click Generate deck. EXPECT
   "Making your deck" with live "N cards ready…" progress.
3. Wait for completion. EXPECT "Deck ready" + Start reviewing; click it.
   EXPECT the review queue with a due count.
4. Reload /workspace?deck=new mid-generation (start a second deck first).
   EXPECT a blank form (generation progress is in-memory only and does not
   survive reload; the server-side job itself continues).

Review flow (need one READY deck; find ids via
fetch('/v1/artifacts?type=FLASHCARD_DECK',{credentials:'include'})
.then(r=>r.json()).then(d=>console.log(d.items.map(i=>i.id)))):

5. Go to /workspace?deck=\<id>. EXPECT the first due card's front as text,
   "N due", Show answer, and the due queue below.
6. Click Show answer. EXPECT the answer as text (+ sources when present)
   and four grading buttons: Again / Hard / Good / Easy.
7. Click Good. EXPECT the next card appears and the queue count drops.
8. DevTools Network → Offline; click Show answer on the new card. EXPECT
   the button disabled + offline notice; go online → reveal works.
9. With the answer shown, click "Replace this card" → confirm dialog
   EXPECTS the keeps-schedules wording → Replace card. EXPECT
   "Writing replacement cards…" then the queue refreshes.
10. Resize to 320px: no horizontal scroll; keyboard-tab through Show
    answer and all four grades; focus ring visible on each.

## Phase 5c — Artifact generations

(TBD when the phase lands.)

## Phase 6 — Web/papers search

(TBD when the phase lands.)
