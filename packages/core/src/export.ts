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
import { esc } from './svg.js';
import type { RenderOptions, SceneGraph } from './types.js';

export interface EmbeddedFont {
  /** Defaults to Inter, the family the constants name. */
  family?: string;
  weight: number;
  /** base64 of a woff2 file, without the data: prefix. */
  woff2Base64: string;
}

export interface ExportOptions extends RenderOptions {
  fonts?: EmbeddedFont[];
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
  const { fonts, ...renderOptions } = opts;
  const svg = renderSVG(scene, renderOptions);
  if (!fonts || fonts.length === 0) return svg;

  // Put the faces at the top of the existing style block so they are declared
  // before anything references the family.
  return svg.replace('<style>', `<style>${fontFaces(fonts)}`);
}
