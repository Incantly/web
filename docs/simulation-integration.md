# Solutus simulation integration

Status: proposed web-editor contract

## Product behavior

The document editor hosts Solutus simulations as live `formulaScene` block nodes. A normal scene stores its authored model inline in canonical Incantly JSON. The user may view the same block inline, wide or fullscreen. Fullscreen is not a second document and does not receive an independent autosave path.

Reusable or oversized scenes may use a referenced simulation source. The UI must make promotion, linked copy and independent duplication explicit.

## Canonical node

The actual types must be added to `@incantly/canvas-core` before the editor extension is implemented.

```ts
type FormulaSceneNode = {
  id: DocumentNodeId;
  type: "formulaScene";
  attrs: {
    display: "inline" | "wide" | "fullscreen";
    height: number;
    caption?: string;
    source:
      | { kind: "inline"; model: FormulaSceneModel }
      | { kind: "reference"; simulationId: SimulationId; revision: number };
  };
};
```

The editor remains a projection. Persistence continues through `DocumentRepository` with validation, normalization, schema version and optimistic revision checks. Tiptap JSON, ProseMirror positions and renderer state never enter storage.

## Editor adapter

Add `formulaScene` to canonical types, validation, normalization, migration, plain-text projection, export projection, Tiptap schema, both conversion directions, commands and conformance fixtures in one change set.

The Tiptap node uses a React NodeView and is isolating and selectable. The NodeView receives injected Solutus engine, asset, permission, telemetry and optional simulation-repository services. It does not own durable state.

The collaboration adapter must avoid replacing one giant JSON attribute for every scene edit. It maps stable scene items and sections by ID into granular Liveblocks/Yjs shared state. Checkpoint conversion composes that state into one validated canonical model.

## Commands

Expose typed commands:

```ts
insertFormulaScene({ model, display, height })
updateFormulaScenePresentation(nodeId, { display, height, caption })
applyFormulaSceneOperations(nodeId, operations, transactionId)
openFormulaScene(nodeId, "fullscreen")
promoteFormulaScene(nodeId)
duplicateFormulaScene(nodeId, "linked" | "independent")
```

UI code cannot mutate raw scene attributes. Agent edits use the same operation path after backend validation and approval policy.

## Runtime and layout

- Offscreen blocks render a deterministic preview and own no active clock, audio, worker or GPU session.
- Near-viewport blocks may warm a low-cost preview.
- A focused block creates or resumes one `EngineSession`.
- Fullscreen transfers or recreates that session from the same source.
- Escape returns focus to the document and preserves the text selection boundary.
- Animation frames never dispatch editor transactions or trigger autosave.
- An authored formula, control, checkpoint, viewport or display change creates a transaction.
- Pagination reserves stable dimensions and is not recomputed per animation frame.
- Print, PDF and DOCX use a deterministic snapshot, caption, accessible description and source reference.

## Offline and collaboration

Inline authored state participates in the existing canonical IndexedDB fallback and Liveblocks collaboration. IndexedDB remains untrusted. On load and save, the document and embedded model pass core migration, validation and normalization.

When offline, the user may edit an already available inline scene. Server-dependent AI and promotion are queued or disabled. On reconnect, collaborative authored operations merge before canonical checkpointing. A stale queued agent edit is revalidated against target item IDs and source hashes before application.

## Security

Never evaluate arbitrary JavaScript, HTML, event-handler strings, shader source or URLs from a formula scene. Use the Solutus typed parser, allowlisted actions and resource budgets. Asset bytes resolve only through `AssetRepository`. Audio requires explicit activation. Workers receive data, no credentials or network authority, and are canceled by revision.

## Required implementation work

1. Wait for the canonical Core and Solutus types. Do not invent a web-only node.
2. Add the canonical node and migration to the file-linked Core package.
3. Add Tiptap node, React NodeView and typed commands.
4. Add granular collaboration mapping and canonical checkpoint composition.
5. Add inline/fullscreen shared-source behavior.
6. Add slash-menu insertion, contextual controls, promotion and copy policy.
7. Add semantic export and accessible fallback.
8. Prove round trips, stable IDs, offline reload, concurrent item edits, agent retry idempotency, lifecycle disposal, print and unsupported-client behavior with E2E artifacts.

