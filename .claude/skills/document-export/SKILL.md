---
name: document-export
description: Document export pipeline rules (TXT, Markdown, HTML, PDF, DOCX). Use before adding or changing any export, print, or download flow in this app.
---

# Document Export Rules

Exports are projections of the validated canonical model — computed from `IncantlyDocument` data, never scraped from the editor DOM.

## Must

- Export from core (`exportText`, `exportMarkdown`, `documentToHtml`, DOCX/PDF pipelines) with the document's `PageSetup` honored where the target format supports it.
- Return explicit loss/warning reports for every lossy conversion (formatting, media, layout, rich structure). Show the report next to the download — preview first, download second.
- Keep heavy exporters (DOCX/ZIP, Paged.js) dynamically imported and out of the default bundle. Load them only when export/print is requested.
- Isolate print rendering: Paged.js runs over sanitized export HTML in a hidden iframe or detached surface, never over the live `contenteditable` tree. It is an export renderer, not the pagination oracle.
- Sanitize links, embeds, filenames, and externally resolved assets before export.

## Never

- Never `innerHTML` the live editor into a file.
- Never silently drop unsupported content — report it or map it to a documented fallback.
- Never block editing on export progress; expose progress, cancellation, and retry.
- Never claim a format is lossless when it isn't — document which formats preserve editing semantics, which preserve layout, and which are intentionally lossy.
