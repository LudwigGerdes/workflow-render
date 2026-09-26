# Working on workflow-render

workflow-render renders an n8n workflow JSON or execution JSON as a read-only,
n8n-lookalike canvas without an n8n instance: a `<workflow-render>` web component, a
static viewer page, and a CLI that exports SVG/PNG. It is a generic viewer with
per-platform adapters; n8n is the only adapter so far.

## Package layout

pnpm workspace, `packages/*`:

| Package | Published? | What it is | Depends on |
|---|---|---|---|
| `workflow-render` (`packages/cli`) | **yes, the only one** | the CLI (`export`, `view`, `--version`), plus everything below bundled in: subpaths `workflow-render/core` and `workflow-render/element`, `data/`, `dist/element/` | `@resvg/resvg-js` (native, never bundled), `marked`, `lit` (types of `./element` only) |
| `workflow-render-assets` | private | committed n8n-derived data per emulated version (`data/<version>/`), Inter fonts, the loaders (`loadIcons`, `loadDescriptions`, `loadSubtitles`, `loadMeta`, `fontFiles`, `loadWebFonts`) and `dataRoot()`; dev-time extractor `scripts/extract.ts` | — |
| `workflow-render-core` | private | the pure pipeline `parseInput → layout → renderSVG`, `renderWorkflow`, `exportSVG`, the inspector form/data model, adapters (`src/adapters/`). Zero DOM dependencies | assets, `marked` |
| `workflow-render-element` | private | the Lit web component `<workflow-render>`; Vite lib build to one ESM file `dist/workflow-render.js` plus sidecars (`workflow-render-icons.json`, `-subtitles.json`, `-descriptions.json`, `inter-*.woff2`) | core, assets, `lit` |
| `workflow-render-site` | private | the static viewer page (paste / drop / `?src=`), embed-snippet generator | element |

## The published package

`packages/cli/scripts/build.mjs` (run by `pnpm build`, after the element's Vite
build) produces everything that ships; `dist/` and `data/` there are gitignored
build outputs:

```
packages/cli/                      = node_modules/workflow-render/ once installed
  dist/cli.js                      bin (esbuild bundle: this package + core + assets)
  dist/index.js   + index.d.ts     "."        exportFile, renderFile, serve, parseArgs
  dist/core.js    + core.d.ts      "./core"   the pipeline, the loaders, renderToSVG(json)
  dist/chunk-*.js                  shared code — one esbuild run with `splitting`, so the CLI and ./core are ONE module instance
  dist/element/workflow-render.js  "./element", and the CDN path; with its .d.ts,
    workflow-render-{icons,subtitles,descriptions}.json, inter-{400,500,600}.woff2
  data/fonts/, data/<version>/     a copy of packages/assets/data
  LICENSE, README.md, THIRD_PARTY_NOTICES.md   copied in at prepack, removed at postpack (scripts/pack-files.mjs, which also refuses to pack an unbuilt package)
```

How things are found at runtime — never through a workspace package name:

- **Data:** `dataRoot()` in `packages/assets/src/data-root.ts` is the one
  resolver. Rule: the directory `data` beside the directory holding the running
  code (`packages/assets/{src,dist}` → `packages/assets/data`;
  `packages/cli/dist` → `packages/cli/data`; installed → `<pkg>/data`), unless
  `WORKFLOW_RENDER_DATA` names another directory of the same shape. This is why
  every chunk must stay flat in `dist/` (`test/package.test.ts` checks).
- **Element:** `elementDir()` in `packages/cli/src/view.ts`: `./element` beside
  the bundle, `../dist/element` from the sources under test.
- **In the browser** the element fetches its sidecars relative to its own URL,
  so the file names in `dist/element/` are a public contract (CDN users and
  the landing page copy them by name). Do not rename them.
- Third-party imports stay `external` and must be in `dependencies`;
  `packages/cli/test/dist-deps.test.ts` reads the built files and fails on any
  undeclared bare specifier (JS and `.d.ts`), on a bundled-in `.node` file, and
  if the element bundle imports anything at all.
- Declarations are rolled up with `dts-bundle-generator` (core and assets
  inlined). Public types must not need `@types/node`: the smoke test typechecks
  a strict consumer with `skipLibCheck` off and no node types.

