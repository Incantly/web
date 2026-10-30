<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI color system

- Read `docs/design-system.md` before creating or changing UI.
- Treat the color rules in that document as mandatory.
- Never add a raw hex, RGB, HSL, or named color inside a component or page.
- Use semantic `--ui-*` tokens in CSS and semantic Tailwind color utilities in JSX.
- Change the palette only in the primitive block at the top of `src/app/globals.css`.
- Do not use `--palette-*` primitives directly in components.

## Responsive UI

- Responsiveness is required during implementation, not as a later cleanup pass.
- Build mobile-first from the 320px baseline, then enhance at the project
  breakpoints defined in `src/app/globals.css`.
- Every UI change must be checked at 320px, 375px, 768px, 1024px, and 1440px.
- Prefer flexible grid, flexbox, `minmax()`, `clamp()`, and intrinsic sizing over
  fixed widths or JavaScript viewport measurements.
- Components must tolerate long text, empty content, zoom, and dynamic data
  without horizontal page scrolling or clipped controls.
- Touch targets must be at least 44px by 44px. Hover behavior must have touch
  and keyboard equivalents.
- Use responsive image sizes and explicit dimensions to avoid layout shift.
- Full-bleed fixed or sticky UI must account for safe-area insets.
- A UI task is not complete until its responsive states have been verified.

## Feature contexts (mandatory)

- Workspace state lives in React contexts under `src/components/product/features/`,
  not in big component files or prop chains. Read state through the hooks
  (`useNavigation`, `useWorkspaceUI`, `useNotes`, `useSpaces`, `useLibrary`,
  `useImports`, `useAssistant`) instead of passing it down as props.
- Every API-backed feature gets its own `<Feature>Provider` and `use<Feature>()`
  hook in `features/<feature>/`, created with `createFeatureContext`, and is added
  to `features/WorkspaceProviders.tsx`. New components never call `/v1/*` directly;
  a few older ones still do (asset downloads, note history) and move behind a
  feature hook when next touched.
- Providers are thin over React Query: they bundle queries and workspace-level
  actions, and never keep a second copy of server data.
- Keep pure helpers (`*Model.ts`) as plain, unit-tested functions, and keep local UI
  state (a menu being open, a draft) local. Components reused outside the workspace
  (`Sidebar`, the form dialogs) stay props-in.

## Agent skills

Skills in `.claude/skills/` are mandatory for the tasks they describe — read the matching skill before starting, not after failing:
- `document-schema`, `document-validation`, `document-storage`, `document-export` — any document content, load/save, persistence, sync, export, or print work.
- `tiptap-adapter` — any editor schema, conversion, toolbar, slash menu, or pagination UI work.
- `poteto-mode` (global, `~/.agents/skills/poteto-mode/`) — house agent style for multi-step work: verify against the real artifact, reproduce bugs before fixing, keep diffs minimal.

Async document jobs follow `docs/inngest.md` (contract; Inngest is not installed yet).

## Finishing work and testing (mandatory)

- **Finish every to-do you are given.** When the user or a plan (for example
  `docs/api-integration-plan.md`) gives you to-dos, complete all of them before
  calling the work done. Do not stop after a subset, silently drop items, or
  leave `[ ]` boxes behind. Mark each item `[x]` as it lands. If an item is
  truly blocked, say exactly what blocks it and what is needed. Then keep
  going with everything that is not blocked.
- **No end-to-end tests until the user asks for them.** Do not write new
  Playwright/E2E specs, and do not run (`npx playwright test`,
  `npm run test:e2e`) any E2E test, even when a to-do lists one. Mark such
  items `[~]` deferred, citing this rule, until the user explicitly says to
  write or run E2E tests. Typecheck, lint and unit tests are still required.
- **No screenshots unless the user asks.** Verify with code-level checks,
  unit tests and DOM/state assertions instead. This rule overrides the
  screenshot requirement in the next section until the user lifts it.

## Screenshots & recordings

_Applies only when the user has asked for screenshots or E2E tests (see above)._

- Every implementation task owns one artifact folder. Screenshots go in
  `e2e-artifacts/screenshots/<task-slug>/`, recordings in
  `e2e-artifacts/videos/<task-slug>/`. Never drop files flat into
  `screenshots/`. Both paths are gitignored and stay local; the durable proof
  is a passing `results.json` entry per check.
- `<task-slug>` is the kebab-case feature name (`text-color`, `table-grid`).
  Name files after the state they prove (`applied.png`, `persisted.png`,
  `mobile-390.png`), never `screenshot-1.png`.
- Specs: call `shot(page, '<task-slug>/<state>')` — `tests/e2e/artifacts.ts`
  creates subfolders automatically. CLI: pass an explicit namespaced path,
  e.g. `screenshot --filename=e2e-artifacts/screenshots/<task-slug>/<state>.png`
  (same pattern for `video-start` under `videos/`).
- A task is not done until its folder holds the decisive states and
  `results.json` has a passing entry per check.
