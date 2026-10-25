---
name: document-schema
description: Canonical Incantly document model rules. Use before creating or changing any document content, node, mark, or page-setup code in this app.
---

# Canonical Document Schema Rules

The stored document is **Incantly JSON** from `@incantly/canvas-core/document` (installed from GitHub Packages, pinned to 0.2.0). It is plain versioned data — never Tiptap JSON, never HTML.

## Must

- Build documents with core factories (`createDocument`, `createParagraph`) and the `IncantlyDocument` / `DocumentNode` / `TextMark` types. The type definitions are the contract.
- Give every node a stable branded ID and keep it stable across edits, saves, syncs, and migrations. Never regenerate IDs on load.
- Store only `assetId` + display metadata in media nodes. Binary bodies (images, PDFs, audio, DOCX) live outside document JSON, resolved through `AssetRepository`.
- Model page setup (size, orientation, margins, header/footer distances, starting page number) as `PageSetup` data in points. UI state (zoom, toolbar, selection) never enters the document.
- Store explicit user-created breaks only. Calculated pagination is derived state, never persisted.

## Never

- Never persist Tiptap/ProseMirror JSON, editor state, numeric ProseMirror positions, undo history, or transient upload state.
- Never persist raw HTML or scrape the editor DOM for storage.
- Never invent a node or mark type without adding it to the canonical model first — the editor schema is a projection of this model, not the other way around.
- Never put React, Tiptap, DOM, or Liveblocks imports into anything that touches document construction or transformation outside components.
