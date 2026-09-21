# workflow-render

[![CI](https://github.com/LudwigGerdes/workflow-render/actions/workflows/ci.yml/badge.svg)](https://github.com/LudwigGerdes/workflow-render/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/workflow-render.svg)](https://www.npmjs.com/package/workflow-render)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Show your n8n workflows on a portfolio, a blog or a docs page as interactive canvases instead of screenshots. Visitors can pan, zoom and double-click a node to inspect it. All it needs is the workflow's JSON file: no n8n instance, no login, no backend.

**[Try the live demo at workflowtools.dev](https://workflowtools.dev/#try)**

![An n8n execution in the workflow-render viewer, with status, item counts and a loop](https://raw.githubusercontent.com/LudwigGerdes/workflow-render/main/docs/images/browser-view-execution.png)

## Installation

Requires Node.js 20 or newer.

Run it without installing:

```bash
npx workflow-render --help
```

Add it to a project:

```bash
npm install --save-dev workflow-render
```

Build from source:

```bash
git clone https://github.com/LudwigGerdes/workflow-render.git
cd workflow-render
pnpm install && pnpm build
```

## Getting started

Download a sample execution and open it in the interactive viewer:

```bash
curl -LO https://raw.githubusercontent.com/LudwigGerdes/workflow-render/main/packages/core/test/fixtures/execution-loop.json
npx workflow-render view execution-loop.json --port 4777
```

**Expected output:**

```text
workflow-render viewing execution-loop.json
  http://127.0.0.1:4777/
Press Ctrl+C to stop.
```

Open the URL, then pan, zoom and double-click a node to see what it received and produced.

To use a workflow of your own, open it in n8n and choose **Download** from the `…` menu.

## Usage

Embed a workflow in a web page. Put the JSON file next to the page and point `src` at it:

```html
<script type="module" src="https://cdn.jsdelivr.net/npm/workflow-render@0.1.0/dist/element/workflow-render.js"></script>

<div style="height: 600px">
  <workflow-render src="./workflow.json"></workflow-render>
</div>
```

Open one locally in the same viewer:

```bash
workflow-render view workflow.json --port 4777
```

Export a static image, for places that cannot run scripts, such as a GitHub README or a PDF:

```bash
workflow-render export workflow.json -o workflow.svg
workflow-render export workflow.json -o workflow.png --scale 3
```

**Expected output:**

```text
wrote workflow.svg
wrote workflow.png
```

Render from Node.js:

```js
import { renderToSVG } from 'workflow-render/core';

const { svg } = await renderToSVG(workflowJson);
```

## Documentation

Full documentation is at [workflowtools.dev/workflow-render](https://workflowtools.dev/workflow-render/):

- [Web component](https://workflowtools.dev/workflow-render/web-component)
- [Command line](https://workflowtools.dev/workflow-render/cli)
- [Node API](https://workflowtools.dev/workflow-render/node-api)
- [FAQ and compatibility](https://workflowtools.dev/workflow-render/faq)

## License

[MIT](LICENSE) © Ludwig Gerdes

Bundled n8n icons and node descriptions are covered by [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). Not affiliated with n8n GmbH.
