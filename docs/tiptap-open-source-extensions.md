# Tiptap Open-Source Extensions — Implementation To-Do

Source: [Tiptap extension overview](https://tiptap.dev/docs/editor/extensions/overview?filter=opensource)
(cross-checked against the public [`ueberdosis/tiptap`](https://github.com/ueberdosis/tiptap/tree/main/packages) package list, September 2026.)

Legend: `[x]` implemented · `[ ]` to implement · `custom` means our own canonical-backed node/mark replaces the Tiptap package (per the tiptap-adapter skill, a Tiptap-default must never sit beside its canonical twin).

> Rule for every `[ ]` item picked up: adding an extension is a persisted-format decision. It ships with its canonical-model mapping, a round-trip fixture, and E2E proof in the same change. Collaboration stays out until its own phase.

## Nodes

- [x] Audio (`extension-audio`) — custom `audio` asset-card node; Tiptap package not installed
- [x] Blockquote — stock Tiptap package (+ canonical id attribute)
- [x] BulletList — stock Tiptap package (+ id, checklist parse guard)
- [x] CodeBlock — custom node (plain, no highlighting)
- [x] CodeBlockLowlight — implemented: lowlight decorations (JS/TS/Python/Bash/JSON/HTML-CSS/Markdown) + bubble-toolbar language picker
- [x] Details / DetailsSummary / DetailsContent — implemented: canonical `details` node (summary + open + body), `/details` slash item, persist open state
- [x] Document — custom root node
- [x] HardBreak — Tiptap default via StarterKit
- [x] Heading — custom node (levels 1–2 in UI, 1–6 parsed on paste)
- [x] HorizontalRule — custom node, slash-menu "Divider"
- [x] Image — custom `image` asset-card node; Tiptap package not installed
- [x] List: ListItem, OrderedList (+ ListKeymap) — stock Tiptap packages (+ id, checklist parse guards; adapter prepends a paragraph when canonical item content is not paragraph-first)
- [x] Mathematics — stock BlockMath + InlineMath nodes (KaTeX render; block keeps numbered/label attrs). Canonical `InlineNode` learned `inlineMath`; legacy `inlineMath` marks load via the `inlineMathMark` alias. `$...$` typing offers a bubble convert button; auto-convert input rules stay off so currency never converts uninvited
- [ ] Mention — @-mentions with suggestion UI
- [x] Paragraph — custom node
- [x] Table / TableRow / TableCell / TableHeader — custom nodes with schema roles
- [ ] TableOfContents — auto-generated TOC from headings
- [x] TaskList / TaskItem — no v3 package; covered by custom Checklist / ChecklistItem
- [x] Text — custom inline node
- [ ] Twitch — Twitch embeds
- [x] Youtube — covered by custom `videoEmbed` (YouTube provider)
- [ ] Emoji — emoji suggestion input
- [ ] RubyText — ruby annotations (East-Asian reading aids)

## Marks

- [x] Bold — Tiptap default
- [x] Code — Tiptap default (inline code)
- [x] Highlight — custom `highlight` mark; Tiptap package not installed
- [x] Italic — Tiptap default
- [x] Link — Tiptap default, locked down (no autolink, no open-on-click, no link-on-paste; http/https/mailto/tel only)
- [x] Underline — standalone package (StarterKit copy disabled to avoid a twin)
- [x] Strike — Tiptap default
- [ ] Subscript
- [ ] Superscript
- [x] TextStyle — implemented: stock `textStyle` mark from `@tiptap/extension-text-style` (replaces the custom mark slot; canonical `textColor` maps to it in conversion.ts)
- [x] Color — implemented: stock `Color` extension (`setColor`/`unsetColor` via `documentRichCommands.setTextColor/unsetTextColor`) + bubble-toolbar color picker; persists as canonical `textColor` (verified live: set → reload → persists, unset prunes)
- [x] FontFamily — implemented: stock extension; canonical `fontFamily` mark (`sans`/`times`/`mono` keys, system stacks) in core; one `textStyle` mark splits into color+family marks in the adapter; bubble Aa picker with options in their own typeface
- [x] FontSize — implemented: stock extension; canonical `fontSize` mark (points, gate 1–200) in core; `textStyle` carries color+family+size together; bubble size picker with Word presets and glyph icon
- [x] TextAlign — implemented: stock extension (`left`/`center`/`right` only, no justify) owns the global `textAlign` attr on paragraph/heading (dead local twins removed); canonical `alignment` unchanged; bubble icon+name buttons with toggle-off
- [x] LineHeight — intentionally not installed: the stock mark is per-word (`textStyle`), conflicting with the canonical paragraph `lineHeight` (0.5–10, Word-style). Covered by the paragraph render rule + bubble spacing picker (Default/Single/1.15/1.5/Double)

## Functionality

- [x] BubbleMenu — package installed, selection toolbar rendered in `FormattingUI.tsx`
- [ ] FloatingMenu — package installed but unused (empty-line menu not wired up)
- [x] Placeholder — standalone package, current-block hint only, never persisted
- [x] UndoRedo — Tiptap default via StarterKit
- [x] DropCursor — Tiptap default via StarterKit
- [x] GapCursor — Tiptap default via StarterKit
- [x] UniqueId — covered by custom `IncantlyNodeIds` (stable IDs + repair reporting)
- [ ] CharacterCount — word/character limits and counters
- [ ] DragHandle — block drag-and-drop handles
- [ ] FileHandler — paste/drop file handling (partly covered by custom `useAssetUploads`)
- [ ] FindAndReplace — in-document search and replace
- [ ] Focus — focus-mode styling for the active block
- [ ] InvisibleCharacters — render spaces/line-breaks visibly
- [ ] NodeRange — range selection helpers
- [ ] Selection — selection utilities
- [ ] TrailingNode — trailing paragraph guarantee (explicitly disabled in our StarterKit config)
- [ ] Typography — smart quotes, dashes, and other typographic replacements
- [ ] Collaboration — deferred: explicitly out of scope until the collaboration phase
- [ ] CollaborationCaret — deferred with Collaboration

## Not extensions (excluded)

Framework plumbing, not editor features: `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/vue`, `@tiptap/html`, `@tiptap/markdown`, `@tiptap/static-renderer`, `@tiptap/suggestion`, `ai-toolkit`, `starter-kit` (bundle only).
