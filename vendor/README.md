# Vendored packages

`incantly-canvas-core-0.3.0.tgz` is the npm package artifact of `@incantly/canvas-core`
version `0.3.0`, built from `incantly-canvas/canvas/packages/core` (Incantly/canvas#16).
The web app pins this repository-owned artifact instead of the registry 0.3.0, which
predates the first-class `figure` document node.

The current artifact (0.3.0, refreshed for simulations) includes the `figure` document
node (`FigureNode`, `insertFigure` command, schema v2 migration). It is byte-identical
to the artifact vendored in the backend repo; refresh both together.

Any artifact refresh must keep the version pin, be reviewed with its source change,
and update `package-lock.json`.

Do not confuse `@incantly/canvas-core` (this vendored document engine) with the Solutus
scene runtime `@incantly/core`, which arrives from GitHub Packages (see the committed
`.npmrc`) as a dependency of `@incantly/tiptap`.
