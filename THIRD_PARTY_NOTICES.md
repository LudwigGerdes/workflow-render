# Third-party notices

workflow-render itself is MIT licensed (see `LICENSE`). It bundles or depends on the
following third-party material, which carries its own terms.

## n8n — node icons and node descriptions (Sustainable Use License)

`packages/assets/data/<version>/` contains node icons, `node:` SVGs, trimmed
node descriptions and subtitle expressions extracted from the published
`n8n-nodes-base` and `@n8n/n8n-nodes-langchain` npm packages and from the
`n8n-io/n8n` source tree at the matching tag. They are the work of n8n GmbH,
distributed under the n8n Sustainable Use License
(https://github.com/n8n-io/n8n/blob/master/LICENSE.md), and are **not** covered
by this repository's MIT license. The same data is copied beside the built
element as the `workflow-render-icons.json`, `workflow-render-subtitles.json` and
`workflow-render-descriptions.json` sidecars. See `packages/assets/data/README.md`
for what each file is and how it is regenerated. workflow-render runs without these
files (nodes render as initials tiles, subtitles are blank, the inspector shows
parameters as stored).

The vendor icons inside `icons.json` (Slack, Airtable, Notion, Google, …) are
trademarks of their respective owners, shown only to identify the service a
node integrates with. No affiliation or endorsement is implied.

`n8n-workflow` (Sustainable Use License) is a **devDependency only**: it is the
oracle in `packages/core/test/inspector/conformance.test.ts` and is never
shipped in any build output.

## Lucide (ISC)

Built-in `fa:*` node glyphs are rendered from Lucide icon bodies
(https://lucide.dev, ISC License), taken from the `@iconify-json/lucide`
package and committed in `packages/assets/data/<version>/glyphs.json`.

## Inter (SIL Open Font License 1.1)

`packages/assets/data/fonts/inter-*.{woff2,ttf}` are the Inter typeface (latin
subset, from `@fontsource/inter`), licensed under the SIL OFL 1.1. The full
license text is in `packages/assets/data/fonts/LICENSE-Inter.txt`. Exported
SVGs embed these faces.

## @resvg/resvg-js (MPL-2.0)

The CLI rasterises PNG exports with `@resvg/resvg-js`, distributed under the
Mozilla Public License 2.0. It is used unmodified as a runtime dependency of
`workflow-render`; MPL-2.0's file-level copyleft applies to that package's own
source, not to workflow-render.

## Other dependencies

`lit` (BSD-3-Clause, © Google LLC) is compiled into the browser bundle
`dist/element/workflow-render.js`, which keeps its copyright and SPDX headers;
it is also a declared dependency of `workflow-render` because the element's
type declarations refer to it. `marked` (MIT) is a runtime dependency of the
renderer and is installed, not bundled. Development dependencies (esbuild,
dts-bundle-generator, Vite,
vitest, TypeScript, happy-dom, pngjs, fast-xml-parser, opentype.js) are MIT or
Apache-2.0 licensed and are not shipped.

workflow-render is not affiliated with, endorsed by, or supported by n8n GmbH.
