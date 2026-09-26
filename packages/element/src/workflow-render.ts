/**
 * <workflow-render> — a read-only n8n workflow canvas.
 *
 * The element is a thin shell around workflow-render-core: it obtains JSON (property,
 * attribute or `src`), runs parse -> layout -> renderSVG, and puts the resulting
 * SVG in its shadow root. Interaction happens *around* that SVG — panning and
 * zooming only rewrite the viewBox attribute — so what the viewer shows stays
 * exactly what core produced.
 */
import {
  buildFormModel,
  exportSVG,
  parseOverlay,
  inputPane,
  outputPane,
  selectDescription,
  DOUBLE_CLICK_ZOOM,
  DESCRIPTIONS_VERSION,
  MAX_SCALE,
  MIN_SCALE,
  THEME_CLASS,
  SELECTION_BOX_FILL,
  SELECTION_BOX_STROKE,
  SELECTION_BOX_STROKE_STYLE,
  SELECTION_BOX_STROKE_WIDTH,
  SELECTION_RING_COLOR,
  WHEEL_PAN_SPEED,
  ZOOM_STEP,
  LIGHT,
  layout,
  parseInput,
  renderSVG,
} from 'workflow-render-core';
import { LitElement, css, html, unsafeCSS, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';
import type { CanvasModel, CanvasNode, CanvasOverlay, FormModel, SceneGraph } from 'workflow-render-core';

/**
 * The overlay as the element hands it back. Structurally identical to core's
 * `CanvasOverlay`, spelled out here so the element's own declarations stand
 * alone: the shipped `.d.ts` must not import a workspace package.
 */
export interface OverlayData {
  version: 1;
  source?: string;
  nodes: Record<string, { badges?: Array<{ kind: 'error' | 'warn' | 'info'; text: string }>; tint?: string }>;
  edges: Record<string, { label?: string; tint?: string }>;
}
import { loadDescriptions } from './descriptions.js';
import type { DisplayMode } from './ndv/data-pane.js';
import { renderNodePanel, renderStickyPanel, type NdvTab, type StickyInspection } from './ndv/panel.js';
import { ndvStyles } from './ndv/styles.js';
import { ensureFonts, loadFontData, loadIcons, loadSubtitles } from './icons.js';
import { PanZoom } from './interaction.js';

/**
 * How far the pointer must travel before a press counts as a drag.
 *
 * Below this it is a click. The distinction matters more than it looks:
 * capturing the pointer is what tells the browser to retarget the click and
 * dblclick that follow, so capturing on press made every node unclickable.
 */
const DRAG_THRESHOLD_PX = 3;

/** How long the pointer must rest before the canvas controls step aside. */
const CHROME_IDLE_MS = 2000;

/** PointerEvent.button for the middle button, the one that drags the pane. */
const MIDDLE_BUTTON = 1;

/** Trackpad pinch: convert a ctrl+wheel delta into a smooth zoom factor. */
const pinchFactor = (deltaY: number): number => Math.exp(-deltaY / 300);

@customElement('workflow-render')
export class WorkflowRender extends LitElement {
  static override styles = css`
    /* A bare canvas filling whatever box it is given: no margin, no border, no
       padding, no card. The ground is painted rather than inherited, because the
       element is embedded in pages it does not control and a light canvas on an
       inherited dark ground renders dark text on dark. */
    :host {
      display: block;
      width: 100%;
      height: 100%;
      margin: 0;
      padding: 0;
      border: 0;
      overflow: hidden;
      position: relative;
      contain: content;
      background-color: var(--wr-canvas-bg, ${unsafeCSS(LIGHT.canvasBg)});
    }
    .wr-viewport {
      width: 100%;
      height: 100%;
      overflow: hidden;
      touch-action: none;
    }
    /* Direct child only. As a descendant selector this also caught every svg
       inside the NDV -- it out-specifies their own classes, so the panel's
       icons were stretched to fill whatever box they sat in. The canvas SVG is
       always a direct child, so narrowing this costs nothing. */
    .wr-viewport > svg {
      width: 100%;
      height: 100%;
      display: block;
    }
    /* The hand means "this will pan". It showed unconditionally, promising a
       drag that plain left-drag does not do -- that marquee-selects. So it
       appears only while a panning-mode key is held, which is when left-drag
       really does pan. */
    .wr-viewport.wr-panning:not(.wr-static) {
      cursor: grab;
    }
    /* On a node the hand means "this responds to you" -- click selects it,
       double-click opens it. */
    .wr-viewport:not(.wr-static) [data-node-name],
    .wr-viewport:not(.wr-static) [data-sticky-name] {
      cursor: grab;
    }
    .wr-viewport.wr-dragging {
      cursor: grabbing;
    }
    /* Selection was tracked in the DOM and announced as an event, but nothing
       styled it, so clicking a node did everything except look like it had.
       The halo path is always in the tree and painted only here; measured from
       a running n8n 2.38.3 (see SELECTION_RING_* for the method). Setting the
       stroke via CSS beats the element's own stroke="none" presentation
       attribute, which is what keeps an exported SVG free of selection state. */
    .wr-selected .wr-tile-halo,
    .wr-selected .wr-sticky-halo {
      stroke: ${unsafeCSS(SELECTION_RING_COLOR)};
    }
    .wr-selection-box {
      position: absolute;
      pointer-events: none;
      border: ${unsafeCSS(SELECTION_BOX_STROKE_WIDTH)}px
        ${unsafeCSS(SELECTION_BOX_STROKE_STYLE)} ${unsafeCSS(SELECTION_BOX_STROKE)};
      background: ${unsafeCSS(SELECTION_BOX_FILL)};
    }

    /* The controls step aside once the pointer settles, so what you look at is
       the workflow. Hovering a cluster holds it, and they return on any move. */
    .wr-controls,
    .wr-export {
      transition: opacity 220ms ease;
    }
    .wr-idle .wr-controls,
    .wr-idle .wr-export {
      opacity: 0.3;
    }
    .wr-idle .wr-controls:hover,
    .wr-idle .wr-export:hover {
      opacity: 1;
    }
    @media (prefers-reduced-motion: reduce) {
      .wr-controls,
      .wr-export {
        transition: none;
      }
    }
    .wr-controls {
      position: absolute;
      left: 12px;
      bottom: 12px;
      display: flex;
      gap: 4px;
    }
    .wr-export {
      position: absolute;
      right: 12px;
      bottom: 12px;
      display: flex;
      gap: 4px;
    }
    .wr-export button {
      height: 28px;
      padding: 0 10px;
      font: 12px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #2b2b2b;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      cursor: pointer;
    }
    .wr-controls button {
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      padding: 0;
      font: 13px/1 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #2b2b2b;
      background: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      border-radius: 4px;
      cursor: pointer;
    }
    .wr-controls button:hover {
      border-color: #989898;
    }
    :host(:focus-visible) {
      outline: 2px solid #29a360;
      outline-offset: 2px;
    }
    ${unsafeCSS(ndvStyles)}
    .wr-error-panel {
      box-sizing: border-box;
      padding: 12px 14px;
      margin: 12px;
      border: 1px solid #e0b4b0;
      border-radius: 6px;
      background: #fdf3f2;
      color: #8a2f26;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
  `;

  /** URL of a workflow or execution JSON. Fetched as-is; CORS is the host's concern. */
  @property({ type: String }) src?: string;

  /** Inline workflow JSON: an object, or a JSON string via the attribute. */
  @property({ attribute: 'workflow' }) workflow?: unknown;

  /** Optional separate execution JSON (the two-file case). */
  @property({ attribute: 'execution' }) execution?: unknown;

  /** `fit` or a number. Reserved for explicit zoom levels; `fit` today. */
  @property({ type: String }) zoom: string = 'fit';

  /** Render inert (thumbnails): no panning, zooming or cursor affordance. */
  @property({ type: Boolean, attribute: 'static', reflect: true }) isStatic = false;

  /** `panel` | `off`. The panel itself lands in phase 2; clicks already emit. */
  @property({ type: String }) inspector: 'panel' | 'off' = 'panel';

  /** `on` | `off`. Buttons land in phase 4; the attribute is reserved. */
  @property({ type: String }) exportui: 'on' | 'off' = 'on';

  /**
   * `safe` | `remote`. Whether sticky-note images may point at another host.
   *
   * `safe` (the default) draws self-contained sources -- `data:` and relative
   * paths -- and shows a labelled placeholder for anything remote. The viewer
   * sits in pages it does not control, and fetching a third party on load hands
   * that host the reader's IP and referrer; that is the embedder's call to make,
   * so it is opt-in.
   */
  @property({ type: String }) images: 'safe' | 'remote' = 'safe';

  /**
   * Canvas overlay payload, as JSON or an object: annotations from another
   * tool (workflow-lint's `--format canvas-overlay`), drawn as a ring and a
   * count badge per node and a tint per edge. An overlay with a problem is
   * reported through `wr-load`'s warnings and not drawn.
   */
  @property({ attribute: 'overlay' }) overlay?: unknown;

  @state() private svg = '';
  @state() private errorMessage = '';
  @state() private inspecting?: { node: CanvasNode; model: FormModel } | { sticky: StickyInspection };
  @state() private inspectorTab: NdvTab = 'params';
  /** Which run of a multi-run node the data panes are showing. */
  @state() private runIndex = 0;
  @state() private paneModes: { input: DisplayMode; output: DisplayMode } = {
    input: 'schema',
    output: 'schema',
  };
  @state() private panePages = { input: 0, output: 0 };
  /** Per-pane search text, lower-cased; empty means the pane is unfiltered. */
  @state() private paneQueries = { input: '', output: '' };
  /** The in-progress selection rectangle, in element-relative pixels. */
  @state() private marquee?: { x0: number; y0: number; x1: number; y1: number };
  /** True once the pointer has been still, so the controls can step aside. */
  @state() private chromeIdle = false;

  #panZoom?: PanZoom;
  #scene?: SceneGraph;
  #model?: CanvasModel;
  #dragging = false;
  #last = { x: 0, y: 0 };
  /** Node names currently selected. */
  #selected = new Set<string>();
  /** True while a panning-mode key is held (see #onModeKey). Drives the cursor. */
  @state() private panningMode = false;
  #loaded: Promise<void> = Promise.resolve();
  #inspectorLoaded: Promise<void> = Promise.resolve();
  #idleTimer?: ReturnType<typeof setTimeout>;
  /** A press in flight, before it is known to be a click or a drag. */
  #press?: { x: number; y: number; at: { x: number; y: number }; button: number; pointerId: number; touch: boolean };
  /** Fingers currently down, by pointer id. Two of them make a pinch. */
  readonly #touches = new Map<number, { x: number; y: number }>();
  /** Whether the press behind the next click came from a finger. */
  #tapped = false;
  /** True while the pointer rests on a control cluster, which pins it open. */
  #overChrome = false;

  /** Resolves once the current input has been loaded and rendered. */
  get ready(): Promise<void> {
    return this.#loaded;
  }

  /** The names of the selected nodes, in the order they were selected. */
  get selectedNodes(): string[] {
    return [...this.#selected];
  }

  /** Replace the selection, marking the nodes and announcing the change. */
  #select(names: string[]): void {
    this.#selected = new Set(names);
    this.#markSelection();
    this.dispatchEvent(
      new CustomEvent('wr-selection-change', {
        detail: { nodeNames: this.selectedNodes },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** The scene is injected as markup, so selection is marked on the rendered DOM. */
  #markSelection(): void {
    for (const node of this.shadowRoot?.querySelectorAll('[data-node-name]') ?? []) {
      const name = node.getAttribute('data-node-name');
      node.classList.toggle('wr-selected', name !== null && this.#selected.has(name));
    }
  }

  /** Resolves once a pending inspector open has finished. */
  get inspectorReady(): Promise<void> {
    return this.#inspectorLoaded;
  }

  /** The overlay as validated, or undefined when none is set or it has a problem. */
  get overlayData(): OverlayData | undefined {
    return this.#overlay().overlay;
  }

  #overlay(): { overlay?: CanvasOverlay; errors: string[] } {
    if (this.overlay === undefined || this.overlay === null || this.overlay === '') return { errors: [] };
    const raw = typeof this.overlay === 'string' ? this.#parseMaybeJson(this.overlay) : this.overlay;
    return parseOverlay(raw);
  }

  /**
   * The canvas as a standalone SVG, with the fonts embedded when they can be
   * read. Same pipeline as the view, so the file is what you are looking at.
   */
  async exportSvg(): Promise<string> {
    if (!this.#scene) throw new Error('nothing to export yet');
    const [icons, subtitles, fonts] = await Promise.all([loadIcons(), loadSubtitles(), loadFontData()]);
    return exportSVG(this.#scene, {
      icons,
      subtitles,
      fonts,
      remoteImages: this.images === 'remote',
      ...(this.overlayData === undefined ? {} : { overlay: this.overlayData }),
    });
  }

  /** Hand the SVG to the browser as a download. */
  async downloadSvg(name = 'workflow.svg'): Promise<void> {
    this.#download(new Blob([await this.exportSvg()], { type: 'image/svg+xml' }), name);
  }

  /**
   * Rasterise the same SVG through a canvas. Needs a browser that can draw an
   * SVG image; where it cannot, the SVG export still works.
   */
  async downloadPng(name = 'workflow.png', scale = 2): Promise<void> {
    const svg = await this.exportSvg();
    const bounds = this.#scene?.bounds;
    if (!bounds) throw new Error('nothing to export yet');

    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise<void>((done, fail) => {
        image.addEventListener('load', () => done());
        image.addEventListener('error', () => fail(new Error('could not rasterise the canvas')));
        image.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bounds.width * scale);
      canvas.height = Math.round(bounds.height * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('this browser cannot rasterise the canvas');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
      if (!blob) throw new Error('this browser cannot rasterise the canvas');
      this.#download(blob, name);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  #download(blob: Blob, name: string): void {
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = name;
    link.click();
    URL.revokeObjectURL(href);
  }

  /** Close the inspector panel, if one is open. */
  closeInspector(): void {
    if (!this.inspecting) return;
    this.inspecting = undefined;
    this.dispatchEvent(new CustomEvent('wr-inspector-close', { bubbles: true, composed: true }));
  }

  async #openInspector(nodeName: string): Promise<void> {
    const node = this.#scene?.nodes.find((scene) => scene.node.name === nodeName)?.node;
    if (!node) return;
    const descriptions = await loadDescriptions();
    const description = selectDescription(descriptions[node.type] ?? [], node.schemaVersion);
    this.inspecting = { node, model: buildFormModel(node, description) };
    this.inspectorTab = 'params';
    this.runIndex = 0;
    this.paneModes = { input: 'schema', output: 'schema' };
    this.panePages = { input: 0, output: 0 };
    this.paneQueries = { input: '', output: '' };
    this.dispatchEvent(
      new CustomEvent('wr-inspector-open', { detail: { nodeName }, bubbles: true, composed: true }),
    );
  }

  #openSticky(name: string): void {
    const sticky = this.#scene?.stickies.find((entry) => entry.sticky.name === name)?.sticky;
    if (!sticky) return;
    this.inspecting = { sticky: { name: sticky.name, content: sticky.content } };
    this.inspectorTab = 'params';
    this.dispatchEvent(
      new CustomEvent('wr-inspector-open', { detail: { nodeName: name }, bubbles: true, composed: true }),
    );
  }

  /** `static` is a reserved word in a class field, so it is an accessor here. */
  get static(): boolean {
    return this.isStatic;
  }

  set static(value: boolean) {
    this.isStatic = value;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('emulates', DESCRIPTIONS_VERSION);
    // Focusable so the canvas shortcuts work here without the element
    // swallowing keystrokes meant for the page that embeds it.
    if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
    // On the host, not the inner div: focus lands on the host, and a keydown
    // dispatched there never reaches shadow children.
    this.addEventListener('keydown', this.#onKeyDown);
    // Space and the platform's control key put the canvas in panning mode, so
    // they have to be seen wherever focus is -- not only on this element.
    globalThis.addEventListener?.('keydown', this.#onModeKey);
    globalThis.addEventListener?.('keyup', this.#onModeKey);
    globalThis.addEventListener?.('blur', this.#leavePanningMode);
  }

  override disconnectedCallback(): void {
    this.removeEventListener('keydown', this.#onKeyDown);
    globalThis.removeEventListener?.('keydown', this.#onModeKey);
    globalThis.removeEventListener?.('keyup', this.#onModeKey);
    globalThis.removeEventListener?.('blur', this.#leavePanningMode);
    super.disconnectedCallback();
  }

  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this.#markSelection();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // `images` belongs here too: it changes what the SVG contains, so setting
    // it after load must redraw. Without it the attribute was accepted and
    // silently did nothing, which is worse than not offering it.
    if (
      changed.has('src') ||
      changed.has('workflow') ||
      changed.has('execution') ||
      changed.has('images') ||
      changed.has('overlay')
    ) {
      this.inspecting = undefined;
      this.#loaded = this.#load();
    }
  }

  async #load(): Promise<void> {
    ensureFonts();
    const [input, icons, subtitles] = await Promise.all([
      this.#resolveInput(),
      loadIcons(),
      loadSubtitles(),
    ]);
    if (input === undefined) return;

    const { model, warnings, errors } = parseInput(input);
    if (!model) {
      this.#fail(errors[0] ?? 'could not read this workflow');
      return;
    }

    const scene = layout(model);
    this.#scene = scene;
    this.#model = model;
    // Trusted markup: core escapes every value it takes from the workflow and
    // allows only http/https/mailto/relative link targets.
    const overlay = this.#overlay();
    this.svg = renderSVG(scene, {
      icons,
      subtitles,
      remoteImages: this.images === 'remote',
      ...(overlay.overlay === undefined ? {} : { overlay: overlay.overlay }),
    });
    this.errorMessage = '';
    const view = { x: scene.bounds.x, y: scene.bounds.y, w: scene.bounds.width, h: scene.bounds.height };
    this.#panZoom = new PanZoom(view, { ...view }, { minScale: MIN_SCALE, maxScale: MAX_SCALE });
    this.dispatchEvent(
      new CustomEvent('wr-load', {
        detail: { view: model.view, warnings: [...warnings, ...overlay.errors] },
        bubbles: true,
        composed: true,
      }),
    );

    // `zoom="fit"` is the default and was never acted on, so a workflow loaded
    // at its own scale and ran off the edge of the canvas. Fitting needs the
    // laid-out viewport, hence the wait.
    if (this.zoom === 'fit') {
      await this.updateComplete;
      this.fit();
    }
  }

  /** Property/attribute beats `src`; an execution JSON can arrive separately. */
  async #resolveInput(): Promise<unknown> {
    const inline = this.#parseMaybeJson(this.workflow);
    const execution = this.#parseMaybeJson(this.execution);

    if (inline !== undefined) return this.#combine(inline, execution);
    if (execution !== undefined && this.src === undefined) return execution;
    if (this.src === undefined) return undefined;

    try {
      const response = await fetch(this.src);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`.trim());
      }
      return this.#combine(await response.json(), execution);
    } catch (error) {
      this.#fail(`could not load ${this.src}: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  /** Two-file case: graft a bare execution payload onto its workflow. */
  #combine(workflow: unknown, execution: unknown): unknown {
    if (execution === undefined) return workflow;
    if (execution !== null && typeof execution === 'object' && 'workflowData' in execution) {
      return execution;
    }
    return { ...(execution as Record<string, unknown>), workflowData: workflow };
  }

  #parseMaybeJson(value: unknown): unknown {
    if (typeof value !== 'string') return value ?? undefined;
    if (value.trim() === '') return undefined;
    try {
      return JSON.parse(value);
    } catch {
      this.#fail('the workflow attribute is not valid JSON');
      return undefined;
    }
  }

  #fail(message: string): void {
    this.errorMessage = message;
    this.svg = '';
    this.dispatchEvent(
      new CustomEvent('wr-error', { detail: { message }, bubbles: true, composed: true }),
    );
  }

  // ------------------------------------------------------------ interaction

  private get viewportSize(): { w: number; h: number } {
    const rect = this.getBoundingClientRect();
    return { w: rect.width || 800, h: rect.height || 600 };
  }

  /** Pointer position relative to this element, in CSS pixels. */
  #localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /**
   * The nodes a selection rectangle touches. n8n selects on overlap, not
   * containment, so clipping a node's corner is enough to take it.
   */
  #nodesWithin(box: { x0: number; y0: number; x1: number; y1: number }): string[] {
    const view = this.#panZoom?.state();
    if (!view || !this.#scene) return [];
    const size = this.viewportSize;

    const toCanvasX = (px: number): number => view.x + (px / size.w) * view.w;
    const toCanvasY = (py: number): number => view.y + (py / size.h) * view.h;
    const left = toCanvasX(Math.min(box.x0, box.x1));
    const right = toCanvasX(Math.max(box.x0, box.x1));
    const top = toCanvasY(Math.min(box.y0, box.y1));
    const bottom = toCanvasY(Math.max(box.y0, box.y1));

    return this.#scene.nodes
      .filter((n) => n.x < right && n.x + n.w > left && n.y < bottom && n.y + n.h > top)
      .map((n) => n.node.name);
  }

  /** The selection rectangle, drawn over the scene while a drag is in flight. */
  #selectionBox() {
    const box = this.marquee;
    if (!box) return '';
    const left = Math.min(box.x0, box.x1);
    const top = Math.min(box.y0, box.y1);
    const width = Math.abs(box.x1 - box.x0);
    const height = Math.abs(box.y1 - box.y0);
    return html`<div
      class="wr-selection-box"
      style="left:${left}px;top:${top}px;width:${width}px;height:${height}px"
    ></div>`;
  }

  #applyViewBox(): void {
    const svg = this.renderRoot.querySelector('svg');
    if (svg && this.#panZoom) svg.setAttribute('viewBox', this.#panZoom.viewBox());
  }

  /** Pan by a screen-pixel delta. Also the seam the pointer handlers use. */
  dragBy(dxPx: number, dyPx: number): void {
    if (this.isStatic || !this.#panZoom) return;
    this.#panZoom.pan(dxPx, dyPx, this.viewportSize);
    this.#applyViewBox();
  }

  /** Zoom about a point in element coordinates (defaults to the centre). */
  zoomBy(factor: number, at?: { x: number; y: number }): void {
    if (this.isStatic || !this.#panZoom) return;
    const size = this.viewportSize;
    this.#panZoom.zoomAt(factor, at ?? { x: size.w / 2, y: size.h / 2 }, size);
    this.#applyViewBox();
  }

  /** Back to the whole scene. */
  fit(): void {
    if (!this.#panZoom) return;
    this.#panZoom.fit();
    this.#applyViewBox();
  }

  #onPointerDown(event: PointerEvent): void {
    if (this.isStatic) return;
    // Record the press and nothing else. Taking the pointer here would retarget
    // the click and dblclick that follow to this element, so a node would never
    // see them -- which is exactly why nodes were not clickable.
    const touch = event.pointerType === 'touch';
    this.#tapped = touch;
    if (touch) {
      this.#touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      // A second finger turns the gesture into a pinch; whatever the first
      // finger had started is over.
      if (this.#touches.size > 1) {
        this.#press = undefined;
        this.#dragging = false;
        return;
      }
    }
    this.#press = {
      x: event.clientX,
      y: event.clientY,
      at: this.#localPoint(event),
      button: event.button,
      pointerId: event.pointerId,
      touch,
    };
  }

  /**
   * Two fingers: zoom by how their spread changed, about the point between
   * them, and carry the canvas along as that point moves.
   */
  #pinch(event: PointerEvent): void {
    const before = [...this.#touches.values()];
    this.#touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const after = [...this.#touches.values()];
    const [a0, b0] = before;
    const [a1, b1] = after;
    if (!a0 || !b0 || !a1 || !b1) return;
    const spread0 = Math.hypot(b0.x - a0.x, b0.y - a0.y);
    const spread1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    const mid0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
    const mid1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    this.dragBy(mid1.x - mid0.x, mid1.y - mid0.y);
    if (spread0 > 0 && spread1 > 0) {
      this.zoomBy(spread1 / spread0, this.#localPoint({ clientX: mid1.x, clientY: mid1.y }));
    }
  }

  /** Promote a press to a drag once it has travelled far enough to be one. */
  #beginDrag(event: PointerEvent): void {
    const press = this.#press;
    if (!press || this.#dragging || this.marquee) return;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) < DRAG_THRESHOLD_PX) return;

    // Now it is a gesture, so take the pointer: it has to keep tracking even
    // when it leaves the element.
    (event.currentTarget as Element).setPointerCapture?.(press.pointerId);

    // The middle button drags the pane. The left button draws a selection
    // rectangle, and only pans while a panning-mode key is held. A finger has
    // neither a middle button nor a key to hold, so it always pans.
    if (press.button !== MIDDLE_BUTTON && !this.panningMode && !press.touch) {
      this.marquee = { x0: press.at.x, y0: press.at.y, x1: press.at.x, y1: press.at.y };
    } else {
      this.#dragging = true;
      this.#last = { x: press.x, y: press.y };
      this.requestUpdate();
    }
  }

  #onPointerMove(event: PointerEvent): void {
    this.#wakeChrome();
    if (event.pointerType === 'touch' && this.#touches.size > 1) {
      if (!this.isStatic && this.#touches.has(event.pointerId)) this.#pinch(event);
      return;
    }
    this.#beginDrag(event);
    if (this.marquee) {
      const at = this.#localPoint(event);
      this.marquee = { ...this.marquee, x1: at.x, y1: at.y };
      return;
    }
    if (!this.#dragging) return;
    this.dragBy(event.clientX - this.#last.x, event.clientY - this.#last.y);
    this.#last = { x: event.clientX, y: event.clientY };
  }

  #onPointerUp(event: PointerEvent): void {
    this.#touches.delete(event.pointerId);
    this.#press = undefined;
    if (this.marquee) {
      this.#select(this.#nodesWithin(this.marquee));
      this.marquee = undefined;
      (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
      return;
    }
    if (!this.#dragging) return;
    this.#dragging = false;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    this.requestUpdate();
  }

  /**
   * The canvas scrolls on a plain wheel and zooms when the zoom activation key
   * is held -- the platform control key, which is cmd on macOS -- or on a
   * trackpad pinch, which arrives as ctrl+wheel.
   */
  #onWheel(event: WheelEvent): void {
    if (this.isStatic || !this.#panZoom) return;
    event.preventDefault();
    // ctrl+wheel is what a trackpad pinch sends; the platform control key is
    // also the zoom activation key, which on macOS is cmd. Accepting either
    // covers both platforms without sniffing the user agent.
    if (event.ctrlKey || event.metaKey) {
      const rect = this.getBoundingClientRect();
      this.zoomBy(pinchFactor(event.deltaY), {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      return;
    }
    this.dragBy(-event.deltaX * WHEEL_PAN_SPEED, -event.deltaY * WHEEL_PAN_SPEED);
  }

  #onDoubleClick(event: MouseEvent): void {
    if (this.isStatic) return;
    // A node opens on double click, and opening it must not also zoom.
    const nodeName = (event.target as Element | null)
      ?.closest?.('[data-node-name]')
      ?.getAttribute('data-node-name');
    if (nodeName !== null && nodeName !== undefined) {
      event.stopPropagation();
      if (this.inspector === 'panel') this.#inspectorLoaded = this.#openInspector(nodeName);
      return;
    }

    const stickyName = (event.target as Element | null)
      ?.closest?.('[data-sticky-name]')
      ?.getAttribute('data-sticky-name');
    if (stickyName !== null && stickyName !== undefined) {
      event.stopPropagation();
      if (this.inspector === 'panel') {
        this.#openSticky(stickyName);
        this.#inspectorLoaded = Promise.resolve();
      }
      return;
    }
    const rect = this.getBoundingClientRect();
    this.zoomBy(DOUBLE_CLICK_ZOOM, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  /** Reset zoom to 100%, the `0` shortcut. */
  resetZoom(): void {
    if (this.isStatic || !this.#panZoom) return;
    this.#panZoom.zoomTo(1, this.viewportSize);
    this.#applyViewBox();
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.inspecting) {
      event.preventDefault();
      this.closeInspector();
      return;
    }
    if (this.isStatic || event.metaKey || event.ctrlKey || event.altKey) return;
    const handled = {
      '0': () => this.resetZoom(),
      '1': () => this.fit(),
      '+': () => this.zoomBy(ZOOM_STEP),
      '=': () => this.zoomBy(ZOOM_STEP),
      '-': () => this.zoomBy(1 / ZOOM_STEP),
      _: () => this.zoomBy(1 / ZOOM_STEP),
    }[event.key];
    if (!handled) return;
    event.preventDefault();
    handled();
  };

  #onClick(event: MouseEvent): void {
    const target = event.target as Element | null;
    const node = target?.closest?.('[data-node-name]');
    const nodeName = node?.getAttribute('data-node-name');
    if (nodeName) {
      this.dispatchEvent(
        new CustomEvent('wr-node-click', { detail: { nodeName }, bubbles: true, composed: true }),
      );
      // A plain click replaces the selection; shift or the control key extends
      // it, toggling the node that was clicked.
      const extend = event.shiftKey || event.metaKey || event.ctrlKey;
      // A tap opens the node. A double tap is what opens it with a mouse, but
      // browsers claim that gesture on touch screens for their own zoom.
      if (this.#tapped && !extend && !this.isStatic && this.inspector === 'panel') {
        this.#select([nodeName]);
        this.#inspectorLoaded = this.#openInspector(nodeName);
        return;
      }
      if (!extend) this.#select([nodeName]);
      else if (this.#selected.has(nodeName)) {
        this.#select(this.selectedNodes.filter((n) => n !== nodeName));
      } else this.#select([...this.selectedNodes, nodeName]);
      return;
    }

    // A click on bare canvas clears the selection.
    if (this.#selected.size > 0) this.#select([]);
  }

  /** Space or the platform control key holds the canvas in panning mode. */
  readonly #onModeKey = (event: KeyboardEvent): void => {
    const isModeKey = event.key === ' ' || event.key === 'Meta' || event.key === 'Control';
    if (!isModeKey) return;
    this.panningMode = event.type === 'keydown';
    this.requestUpdate();
  };

  readonly #leavePanningMode = (): void => {
    this.panningMode = false;
  };

  /** Any pointer movement brings the controls back and restarts the countdown. */
  readonly #wakeChrome = (): void => {
    this.chromeIdle = false;
    if (this.#idleTimer !== undefined) clearTimeout(this.#idleTimer);
    if (this.#overChrome) return;
    this.#idleTimer = globalThis.setTimeout(() => {
      this.chromeIdle = true;
    }, CHROME_IDLE_MS);
  };

  readonly #holdChrome = (over: boolean): void => {
    this.#overChrome = over;
    this.#wakeChrome();
  };

  // ---------------------------------------------------------------- render

  /** The data panes around the parameters pane, in an execution. */
  #executionPanes(node: CanvasNode) {
    const model = this.#model;
    if (!model) return undefined;
    // The view alone cannot decide this. Pinned data rides on a plain workflow
    // rather than an execution, and it is exactly what these panes exist to
    // show -- gating on `view === 'execution'` left a pinned node counting its
    // items on the canvas while the panel insisted there was no data at all.
    // Any pinned node in the model qualifies, not just this one: a node
    // downstream of a pin receives those items as its input.
    const pinnedAnywhere = model.nodes.some((candidate) => candidate.run?.pinned === true);
    if (model.view !== 'execution' && !pinnedAnywhere) return undefined;

    const runs = node.run?.items ?? [];
    const executed = (node.run?.status ?? 'none') !== 'none' && runs.length > 0;
    const index = Math.min(this.runIndex, Math.max(runs.length - 1, 0));
    const hasInput = model.edges.some((edge) => edge.to === node.name && edge.kind !== 'ai');

    return {
      input: hasInput ? inputPane(model, node.name, index) : undefined,
      output: outputPane(model, node.name, index, 0),
      executed,
      hasInput,
      runCount: runs.length,
      runIndex: index,
      itemsPerRun: runs.map((run) => run.outputs[0]?.length ?? 0),
      modes: this.paneModes,
      pages: this.panePages,
      queries: this.paneQueries,
      onRun: (next: number) => {
        this.runIndex = next;
        this.panePages = { input: 0, output: 0 };
      },
      onMode: (side: 'input' | 'output', mode: DisplayMode) => {
        this.paneModes = { ...this.paneModes, [side]: mode };
      },
      onPage: (side: 'input' | 'output', page: number) => {
        this.panePages = { ...this.panePages, [side]: page };
      },
      onQuery: (side: 'input' | 'output', query: string) => {
        // Back to the first page: the old page number indexes rows the filter
        // has just removed, which otherwise lands you on an empty page.
        this.paneQueries = { ...this.paneQueries, [side]: query };
        this.panePages = { ...this.panePages, [side]: 0 };
      },
    };
  }

  #inspectorPanel(): TemplateResult | string {
    const open = this.inspecting;
    if (!open) return '';
    const options = {
      onTab: (tab: NdvTab) => {
        this.inspectorTab = tab;
      },
      onClose: () => this.closeInspector(),
    };
    return 'sticky' in open
      ? renderStickyPanel(open.sticky, this.inspectorTab, options)
      : renderNodePanel(
          open.model,
          // The payload's own node, not the model's: the raw tab exists so a
          // reader can paste it back into n8n, and the model renames fields and
          // adds its own.
          open.node.source ?? open.node,
          this.inspectorTab,
          options,
          this.#executionPanes(open.node),
        );
  }

  /** Export buttons. Their own cluster: not zoom, and hidden by exportui="off". */
  #exportControls(): TemplateResult {
    return html`
      <div
        class="wr-export"
        @pointerenter=${() => this.#holdChrome(true)}
        @pointerleave=${() => this.#holdChrome(false)}
      >
        <button type="button" data-action="export-svg" title="Download as SVG" @click=${() => void this.downloadSvg()}>
          SVG
        </button>
        <button type="button" data-action="export-png" title="Download as PNG" @click=${() => void this.downloadPng()}>
          PNG
        </button>
      </div>
    `;
  }

  /** The zoom cluster n8n keeps in the corner of its canvas. */
  #controls(): TemplateResult {
    return html`
      <div
        class="wr-controls"
        @pointerenter=${() => this.#holdChrome(true)}
        @pointerleave=${() => this.#holdChrome(false)}
      >
        <button type="button" data-action="zoom-to-fit" title="Zoom to fit (1)" @click=${() => this.fit()}>⤢</button>
        <button type="button" data-action="zoom-in" title="Zoom in (+)" @click=${() => this.zoomBy(ZOOM_STEP)}>+</button>
        <button type="button" data-action="zoom-out" title="Zoom out (-)" @click=${() => this.zoomBy(1 / ZOOM_STEP)}>−</button>
        <button type="button" data-action="reset-zoom" title="Actual size — 100% zoom (0)" @click=${() => this.resetZoom()}>100%</button>
      </div>
    `;
  }

  protected override render(): TemplateResult {
    const classes = [
      'wr-viewport',
      THEME_CLASS,
      this.chromeIdle ? 'wr-idle' : '',
      this.panningMode ? 'wr-panning' : '',
      this.isStatic ? 'wr-static' : '',
      this.#dragging ? 'wr-dragging' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return html`
      <div
        class=${classes}
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerUp}
        @pointercancel=${this.#onPointerUp}
        @wheel=${this.#onWheel}
        @dblclick=${this.#onDoubleClick}
        @click=${this.#onClick}
      >
        ${this.errorMessage
          ? html`<div class="wr-error-panel" role="alert">${this.errorMessage}</div>`
          : unsafeSVG(this.svg)}
        ${this.#selectionBox()}
        ${this.isStatic ? '' : this.#controls()}
        ${this.isStatic || this.exportui === 'off' ? '' : this.#exportControls()}
        ${this.#inspectorPanel()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'workflow-render': WorkflowRender;
  }
}
