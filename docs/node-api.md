# Node API

```js
import { readFile, writeFile } from 'node:fs/promises';
import { renderToSVG } from 'workflow-render/core';

const json = JSON.parse(await readFile('workflow.json', 'utf8'));
const { svg, warnings } = await renderToSVG(json);

await writeFile('workflow.svg', svg);
```

The package is ESM only and ships its own types.

## `renderToSVG(json, options?)`

Returns `{ svg, warnings }`. It rejects when the input is not a workflow or an execution.

| Option | Meaning | Default |
|---|---|---|
| `embedFonts` | Embed the fonts in the SVG so it renders the same everywhere | `true` |
| `remoteImages` | Allow sticky-note images from other hosts | `false` |
| `icons` | Use your own icon catalogue instead of the bundled one | bundled |
| `subtitles` | Use your own subtitle catalogue instead of the bundled one | bundled |
| `provenance` | Override the `data-*` provenance stamp on the root `<svg>` (`tool`, `inputHash`, `workflow.{id,name,versionId}`); fields given replace the computed ones | tool version, input hash and workflow identity from the input |

## Lower-level exports

The same subpath exports the individual steps, for callers that want to work with the model between them.

| Export | What it does |
|---|---|
| `parseInput` | Turn workflow or execution JSON into the canvas model |
| `layout` | Position the model |
| `renderSVG` | Draw a positioned model |
| `exportSVG` | Produce a standalone SVG, fonts included |
| `loadIcons`, `loadDescriptions`, `loadSubtitles` | Load the bundled n8n data |

## Using a different n8n extraction

Set `WORKFLOW_RENDER_DATA` to a directory shaped like the package's own `data/` folder.

```bash
WORKFLOW_RENDER_DATA=./my-data npx workflow-render export workflow.json -o workflow.svg
```
