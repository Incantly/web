# Pages, print layout, and Word: web app plan

Researchers write papers in notes, so notes need real pages:
- paper size, orientation, margins and columns;
- headers and footers with page numbers;
- a different first page, and odd/even pages;
- print preview, PDF and Word export;
- Word import (Word, WPS and Google Docs as `.docx`).

This file is the web app's part. The other two parts:
- **SDK:** `incantly-canvas/canvas/roadmap/19-document-pages-and-word.md` (phases `SDK-*`): layout rules, print CSS, page regions, Word export and import.
- **Backend:** `incantly-backend/docs/pages-and-word-plan.md` (phases `BE-*`): layout passes through save/load, Word note import jobs.

## What already exists

- **Canonical model** (`@incantly/canvas-core` 0.2.0):
  - `PageSetup` (mode, size, orientation, margins, header/footer distance, mirrored margins, starting page number, columns);
  - `PageLayout` (sections, `PageHeaderFooterVariants` default/first/odd/even, `HeaderFooterField`);
  - `ResearchMetadata`.
- **In `src/lib/document-editor`,** none of it shown in notes:
  - `components/PageSettings.tsx`: a plain demo form;
  - `HeaderFooterEditor`: a prototype that can only insert fields;
  - `components/DocumentPageView.tsx`: one page frame with placeholder text;
  - `components/ExportMenu.tsx`;
  - `exporters.ts`: HTML, Markdown and TXT, Paged.js preview and print, and an inline DOCX export with the margin-unit bug.
- `paginationExtension.ts` draws a dashed line every 1,056 px, ignoring paper and margins.

## Rules

- Follow `AGENTS.md`:
  - logic lives in hooks in `src/hooks/` and components only draw;
  - semantic colour tokens only;
  - mobile-first, checked at 320/375/768/1024/1440 px, with 44 px targets;
  - typecheck, lint and unit tests required;
  - **no E2E tests or screenshots unless the user asks**;
  - no AI attribution.
- Editor work follows the `tiptap-adapter`, `document-schema`, `document-storage` and `document-export` skills. Calculated page boundaries are decorations, never document content.
- Page setup and header/footer changes are document changes. They go through the note's sync (`useNoteSession` / `NoteSync`) as a saved revision, never a side channel.

## Status board

| Phase | What | Needs first | Status |
|---|---|---|---|
| FE-0 | Develop against the local SDK | — | Done (tarball, `--no-save`) |
| FE-1 | Page setup panel | — | Done |
| FE-2 | Header & footer editor | SDK-1 | Done (reload check waits on BE-1 merge) |
| FE-3 | Accurate page lines | SDK-3 | Blocked by SDK-3 |
| FE-4 | Print preview and PDF | SDK-2 | Blocked by SDK-2 |
| FE-5 | Export menu (PDF, Word, Markdown, HTML) | PDF: FE-4; Word: SDK-5 | Partly ready (Markdown, HTML now) |
| FE-6 | Word import | BE-3 | Blocked by BE-3 |
| FE-7 | AI chat leftovers | — | Ready |
| FE-8 | Move to the published SDK | SDK-4, later SDK-7 | 0.3.0 done; 0.4.0 waits on SDK-7 |

When a phase is done, tick its boxes, set its row to **Done**, and pass on its hand-off line.

---

## FE-0 — Develop against the local SDK

**Goal:** build web phases while the SDK changes are in progress, without publishing every step.

### To-dos
- [ ] Document the local-link workflow in this file:
  - `npm link`, or `file:` pointing at `../../incantly-canvas/canvas/packages/core` (and later `packages/docx`);
  - then the SDK package build;
  - then restarting `next dev` (note `transpilePackages` in `next.config.ts`).
- [ ] Make sure the link is never committed. `package.json` keeps the published version, and the link is a local, uncommitted step.

**Done when:** a change in the local SDK shows up in the web app after an SDK build and a dev-server restart.

---

## FE-1 — Page setup panel

**Goal:** a note can be switched between continuous and paginated, and given paper size, orientation, margins, columns and a starting page number.

**Depends on:** nothing (the `PageSetup` model is already in 0.2.0).

### To-dos
- [x] Hook `src/hooks/use-page-setup.ts`:
  - reads the open note's `metadata.pageSetup` (and `metadata.layout` when present);
  - `updatePageSetup(patch)` writes a new document through the note session as one saved change;
  - holds the unit preference (cm/in/pt) as local UI state.
