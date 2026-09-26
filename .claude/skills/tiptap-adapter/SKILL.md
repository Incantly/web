---
name: tiptap-adapter
description: Rules for the app-owned Tiptap editor and its adapter to the canonical model. Use before creating or changing editor schema, conversion, toolbar, slash menu, or pagination UI.
---

# Tiptap Adapter Rules

This app owns its Tiptap editor. The SDK does not ship one. The editor is an input device over the canonical model — replaceable, never authoritative.

## Must

- Declare the editor schema explicitly (`Node.create` / `Mark.create` lists). Disable every StarterKit piece you replace with a custom definition — a Tiptap-default node must never exist beside its canonical twin.
- Mirror core content rules in the editor schema (nesting, mark combinations, limits from `@incantly/core`).
- Implement both mapping directions (canonical → ProseMirror JSON, ProseMirror JSON → canonical) with stable node IDs and an adapter report for repaired/dropped content.
- Keep ProseMirror numeric positions inside the adapter. Toolbars, AI ops, and cross-surface code use core commands/transactions and the portable selection contract.
- Prove compliance with the conformance suite: `Incantly → ProseMirror → Incantly` semantic equality, reverse direction, stable IDs, hostile inputs, unsupported-content reporting. Green suite or non-compliant — no exceptions. (Playwright is already a devDependency: cover mount, type, format, slash menu, paste, read-only, unmount, and export-preview flows end to end.)
- Keep collaboration out of local editing. Yjs/Liveblocks binding is a later phase and must never be required to open, edit, save, or export.

## Never

- Never store Tiptap JSON, use it as the save format, or let ProseMirror transactions reach storage directly.
- Never let the editor invent persisted structures — unmapped content is reported, never silently persisted.
- Never put binary uploads, transient upload state, or view state into document JSON.
- Never add a schema extension without its canonical-model mapping, round-trip fixture, and E2E proof in the same change.
