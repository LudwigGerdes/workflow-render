# The `<workflow-render>` web component

```html
<script type="module" crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/workflow-render@0.2.0/dist/element/workflow-render.js"
  integrity="sha384-qaybVEBYXSgs4AvcP/1vswZXjlvr4WhbXsnmdItTItJiJjW31A5thhj+/iocriiH"></script>

<div style="width: 100%; height: 600px">
  <workflow-render src="./workflows/invoice-sync.json"></workflow-render>
</div>
```

The element fills the box you give it. It has no border or padding of its own. The script is 52 KB gzipped.

## Loading it

| Option | How |
|---|---|
| CDN | The `<script>` tag above. Pin the version and keep the `integrity` hash |
| Self-hosted | Copy the whole `node_modules/workflow-render/dist/element/` folder. The script loads its icon, description and font files from beside itself |
| Bundler | `import 'workflow-render/element'` registers the element, with types |

`src` is fetched by the visitor's browser, so the JSON must be same-origin or served with CORS headers.

The element works under a strict Content-Security-Policy: it sets no inline `style` attributes and needs no `'unsafe-inline'`. Its stylesheet is a constructed sheet in the shadow root.

The icon, subtitle and description files are fetched with subresource integrity. Their sha384 hashes are written into the script at build time, so the `integrity` hash on the `<script>` tag covers them too: a sidecar that is not the one this build shipped is refused, and the element carries on with monogram icons and no inspector data. To ship a trimmed or custom set, seed it on the page instead of editing the files (see `SEED_KEY` in the Node API docs).

## Attributes

| Attribute | Meaning | Default |
|---|---|---|
| `src` | URL of a workflow or execution JSON. The kind is detected | |
| `workflow` | Inline JSON string, or an object through the property. Takes precedence over `src` | |
| `execution` | A separate execution JSON, when workflow and run are two files | |
| `zoom` | `fit` or a number | `fit` |
| `static` | Render without interaction, for thumbnails | `false` |
| `inspector` | `panel` or `off` | `panel` |
| `exportui` | `on` or `off`. Shows the SVG and PNG buttons | `on` |
| `images` | `safe` or `remote`. Whether sticky-note images may load from another host | `safe` |
| `overlay` | A [canvas overlay](https://workflowtools.dev/workflow-render/overlay): a JSON string, or an object through the property. Drawn as a ring and a badge per flagged node | |
| `emulates` | Read-only. The bundled n8n version | |

## Events and methods

| Event | Detail |
|---|---|
| `wr-load` | `{ view, warnings }` |
| `wr-error` | `{ message }` |
| `wr-node-click` | `{ nodeName }`. Fires on a single click, whether or not the inspector is on |
| `wr-inspector-open` | `{ nodeName }` |
| `wr-inspector-close` | |

| Method | Returns |
|---|---|
| `exportSvg()` | `Promise<string>` |

## Pan and zoom

With a mouse or trackpad, the gestures are n8n's own:

| Input | Action |
|---|---|
| Wheel, or two-finger scroll | Pan |
| <kbd>Ctrl</kbd> or <kbd>Cmd</kbd> + wheel, or trackpad pinch | Zoom about the pointer |
| Middle-button drag, or <kbd>Space</kbd> + drag | Pan |
| Drag | Draw a selection rectangle |
| Click on a node | Select it. <kbd>Shift</kbd> + click adds to the selection |
| Double-click on a node | Open the inspector |
| Double-click on the canvas | Zoom 2× |
| <kbd>0</kbd> | Reset zoom |
| <kbd>1</kbd> | Fit to view |
| <kbd>+</kbd> / <kbd>-</kbd> | Zoom in and out |

On a touch screen:

| Input | Action |
|---|---|
| One-finger drag | Pan |
| Pinch | Zoom |
| Tap on a node | Open the inspector |

The buttons in the corner fit the view and zoom in and out on any device.

Keyboard shortcuts only fire while the element has focus, so it never takes keystrokes from the page around it.

## The inspector

Double-click a node, or tap it on a touch screen, to open a read-only panel with three tabs: **Parameters**, **Settings** and **JSON**.

- Labels, field order and visibility follow the node's description, as they do in n8n.
- Options show their labels, not raw values.
- Fields the workflow never set show the default in muted text.
- Expressions are shown as written. They are never evaluated.

For an execution, the panel also shows what the node received and what it produced.

The panel adapts to the space the element is given. In a wide container, Input, the node and Output sit side by side. Below 760 pixels it shows one at a time, with a switch at the top.
