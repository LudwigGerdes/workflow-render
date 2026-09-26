/**
 * Export: the same SVG the viewer shows, made to stand on its own.
 *
 * There is no separate export renderer — that is the point. `renderSVG` already
 * embeds the icons a workflow actually uses, so the only thing an exported file
 * still depends on is the typeface. Supply the font bytes and they are inlined
 * as data URIs, which makes the file self-contained anywhere it is opened.
 *
 * Core stays free of the filesystem and the DOM: the caller reads the fonts (the
 * CLI from the assets package, the element from its sidecar) and passes them in.
 */
import { renderSVG } from './render.js';
import { attrString, esc } from './svg.js';
import type { RenderOptions, SceneGraph } from './types.js';

export interface EmbeddedFont {
  /** Defaults to Inter, the family the constants name. */
  family?: string;
  weight: number;
  /** base64 of a woff2 file, without the data: prefix. */
  woff2Base64: string;
}

/**
 * What produced an export and from what. Stamped as `data-*` attributes on the
 * root `<svg>`, beside the emulated n8n version that is always there
 * (`data-descriptions-version`), so a file on disk says which tool wrote it
 * and which input it came from without anyone having to keep the input.
 *
 * Only identity goes in: never an instance id, a URL, a credential or a
 * webhook id. `instanceId` is typed out so nothing can pass it by accident.
 */
export interface Provenance {
  tool?: { name: string; version: string };
  /** `sha256:` + the first 16 hex characters of the canonical input JSON. */
  inputHash?: string;
  workflow?: { id?: string; name?: string; versionId?: string; instanceId?: never };
}

export interface ExportOptions extends RenderOptions {
  fonts?: EmbeddedFont[];
  provenance?: Provenance;
}

/** The attributes a provenance stamp adds to the root element; empty when there is nothing to say. */
function provenanceAttrs(provenance: Provenance): string {
  return attrString({
    'data-tool-name': provenance.tool?.name,
    'data-tool-version': provenance.tool?.version,
    'data-input-hash': provenance.inputHash,
    'data-workflow-id': provenance.workflow?.id,
    'data-workflow-name': provenance.workflow?.name,
    'data-workflow-version-id': provenance.workflow?.versionId,
  });
}

function fontFaces(fonts: EmbeddedFont[]): string {
  return fonts
    .map(
      (font) =>
        `@font-face{font-family:'${esc(font.family ?? 'Inter')}';font-style:normal;` +
        `font-weight:${font.weight};` +
        `src:url(data:font/woff2;base64,${font.woff2Base64}) format('woff2');}`,
    )
    .join('');
}

/**
 * Render a scene as a standalone SVG document. Deterministic: the same scene and
 * options always produce the same bytes.
 */
export function exportSVG(scene: SceneGraph, opts: ExportOptions = {}): string {
  const { fonts, provenance, ...renderOptions } = opts;
  let svg = renderSVG(scene, renderOptions);

  // The stamp goes on the root element, ahead of the renderer's own sorted
  // attributes; the viewer never writes it, so it is added here, not in render.
  const stamp = provenance ? provenanceAttrs(provenance) : '';
  if (stamp !== '') svg = svg.replace(/^<svg\b/, `<svg${stamp}`);

  if (!fonts || fonts.length === 0) return svg;

  // Put the faces at the top of the existing style block so they are declared
  // before anything references the family.
  return svg.replace('<style>', `<style>${fontFaces(fonts)}`);
}
