# Canvas overlay

An overlay is a small JSON document another tool writes to annotate a workflow: a badge list and a tint per node, a label and a tint per edge. workflow-render draws it over the canvas, in the viewer and in exports, so a reviewer sees a linter's findings on the picture rather than in a list.

## From workflow-lint to a picture

```bash
workflow-lint lint workflow.json --format canvas-overlay > findings.json
workflow-render export workflow.json -o workflow.png --overlay findings.json
```

Each node with a finding gets a ring in the colour of its gravest finding and a count badge at its top-right corner; hovering the badge (in an SVG or the viewer) lists every finding text. Nothing else in the render changes.

In a page:

```html
<workflow-render src="workflow.json" overlay='{"version":1,"nodes":{"Fetch":{"badges":[{"kind":"error","text":"n8n/valid: URL is missing"}]}}}'></workflow-render>
```

`overlay` takes a JSON string through the attribute or an object through the property. Setting it after load redraws.

## The format

```json
{
  "version": 1,
  "source": "workflow-lint 0.1.2",
  "nodes": {
    "Fetch": {
      "badges": [{ "kind": "error", "text": "n8n/valid: URL is missing" }],
      "tint": "#e5484d"
    }
  },
  "edges": {
    "Fetch->Parse": { "label": "12 items", "tint": "#3b82f6" }
  }
}
```

| Key | Meaning |
|---|---|
| `version` | Always `1` |
| `source` | The tool that wrote it, free text. Written to the root `<svg>` as `data-overlay-source` |
| `nodes` | Keyed by node name, as shown on the canvas |
| `nodes.<name>.badges[]` | `kind` is `error`, `warn` or `info`; `text` is what the tooltip shows. The gravest kind colours the ring and the badge; the badge shows the count |
| `nodes.<name>.tint` | `#rgb` or `#rrggbb`. Colours the ring when there are no badges |
| `edges` | Keyed by `<from node name>-><to node name>`. Optional |
| `edges.<key>.label` | Added to the connector's label |
| `edges.<key>.tint` | `#rgb` or `#rrggbb`. Colours the connector |

A node or edge the workflow does not have is ignored. An overlay with a problem — an unknown badge kind, a tint that is not a colour, a version other than 1 — is not drawn at all: the CLI exits 2 naming each problem, and the element reports them as warnings on `wr-load`. Tints are restricted to hex colours so an overlay cannot inject markup.

In the Node API, pass it as `overlay` in `renderToSVG` or `renderSVG` options; `parseOverlay` validates one first.
