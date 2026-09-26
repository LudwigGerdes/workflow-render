/**
 * workflow-render-core — the pure workflow-rendering pipeline.
 *
 *   parseInput  tolerant JSON  → CanvasModel (auto-detects workflow vs execution)
 *   layout      CanvasModel    → SceneGraph  (geometry only; never re-positions)
 *   renderSVG   SceneGraph     → one SVG string (deterministic)
 *
 * No DOM, no network, no state. The viewer and the exporter use this same path,
 * so what you see is byte-for-byte what you export.
 */
export const CORE_VERSION = '0.3.0';

export * from './types.js';
// Everything: these are all fidelity constants and are meant to be readable by
// consumers (the element styles itself from them).
export * from './constants.js';
export * from './theme.js';
export { adapterFor, n8nAdapter } from './adapters/index.js';
export type { CanvasAdapter } from './adapters/types.js';
export { parseInput } from './adapters/n8n.js';
export { layout } from './layout.js';
export { renderSVG, THEME_CLASS } from './render.js';
export { parseOverlay, edgeKey, worstKind } from './overlay.js';
export type { CanvasOverlay, OverlayBadge, OverlayBadgeKind, OverlayNode, OverlayEdge } from './overlay.js';

import { layout } from './layout.js';
import { parseInput } from './adapters/n8n.js';
import { renderSVG } from './render.js';
import type { CanvasModel, RenderOptions } from './types.js';

export interface RenderResult {
  svg?: string;
  model?: CanvasModel;
  warnings: string[];
  errors: string[];
}

/** parse → layout → render in one call. Never throws on user JSON. */
export function renderWorkflow(json: unknown, opts: RenderOptions = {}): RenderResult {
  const { model, warnings, errors } = parseInput(json);
  if (!model) return { warnings, errors };
  return { svg: renderSVG(layout(model), opts), model, warnings, errors };
}
export * from './inspector/index.js';
export { exportSVG } from './export.js';
export type { EmbeddedFont, ExportOptions, Provenance } from './export.js';
