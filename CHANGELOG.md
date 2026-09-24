# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- Every output a node type declares is drawn, wired or not. A Loop Over Items with nothing on `done` showed one centred port and no labels, with the `loop` connector leaving from the tile's centre; it now shows both ports with `done` and `loop` beside them, as n8n does, and the connector leaves from the `loop` port. The same applies to an IF or Switch with an unwired branch.
- Output names (`true`, `false`, `done`, `loop`, Switch output keys) sit beside their port instead of halfway along the connector. A connector's label now carries only the item count from a run.

## 0.2.0 — 2026-09-21

### Added

- Touch: a one-finger drag pans, two fingers pinch-zoom, and a tap opens a node. A phone had no way to move the canvas or open the inspector before, because panning needed a wheel, a middle button or a held key, and opening needed a double click.
- The inspector adapts to its container. Below 760 pixels it shows Input, the node and Output one at a time with a switch at the top; the three columns used to be squeezed side by side until they were unreadable. It measures the element, not the screen, so a narrow embed on a wide page gets the narrow layout too.

### Fixed

- `export --scale N` with an `.svg` output is now a usage error; it used to be accepted and do nothing.
- Every argument error exits 2. A missing input file, a missing `-o` and a bad `--scale` used to exit 1 while an unknown flag exited 2.

### Changed

- README cut down to description, installation, getting started and core usage; the reference moved to `docs/` (`cli.md`, `web-component.md`, `node-api.md`, `faq.md`).
- README: the npm quickstart downloads two sample files so it runs as pasted; the known-issues entry about `--version` is corrected (the flag exists).

## 0.1.0 — 2026-09-20

First release: workflow and execution rendering, the `<workflow-render>` element
with inspector and export buttons, the static viewer page, and the
`workflow-render export` / `workflow-render view` CLI.

### Changed

- **One published package.** `workflow-render` is now self-contained: the CLI
  bundles the internal `core` and `assets` libraries (esbuild), ships the
  n8n-derived data and the Inter faces in `data/`, and carries the browser
  element and its sidecars at the stable path `dist/element/` (the CDN path:
  `https://cdn.jsdelivr.net/npm/workflow-render/dist/element/workflow-render.js`).
  `workflow-render-assets`, `-core` and `-element` are private workspace
  libraries and are no longer meant for npm. Before this, installing the packed
  CLI failed with E404 on those three names.
- `@resvg/resvg-js` (native), `marked` and `lit` (types of `./element`) are the
  package's only runtime dependencies; a test fails the build if the bundle
  imports anything undeclared.
- `view` finds the element beside the bundle instead of through a package name,
  and no longer tries to stream a directory.
- `loadWebFonts()` is typed `Uint8Array` rather than `Buffer`, so the published
  types need no `@types/node`.

### Added

- Subpath exports with types: `workflow-render/core` (the pipeline, the data
  loaders and a one-call `renderToSVG(json)`) and `workflow-render/element`
  (registers `<workflow-render>`).
- `workflow-render --version`.
- `WORKFLOW_RENDER_DATA` overrides the data directory; `dataRoot()` is the one
  place that resolves it.
- `pnpm smoke` (`scripts/smoke.sh [clone|npm|all]`): an install-level acceptance
  test that builds a fresh clone and installs the packed tarball into an empty
  project, then runs the README quickstart against each — SVG with real icons,
  PNG through the native addon, an execution export, `view` over HTTP, the
  subpath exports and their types. CI runs it on Linux and macOS, Node 20 and
  22, with `publint` and `@arethetypeswrong/cli`.

### Fixed

- CLI: unknown flags (`--theme`, a misspelt `--sclae`) are now an error with
  the usage text and exit status 2 instead of being silently ignored; each
  command accepts only its own flags.
- CLI: parser warnings (a connection to a node that does not exist, a sticky
  note with no usable size) are printed to stderr as `warning: …` after a
  successful export instead of being discarded.
- The emulated n8n version is pinned once, in `workflow-render-assets/version`;
  `workflow-render-core` derives `DESCRIPTIONS_VERSION` from it and a test checks
  both against the committed `meta.json`.
- `workflow-render-element` now emits its type declarations, so the package's
  `types` entry resolves.
- `pnpm install` no longer warns about ignored build scripts for
  `isolated-vm`, `ssh2` and `cpu-features` (transitive devDependencies of the
  conformance test's oracle, never needed built).

### Added

- Publish-ready package metadata for `workflow-render-assets`, `core`, `element`
  and `cli` (description, keywords, repository, engines, files).
- README rewritten around the rendered canvas; `CONTRIBUTING.md`,
  `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and pull-request templates.
- `order-intake` fixture and golden (the README hero workflow).
