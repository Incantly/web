---
name: document-storage
description: Document persistence and repository contracts. Use before implementing autosave, local persistence, sync, or any DocumentRepository/AssetRepository in this app.
---

# Document Storage Rules

Storage speaks canonical documents only. The repository is the choke point that keeps garbage out even if an editor misbehaves.

## Must

- Implement persistence against core's `DocumentRepository` / `AssetRepository` interfaces (snapshots + updates, asset resolution). The app provides backends (IndexedDB, server, files); core defines the shape.
- Validate + normalize inside `save()` before writing. Attach `schemaVersion` and document revision to every write.
- Debounce autosave; flush pending changes on explicit save and on teardown/unmount. Guard against stale async writes overwriting newer checkpoints.
- Keep local editing fully functional offline. Collaboration/sync is an enhancement, never a requirement for opening, editing, or saving.
- Handle the full lifecycle in tests: rapid edits + immediate unmount, failed save + retry, stale response, refresh recovery, corrupt snapshot.

## Never

- Never persist Tiptap state, ProseMirror steps, or view-specific data alongside the document.
- Never embed binary asset bodies in document JSON — store references; resolve bytes via the asset repository.
- Never let a failed or stale save silently win over newer local content.
- Never hard-code a backend inside reusable document code; inject repositories.
