# FAQ and compatibility

## Compatibility

| | Supported |
|---|---|
| n8n | Icons and node descriptions are bundled from n8n 2.38.1, 564 node types |
| Other n8n versions | Workflows render. A node type the bundle does not know shows initials instead of an icon, and no subtitle |
| Node.js | 20 or newer |
| Browsers | Current Chrome, Firefox, Safari and Edge |

Every exported SVG carries a `data-descriptions-version` attribute, so you can tell which n8n bundle drew it.

## Questions

### Does it need my n8n instance?

No. It reads a file.

### Does it run the workflow or evaluate expressions?

No. It draws what the JSON contains. An `={{ … }}` value is shown as written, and a Code node is a tile.

### Is my JSON sent anywhere?

No.

- The CLI reads and writes local files.
- `view` binds to `127.0.0.1`.
- The web component fetches only the `src` URL you give it.
- There is no telemetry.

### Why does a node show initials instead of its logo?

Its type is not in the bundle. It is either a community node or a node newer than n8n 2.38.1. The rest of the canvas is unaffected.

### Is it a pixel-exact copy of n8n's canvas?

No. It reads as the same workflow at a glance. If you need the real editor, run n8n.

## Alternatives

| Alternative | Use it instead when |
|---|---|
| Opening the workflow in n8n | You have an instance, a login, and a person in front of a screen |
| A screenshot of n8n | The workflow will never change again |
| n8n's `<n8n-demo>` embed | The page may load third-party script and the workflow can be public |
| Mermaid or a hand-drawn diagram | The diagram is a sketch, not the workflow as it actually is |

## Limitations

- There is one theme, light. Node subtitles use n8n's grey, which is below WCAG AA contrast on white.
- The inspector is part of the web component. The CLI cannot print a node's parameters.
- The canvas is read-only. There is no editing and no re-layout.