- [x] Add to `useNoteSession`/`NoteSync` a way to save a metadata-only change (like `rename`) as a checkpoint, so page setup isn't lost while the editor holds the body. Also reload the editor's page view after it changes.
- [x] Pure helper `pageSetupModel.ts` (unit-tested):
  - unit conversion (pt ↔ cm/in, shown in the user's unit and stored in points);
  - presets (A4, Letter, Legal, custom);
  - margin presets (Normal, Narrow, Wide);
  - validation (margins smaller than the page; minimum page size).
- [x] Panel `workspace/PageSetupPanel.tsx`, opened from the note menu ("Page setup") in the side panel:
  - mode (Continuous / Pages);
  - paper and orientation;
  - margins, linked or individual;
  - columns (1 or 2);
  - starting page number;
  - mirrored margins.

  It uses the design system; the demo `PageSettings` form is not shipped as-is.
- [x] Note menu entry, disabled while the note is read-only.
- [x] Responsive at 320/375/768/1024/1440 px; every control 44 px and keyboard operable.

**Done when:** changing paper size, margins or mode saves (the note shows "Saved", and a reload keeps it), and continuous notes are unchanged.

**Built (2026-11-01):**
- **The page setup save path:** page setup is changed **through the editor**, as one document-attribute step (`lib/document-editor/documentMetadata.ts`).
  - Every full save rebuilds metadata from the editor's top node, so a separate metadata save would be overwritten by the next edit.
  - This way the change saves like any other edit, and later edits keep it.
  - That replaces the planned `NoteSync` metadata path.
- **Code:** `pageSetupModel.ts` (unit-tested), `hooks/use-page-setup.ts`, `workspace/PageSetupPanel.tsx`, and "Page setup" in the note menu.
- **Page lines (interim):** `paginationExtension.ts` now reads the note's own page setup, showing lines only in Pages mode, spaced by the real page height minus margins. FE-3 replaces this with the SDK paginator.
- **Verified in Chrome against the local backend:**
  - Pages mode, two columns, a 2 cm top margin, landscape;
  - each saved to the server and survived a later full save and a reload;
  - invalid margins and non-numbers show an error and never reach the note;
  - no overflow at 320 and 768 px.

**Hand-off:** "FE-1 is done: tell the backend agent to run BE-1's save/load check with a paginated note that has custom margins and two columns."

---

## FE-2 — Header & footer editor

**Goal:** write headers and footers like Word: text plus page number, page count, title or date, with a different first page and odd/even pages.

**Depends on:** SDK-1 (`headerFooterFor`, `formatHeaderFooterField`, layout builders). Use FE-0 until SDK-4 is published.

### To-dos
- [x] Hook `src/hooks/use-header-footer.ts`:
  - reads and writes `metadata.layout` for the default section through the SDK builders;
  - variant switching (default / first / odd / even);
  - toggles for "different first page" and "different odd & even";
  - saves through the same path as FE-1.
- [x] A small Tiptap editor per header/footer slot: paragraph text with bold/italic, alignment (left/center/right), and an "Insert" menu for page number, page count, title and date. Fields are inline atoms that render live values through `formatHeaderFooterField`.
- [x] Number format choice (1, 2, 3 / i, ii, iii / I, II, III) and starting number (shared with FE-1).
- [x] Shown in the Page setup panel as a "Header & footer" section. Preview text uses `headerFooterPlainText`.
- [x] Ready-made options: "Page 1", "Page 1 of 10", "Title — Page 1", "No header on first page".
- [x] Unit tests for the hook's pure parts.

**Built (2026-11-02):**
- **Model decision:** the user chose inline page fields inside header/footer text (SDK commit `3ab493f`, backend commit `49550b0`).
- **Code:**
  - `lib/document-editor/headerFooterConversion.ts` (unit-tested);
  - `components/HeaderFooterTextEditor.tsx`, a mini Tiptap editor with alignment, bold, italic, underline and inline field chips;
  - `workspace/headerFooterModel.ts` (tabs, presets, number style, page 1–3 preview; unit-tested);
  - `hooks/use-header-footer.ts`, saving through the editor like FE-1 and batching typing for 500 ms;
  - `workspace/HeaderFooterSection.tsx` in the Page setup panel.
- **Verified in Chrome (local SDK build, FE-0):**
  - the Title header, "Page 1 of 10" footer and blank first page;
  - typing reached two saves, each carrying the layout and accepted (200);
  - the preview showed "Page 2 of 3 · Draft";
  - nothing overflows at 320 px, and every target is 44 px.
- **Open:** a reload keeping headers/footers needs the backend running BE-1 (`page-layout-persistence`). The backend on `:3002` runs a branch without it and drops `layout`.

**Done when:** a note with "Page X of Y" in the footer and no header on the first page saves and reloads, and FE-4's preview shows it.

**Hand-off:** "FE-2 is done: ready for FE-4 checks with real headers and footers."

---

## FE-3 — Accurate page lines

**Goal:** in "Pages" mode, page lines follow the real paper, margins and header/footer space, labelled "Page 2", "Page 3". Continuous notes show no lines.

**Depends on:** SDK-3 (`pageRegions`, `paginateDocument`).

### To-dos
- [ ] Replace `paginationExtension.ts`'s fixed 1,056 px with a measurement adapter:
  - measure top-level block boxes after layout, batched once per animation frame;
  - feed them to `paginateDocument`;
  - draw break markers and page labels as decorations.
- [ ] Only active when `pageSetup.mode === 'paginated'`. Off for continuous notes; editor options are toggled by FE-1's mode.
- [ ] Page labels use the printed page number (starting number, number format).
- [ ] A warning chip for a block taller than a page ("This table is taller than a page").
- [ ] Re-measure on fonts loading, container resize and zoom; never loop.
- [ ] Performance check: typing in a 100-page note stays smooth (no layout thrash; measurement off the input path).
- [ ] Accessibility: markers are `aria-hidden`; page labels never enter copy/paste or find.

**Done when:** an A4 note with 2.54 cm margins shows page lines matching FE-4's preview to within a line, and continuous notes show none.

---

## FE-4 — Print preview and PDF

**Goal:** see the exact pages with headers, footers and numbers before exporting, then save as PDF.

**Depends on:** SDK-2 (print CSS from the real layout).

### To-dos
- [ ] Hook `src/hooks/use-print-preview.ts`:
  - builds the export HTML from the current note (with images resolved through the asset host);
  - runs Paged.js in an isolated container;
  - reports the page count and warnings;
  - cancels on close.
- [ ] Panel `workspace/PrintPreview.tsx`: the page stack, zoom (fit width / 100%), page count, warnings list, and a "Print / Save as PDF" button (system print dialog).
- [ ] Loading and error states. Paged.js loads only when the preview opens.
- [ ] Mobile: one page per screen width with scroll; the print button is always reachable.

**Done when:** the preview shows the FE-2 footer "Page X of Y", no header on page 1, the right margins and two columns, and the printed PDF matches it.

**Hand-off:** "FE-4 is done: the PDF part of FE-5 can ship."

---

## FE-5 — Export menu

**Goal:** export a note as PDF, Word, Markdown, HTML or Incantly file.

**Depends on:** PDF needs FE-4; Word needs SDK-5 (`exportDocx`), through the FE-0 local link until SDK-7 publishes `@incantly/canvas-docx`. Markdown and HTML are ready now.

### To-dos
- [ ] Hook `src/hooks/use-note-export.ts`:
  - one function per format;
  - images resolved through the asset host;
  - progress, cancel, warnings and download through `downloadExport`.
- [ ] Note menu "Export" with formats, warnings shown after export ("2 embeds were left out").
- [ ] Word: replace the inline DOCX code in `exporters.ts` with `@incantly/canvas-docx`'s `exportDocx`. This also removes the margin-unit bug.
- [ ] Remove dead export code once each format moves to the SDK.

**Done when:** each format downloads, and the Word file opens with the note's paper, margins, header/footer and page numbers.

---

## FE-6 — Word import

**Goal:** import `.docx` (Word, WPS, Google Docs) as an editable note that keeps its layout.

**Depends on:** BE-3 (the backend accepts `.docx` note imports and returns an import report).

### To-dos
- [ ] Extend `use-imports` and the import dialog to accept `.docx` (and `.doc`/`.odt`/`.wps` once BE-4 lands). Use the same upload and job flow as other note imports.
- [ ] Show progress, then the report from the job ("Imported. 2 text boxes became plain text; footnotes moved to a Notes section"), then open the note.
- [ ] Google Docs hint in the dialog: "In Google Docs, choose File → Download → Microsoft Word (.docx), then import it here."
- [ ] Error copy for the new backend error codes (size limit, unsupported or encrypted file, macros).
- [ ] Imported notes open in "Pages" mode when the file had pages (the backend sets `pageSetup.mode`).

**Done when:** a Word paper, a Google Docs export and a WPS file import with their paper, margins, headers/footers and content, and the report is shown.

---

## FE-7 — AI chat leftovers

**Goal:** finish the smaller items from the note-assistant work.

**Depends on:** nothing.

### To-dos
- [ ] Group repeated steps in the step list ("Read your note ×2") in `aiModel.activitySteps` (unit-tested).
- [ ] Remove the app's duplicate "nothing in your note changed" notice now that the backend states it (`editsNotStored`).
- [ ] "Search the web too" toggle in the chat (`webSearch: true`). Off by default, shown as an explicit choice; web citations (`kind: "web"`) open their `url`.
- [ ] "Ask the assistant to redo this part" on a stale suggestion: a new request with that block selected and the original instruction.
- [ ] Answers finished while away: `GET /v1/ai/jobs` (`seenAt: null`, `COMPLETED`) shows a dot on the chat button; opening the answer calls `POST /v1/ai/jobs/{id}/seen`.
- [ ] Folder upload to the Library: `POST /v1/assets/uploads/batch` and `POST /v1/library/sources/batch` (up to 50 files), with per-file progress and errors.

**Done when:** each item works against the local backend, with unit tests for the pure parts.

---

## FE-8 — Move to the published SDK

**Depends on:** SDK-4 (0.3.0); repeat after SDK-7 (0.4.0) to add `@incantly/canvas-docx`.

### To-dos
- [x] Bump `@incantly/canvas-core` to 0.3.0 (and `@incantly/canvas-react` with it) in `package.json`, removing the local copy. Adding `@incantly/canvas-docx` waits for 0.4.0.
- [ ] Run typecheck, lint and unit tests, and check the dev server and `npm run build:cf`.

**Done when:** the app builds from published packages only.

**0.3.0 done (2026-11-02):** Incantly/canvas#16 merged, `v0.3.0` published by the release workflow, and the web app installs it from GitHub Packages. Typecheck, 275 unit tests and lint (no new errors) pass. `npm run build:cf` is still to run.