`pnpm smoke` (`scripts/smoke.sh [clone|npm|all]`) is the acceptance test for
all of the above: a `git clone` of the committed state built from scratch, and
`pnpm pack` → `npm install <tarball>` in an empty project, each running the
README quickstart (real icons in the SVG, PNG via the native addon, execution
export, `view` fetched with curl on a free port, the initials fallback via
`WORKFLOW_RENDER_DATA`, subpath exports and types, tarball contents). It uses
its own `HOME` and temp dirs and cleans up. It needs the network for
`npm install`. Never make it pass by asserting less.

## Prerequisites

- Node >= 20 (CI runs 20 and 22)
- pnpm 10 (`packageManager` in the root `package.json`)

## Commands

```bash
pnpm install
pnpm build          # whole chain, serialised (see build order)
pnpm typecheck      # AFTER build: element/cli/site resolve core through its dist
pnpm test           # vitest across all packages; needs a prior build (bundle budget, dist-deps, package shape)
pnpm smoke          # install-level acceptance test: fresh clone + packed tarball (see above)
pnpm --filter workflow-render-core test              # one package
pnpm --filter workflow-render-core test golden       # one file pattern
node packages/cli/dist/cli.js export packages/core/test/fixtures/branching.json -o out.png --scale 2
node packages/cli/dist/cli.js view   packages/core/test/fixtures/execution-loop.json
pnpm --filter workflow-render-site dev               # viewer page with live element reload
```

`cpu-features`, `isolated-vm` and `ssh2` are transitive devDependencies of
`n8n-workflow` (needed only by one test, never built); they are listed under
`pnpm.ignoredBuiltDependencies` in the root `package.json` so `pnpm install`
does not warn about them.

## Build order

`element` bundles `core`'s `dist`, and `core` compiles against `assets`' `dist`,
so each package's `build` script first builds the one below it, and the root
build is serialised (`pnpm -r --workspace-concurrency=1 build`): `cli` and
`site` both chain element's build (cli then runs `scripts/build.mjs`, which
bundles and stages `dist/element/` and `data/`), and two concurrent `vite build` runs on
element race over its emptied `dist`. `typecheck` therefore fails on a fresh
clone until `pnpm build` has run once.

The Vite build prints several `new URL(...) doesn't exist at build time`
warnings. They are expected: those are the runtime sidecars.

## Tests, fixtures and goldens

- vitest everywhere; core tests are headless Node, element and site tests run
  under happy-dom.
- Fixtures: `packages/core/test/fixtures/*.json` (workflows and executions,
  synthetic data only). Add a small one and list it in `test/golden.test.ts`.
- Goldens: `packages/core/test/golden/*.svg`, our own previous output,
  re-rendered and byte-compared. A missing golden is written on the first run.
  Regenerate with `UPDATE_GOLDENS=1 pnpm --filter workflow-render-core test golden`;
  approving one means reading the diff. Any change to a visual constant
  invalidates every golden, which is the point.
- `packages/core/test/inspector/conformance.test.ts` checks our
  `displayOptions` evaluator against `n8n-workflow` (devDependency only) over
  every property of every bundled node type.
- `packages/element/test/budget.test.ts` fails the build if `dist/workflow-render.js`
  exceeds 300 KB gzip; `packages/cli/test/package.test.ts` applies the same
  budget to the file that is actually published (`packages/cli/dist/element/workflow-render.js`)
  and checks it is byte-identical to the element build.
- No network in tests. The only networked code is `packages/assets/scripts/extract.ts`.

## Regenerating the n8n-derived data

```bash
pnpm --filter workflow-render-assets extract <n8n-version>
```

downloads the published `n8n-nodes-base` / `@n8n/n8n-nodes-langchain` packages
and the tagged n8n source tarball, and writes `packages/assets/data/<version>/`
(`icons.json`, `descriptions.json`, `subtitles.json`, `glyphs.json`,
`meta.json`). Then bump `EMULATED_VERSION` in `packages/assets/src/version.ts`
— the single pin; core's `DESCRIPTIONS_VERSION` is derived from it and
`packages/core/test/version.test.ts` checks both against `meta.json` — rebuild,
and regenerate the goldens.
`meta.json` lists every node type that fell back to a monogram; a new
fallback is a regression in the extractor, not a data fact.

