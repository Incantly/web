---
name: document-validation
description: Load and save validation gates for documents. Use before wiring any document load, save, paste, import, or sync path in this app.
---

# Document Validation Gates

Every document crossing a trust boundary passes the core gates. No exceptions, no editor bypass.

## Must

- Load path: `parseIncantlyDocument` (version detection) → `validateDocument` (structured issues with path + code) → `normalizeDocument`/recovery. Render the editor only from the validated result.
- Save path: validate again before persisting. Invalid docs are repaired-with-report or rejected with the error code — never stored silently.
- Surface `validation issues` and adapter reports in UI where content was repaired or dropped, so loss is always visible to the user.
- Run schema migrations in core (`migrateDocumentToCurrent`) before the editor ever sees an older document.
- Sanitize pasted/dropped HTML through the canonical allowlist. Reject scripts, event handlers, dangerous URL schemes, and arbitrary iframes; report what was discarded.

## Never

- Never feed untrusted JSON (storage, network, clipboard, files) straight into the editor.
- Never weaken or skip validation to make a failing fixture pass — fix the content or the mapping.
- Never treat "it renders" as "it's valid." The editor tolerates; the gate decides.
