# The `<workflow-render>` web component

```html
<script type="module" crossorigin="anonymous"
  src="https://cdn.jsdelivr.net/npm/workflow-render@0.1.0/dist/element/workflow-render.js"
  integrity="sha384-ba9lOQoTmpSwduU3wioJbE1KpVWlVt5wqBjjddDBM07c379jh8wQtkykrmlsvu6t"></script>

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

> [!NOTE]
> If your site sends a Content-Security-Policy header, the inspector needs `style-src-attr 'unsafe-inline'`. It sets inline `style` attributes. Scripts and `<style>` blocks are not affected.

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

| Input | Action |
|---|---|
| Wheel | Pan |
| <kbd>Ctrl</kbd> + wheel, or pinch | Zoom about the pointer |
| Drag | Pan |
| Double-click on the canvas | Zoom 2× |
| Double-click on a node | Open the inspector |
| Click on a node | Select it. <kbd>Shift</kbd> + click adds to the selection |
| <kbd>0</kbd> | Reset zoom |
| <kbd>1</kbd> | Fit to view |
| <kbd>+</kbd> / <kbd>-</kbd> | Zoom in and out |

Keyboard shortcuts only fire while the element has focus, so it never takes keystrokes from the page around it.

## The inspector

Double-click a node to open a read-only panel with three tabs: **Parameters**, **Settings** and **JSON**.

- Labels, field order and visibility follow the node's description, as they do in n8n.
- Options show their labels, not raw values.
- Fields the workflow never set show the default in muted text.
- Expressions are shown as written. They are never evaluated.

For an execution, the panel also shows what the node received and what it produced.