`packages/core/src/font-metrics.generated.ts` is produced by
`pnpm --filter workflow-render-core extract-font-metrics` from
`packages/assets/data/<version>/font-metrics.json`, which holds glyph advances
measured in a browser from a live n8n canvas. The pixel-comparison harness
that once fitted constants against screenshots is gone; the measured values
were kept and the provenance is recorded in the comments.

The data is n8n GmbH's under the Sustainable Use License, not MIT; see
`packages/assets/data/README.md` and `THIRD_PARTY_NOTICES.md`.

## Running without the data

The bundles are optional. If `icons.json`, `subtitles.json` or
`descriptions.json` is missing, the assets loaders resolve to an empty
catalogue (`packages/assets/src/index.ts`): every node renders as an initials
tile at the normal icon geometry, subtitles are blank, and the inspector opens
with a "no description available" notice showing parameters as stored. The
element does the same when a sidecar 404s. Tests:
`packages/assets/test/assets.test.ts` ("missing data files"),
`packages/core/test/render.test.ts` ("initials tile"),
`packages/element/test/element.test.ts` ("icon sidecar"),
`packages/element/test/ndv.test.ts` ("descriptions sidecar is missing").

## Conventions

- **Measured, never copied.** Visual constants (`packages/core/src/constants.ts`,
  `theme.ts`) are read off a running n8n canvas, not taken from n8n's source,
  which is Sustainable-Use licensed. Say in the comment what was measured.
- **Adapters, not n8n-specific code.** `packages/core/src/adapters/` turns a
  platform payload into the neutral `CanvasModel`; nothing downstream knows what
  n8n is. Detection is structural (`nodes`+`connections` ⇒ design view,
  `workflowData`+`runData` ⇒ execution view), never keyed off a version field.
  Canvas only: no interpreting Code nodes or tracing logic.
- **Pure core.** `parse → layout → render` are pure functions producing one SVG
  string; viewer and export share the path, exports are byte-deterministic.
- **Offline-first.** No runtime network except the user's own `src` URL.
- **Read-only.** No editing, no re-layout; the execution view never invents state.
- **Frameless element.** No margin, border, padding or card; paints its own
  ground; light theme only (there is no `theme` attribute).
- **Interaction model is n8n's**, measured by driving the real canvas: wheel
  pans, ctrl+wheel zooms, cmd+wheel pans, middle-drag pans, double-click zooms
  2×, `0`/`1`/`+`/`-`, zoom clamped at 400%. Two deliberate departures:
  left-drag pans, and keyboard shortcuts fire only while the element has focus.
- Strict TypeScript, `noUncheckedIndexedAccess`, no `any`, no type casts where
  a type guard will do. ESM only.
- TDD: write the failing test first.
- Icons: vendor SVGs and small rasters from the node packages, `node:<id>` SVGs
  from n8n's source tarball, `fa:*` names rendered as Lucide glyphs (n8n does
  not draw FontAwesome). The `fa:* → lucide` mapping and per-entry provenance
  live in `packages/assets/data/<version>/glyphs.json`.
- The `overlay` attribute on `<workflow-render>` (and `--overlay` on the CLI) draws
  the canvas overlay documented in `docs/overlay.md`: `parseOverlay` in core
  validates it, `renderSVG` draws a ring and a count badge per flagged node.

## Adding an adapter

Implement `CanvasAdapter` (`id`, `detects(input)`, `parse(input)`) in
`packages/core/src/adapters/`, register it where `n8n.ts` is, add fixtures and
goldens. Renderer code must not change.

## Do not

- Commit workflow or execution exports from a real instance. Fixtures are
  synthetic (`example.com` addresses, throwaway ids) and carry no
  `meta.instanceId`, credential ids or webhook ids.
- Copy code, CSS values or icon mappings from n8n's source. Measure them.
- Change a visual constant without regenerating and reading the goldens.
- Add runtime network I/O anywhere.
- Hardcode the emulated n8n version anywhere but `packages/assets/src/version.ts`.
- Track `packages/site/public/` outputs; `scripts/copy-assets.mjs` stages them
  and they are gitignored.
