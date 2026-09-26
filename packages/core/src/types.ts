import type { CanvasOverlay } from './overlay.js';
/** The workflow-render pipeline contract: parse → layout → render. */
import type { IconEntry, SubtitleSpec } from 'workflow-render-assets';

export type NodeKind = 'regular' | 'trigger' | 'sub' | 'sticky';

/** One item as an execution carries it. Binary is described, never fetched. */
export interface RunItem {
  json: unknown;
  binary?: Record<string, { fileName?: string; mimeType?: string; fileSize?: string }>;
  pairedItem?: unknown;
}

/** One run of a node: what it emitted per output, and how it ended. */
export interface RunDetail {
  outputs: RunItem[][];
  error?: { message: string; description?: string; stack?: string };
  executionTime?: number;
}

export interface NodeRun {
  status: 'success' | 'error' | 'none';
  runs: number;
  /** Items emitted per output index, summed over runs. */
  itemsOut: number[];
  error?: { message: string; description?: string; stack?: string };
  /** Per-run detail, kept so the inspector can show the data panes. */
  items?: RunDetail[];
  /**
   * These items were pinned in the workflow, not produced by a run.
   *
   * n8n stores `pinData` alongside the nodes and shows it in the output pane,
   * counting it on the canvas exactly like real output. The distinction still
   * has to survive: a pinned node did not execute, and a viewer that quietly
   * presented pinned data as a result would be asserting something false.
   */
  pinned?: boolean;
}

/** Node-level options n8n shows in the NDV's Settings tab. */
export interface CanvasNodeSettings {
  onError?: string;
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
  executeOnce?: boolean;
  alwaysOutputData?: boolean;
}

export interface CanvasNode {
  name: string;
  type: string;
  /** Which revision of this node type's schema applies. */
  schemaVersion: number;
  position: [number, number];
  disabled?: boolean;
  notes?: string;
  parameters: Record<string, unknown>;
  settings?: CanvasNodeSettings;
  kind: NodeKind;
  /**
   * The main outputs this node type always shows, one entry per port, with
   * n8n's label or `undefined` for an unlabelled port. Drawn whether or not a
   * connection uses them.
   */
  outputs: Array<string | undefined>;
  run?: NodeRun;
  /**
   * The node exactly as the payload contained it, untouched.
   *
   * The model renames and adds fields, so it is not something a reader could
   * paste back into the platform it came from. The inspector's raw tab shows
   * this instead, which is the point of offering it.
   */
  source?: unknown;
}

export interface CanvasEdge {
  from: string;
  fromOutput: number;
  to: string;
  toInput: number;
  kind: 'main' | 'ai' | 'error';
  label?: string;
  itemCount?: number;
}

export interface CanvasSticky {
  name: string;
  content: string;
  /**
   * A palette index, or a `#RRGGBB` string for a custom colour. One field
   * carrying both is how n8n stores it; typing this as `number` alone silently
   * discarded every custom colour at parse time.
   */
  color: number | string;
  position: [number, number];
  width: number;
  height: number;
}

export interface CanvasExecution {
  status: 'success' | 'error';
  durationMs?: number;
  mode?: string;
}

export interface CanvasModel {
  view: 'design' | 'execution';
  name?: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  stickies: CanvasSticky[];
  execution?: CanvasExecution;
}

export interface ParsedInput {
  model?: CanvasModel;
  warnings: string[];
  errors: string[];
}

export interface SceneNode {
  node: CanvasNode;
  x: number;
  y: number;
  w: number;
  h: number;
  iconKey: string;
}

export interface ScenePoint {
  x: number;
  y: number;
}

export interface SceneEdgePath {
  edge: CanvasEdge;
  /** SVG path `d`. */
  path: string;
  labelAt?: ScenePoint;
  /** Where the connector meets each node; n8n draws a port dot at both. */
  endpoints: { source: ScenePoint; target: ScenePoint };
}

export interface SceneSticky {
  sticky: CanvasSticky;
  z: number;
  /** Drawn position (grid-snapped); `sticky.position` stays as authored. */
  x: number;
  y: number;
}

export interface SceneBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One port dot on a tile, with the label n8n prints beside it. */
export interface ScenePort {
  node: string;
  side: 'input' | 'output';
  index: number;
  at: ScenePoint;
  label?: string;
}

export interface SceneGraph {
  view: CanvasModel['view'];
  nodes: SceneNode[];
  edges: SceneEdgePath[];
  ports: ScenePort[];
  stickies: SceneSticky[];
  bounds: SceneBounds;
  execution?: CanvasExecution;
}

export interface RenderOptions {
  /**
   * Draw images in sticky notes that point at a remote host.
   *
   * Off by default. The viewer is embedded in pages it does not control, and
   * fetching a third party on load hands that host the reader's IP and
   * referrer. Self-contained sources -- `data:` and relative paths -- are drawn
   * either way, because nothing is disclosed by them.
   */
  remoteImages?: boolean;
  icons?: Record<string, IconEntry>;
  /** Node-type subtitle templates; without them no subtitles are drawn. */
  subtitles?: Record<string, SubtitleSpec>;
  /** Annotations from another tool, drawn as a ring and a badge per node and a tint per edge. */
  overlay?: CanvasOverlay;
}
