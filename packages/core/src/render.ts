/**
 * SceneGraph → one SVG document.
 *
 * Colours are emitted as `var(--wr-*, <theme fallback>)` so a host can retheme
 * the very same SVG by setting custom properties on an ancestor — the rendered
 * string never has to change. A standalone SVG file still carries the right
 * colours through the fallbacks.
 */
import { marked } from 'marked';
import {
  AI_EDGE_DASH,
  ARROW_POINTS,
  ARROW_SIZE,
  ARROW_STROKE_WIDTH,
  ARROW_VIEWBOX,
  DOT_PHASE,
  DOT_RADIUS,
  DOT_SPACING,
  ICON_COLORS,
  ICON_COLOR_DEFAULT,
  ICON_SIZE,
  LABEL_LINE_HEIGHT,
  SUBTITLE_WIDTH,
  NAME_ASCENT_RATIO,
  SUBTITLE_FONT_SIZE,
  SUBTITLE_GAP,
  SUBTITLE_LINE_HEIGHT,
  SUB_ICON_SIZE,
  TRIGGER_BOLT_COLOR,
  TRIGGER_BOLT_OFFSET_X,
  TRIGGER_BOLT_SIZE,
  EDGE_LABEL_BG_OPACITY,
  EDGE_LABEL_FONT_SIZE,
  EDGE_LABEL_TOTAL_SUFFIX,
  STATUS_BORDER_WIDTH_ERROR,
  STATUS_BORDER_WIDTH_SUCCESS,
  STATUS_GLYPH_INSET,
  STATUS_GLYPH_SIZE,
  DISABLED_SUFFIX,
  EDGE_WIDTH,
  DESCRIPTIONS_VERSION,
  FONT_STACK,
  GRID,
  LIGHT,
  NAME_BASELINE,
  NAME_FONT_SIZE,
  NAME_FONT_WEIGHT,
  NAME_GAP,
  NODE_BORDER_WIDTH,
  NODE_RADIUS,
  PORT_DOT_RADIUS,
  STICKY_ASCENT_RATIO,
  STICKY_BODY_SIZE,
  STICKY_BODY_WEIGHT,
  STICKY_BORDER_WIDTH,
  STICKY_COLORS,
  STICKY_HEADING_SIZES,
  STICKY_IMAGE_HEIGHT,
  STICKY_HEADING_WEIGHT,
  STICKY_LINE_RATIO,
  STICKY_PAD_X,
  STICKY_PAD_Y,
  STICKY_RADIUS,
  SELECTION_RING_WIDTH,
  TRIGGER_RADIUS,
  type ThemeTokens,
} from './constants.js';
import { contrastTextFor, isHexColor, stickyBorderFor } from './color.js';
import { el, esc, num, text } from './svg.js';
import { evaluateSubtitle } from './subtitle.js';
import { truncateLabel, wrapLabel } from './text.js';
import type { IconEntry } from 'workflow-render-assets';
import type { RenderOptions, SceneEdgePath, SceneGraph, SceneNode, SceneSticky } from './types.js';

/**
 * Colours are written as concrete presentation attributes for the rendered
 * theme — so a standalone SVG (export, resvg, any dumb renderer) always carries
 * its palette — and the opposite theme ships as CSS overrides scoped to
 * `.wr-theme-<other>`. A host that wraps the SVG in an element carrying that
 * class flips the theme without the SVG string changing at all.
 *
 * CSS custom properties were tried first and rejected: resvg paints any element
 * whose resolved fill is `var(...)` black, which would break every export.
 */
/** The single theme's root class. Light only; see the spec's decision 8. */
export const THEME_CLASS = 'wr-theme-light';

/** Rounded-rect path with per-corner radii (n8n gives triggers a rounded nose). */
function tilePath(x: number, y: number, w: number, h: number, tl: number, tr: number, br: number, bl: number): string {
  return [
    `M ${num(x + tl)} ${num(y)}`,
    `H ${num(x + w - tr)}`,
    `A ${num(tr)} ${num(tr)} 0 0 1 ${num(x + w)} ${num(y + tr)}`,
    `V ${num(y + h - br)}`,
    `A ${num(br)} ${num(br)} 0 0 1 ${num(x + w - br)} ${num(y + h)}`,
    `H ${num(x + bl)}`,
    `A ${num(bl)} ${num(bl)} 0 0 1 ${num(x)} ${num(y + h - bl)}`,
    `V ${num(y + tl)}`,
    `A ${num(tl)} ${num(tl)} 0 0 1 ${num(x + tl)} ${num(y)}`,
    'Z',
  ].join(' ');
}

/**
 * The same outline shrunk by `d` on every side.
 *
 * n8n's tile border is a CSS border: it lies inside the box, and the tile's own
 * background is clipped to the padding box rather than running under it. So the
 * border is stroked on the outline inset by half its width, and the fill sits on
 * the outline inset by the whole of it -- which leaves the border compositing
 * over whatever is behind the node, exactly as the capture shows.
 */
function insetTilePath(
  x: number, y: number, w: number, h: number,
  tl: number, tr: number, br: number, bl: number, d: number,
): string {
  const r = (radius: number): number => Math.max(radius - d, 0);
  return tilePath(x + d, y + d, w - 2 * d, h - 2 * d, r(tl), r(tr), r(br), r(bl));
}

// ---------------------------------------------------------------- icons

/**
 * Re-target an extracted icon SVG into a box.
 *
 * The source's own coordinate system has to be carried across, and many vendor
 * icons express it only as width and height -- 117 of the bundled set declare
 * no viewBox at all. Dropping their dimensions without supplying one left the
 * artwork at its intrinsic scale inside a 40px box, showing just its top-left
 * corner. Where a viewBox is missing, one is built from the dimensions.
 */
function svgIcon(raw: string, x: number, y: number, size: number): string {
  const body = raw.replace(/^﻿?\s*(?:<\?xml[^>]*\?>|<!DOCTYPE[^>]*>|<!--[\s\S]*?-->)\s*/g, '');
  const open = body.match(/^<svg\b[^>]*>/i);
  if (!open) return '';
  const tag = open[0];
  const attr = (name: string): string | undefined =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag)?.[1];

  const hasViewBox = attr('viewBox') !== undefined;
  const w = Number.parseFloat(attr('width') ?? '');
  const h = Number.parseFloat(attr('height') ?? '');
  const derived =
    !hasViewBox && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0
      ? ` viewBox="0 0 ${num(w)} ${num(h)}"`
      : '';

  const attrs = tag
    .replace(/^<svg/i, '')
    .replace(/\/?>$/, '')
    .replace(/\s(?:width|height|x|y|class|preserveAspectRatio)\s*=\s*"[^"]*"/gi, '')
    .replace(/\s(?:width|height|x|y|class|preserveAspectRatio)\s*=\s*'[^']*'/gi, '');
  const inner = body.slice(tag.length).replace(/<\/svg>\s*$/i, '');
  // Centre it and never distort it, whatever the source asked for.
  return (
    `<svg${attrs}${derived} class="wr-icon" preserveAspectRatio="xMidYMid meet"` +
    ` x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}">${inner}</svg>`
  );
}

/** A raster vendor icon, already inlined as a data URI by the extractor. */
function imageIcon(
  entry: Extract<IconEntry, { type: 'image' }>,
  x: number,
  y: number,
  size: number,
): string {
  return el('image', {
    class: 'wr-icon',
    x,
    y,
    width: size,
    height: size,
    preserveAspectRatio: 'xMidYMid meet',
    'xlink:href': entry.href,
  });
}

function monogramIcon(entry: Extract<IconEntry, { type: 'monogram' }>, x: number, y: number, size: number): string {
  return el(
    'g',
    { class: 'wr-monogram' },
    el('rect', { x, y, width: size, height: size, rx: size * 0.22, fill: entry.color }),
    text(
      {
        x: x + size / 2,
        y: y + size / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': size * 0.42,
        'font-weight': 700,
        fill: '#ffffff',
      },
      entry.letters,
    ),
  );
}

/** Draw a glyph body into a box at an explicit colour. */
function glyphBody(
  entry: Extract<IconEntry, { type: 'glyph' }>,
  x: number,
  y: number,
  size: number,
  color: string,
  className: string,
): string {
  return `<svg class="${className}" x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" viewBox="${esc(entry.viewBox)}" color="${esc(color)}">${entry.body}</svg>`;
}

/** A node glyph, tinted by the node's iconColor. */
function glyphIcon(
  entry: Extract<IconEntry, { type: 'glyph' }>,
  x: number,
  y: number,
  size: number,
): string {
  const fill = (entry.colorName && ICON_COLORS[entry.colorName]) || ICON_COLOR_DEFAULT;
  // Lucide glyphs are stroked, not filled, and paint with currentColor — so set
  // `color` and leave fill alone, or the outlines fill in solid.
  return `<svg class="wr-glyph" x="${num(x)}" y="${num(y)}" width="${num(size)}" height="${num(size)}" viewBox="${esc(entry.viewBox)}" color="${esc(fill)}">${entry.body}</svg>`;
}

function fallbackMonogram(name: string): Extract<IconEntry, { type: 'monogram' }> {
  const letters =
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => (word[0] ?? '').toUpperCase())
      .join('') || '?';
  return { type: 'monogram', letters, color: '#999' };
}

// ---------------------------------------------------------------- stickies

/**
 * Only navigable, side-effect-free schemes may reach an `xlink:href`. Workflow
 * JSON is untrusted input rendered inside someone else's page, so a sticky
 * containing `[x](javascript:...)` must not become a live link.
 */
function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return /^(?:https?|mailto):/i.test(trimmed) ? trimmed : undefined;
  }
  // Scheme-relative URLs inherit the page's scheme; everything else is relative.
  return trimmed.startsWith('//') ? `https:${trimmed}` : trimmed;
}

/** An image a sticky asks for, once its source has been vetted. */
interface StickyImage {
  src: string;
  alt: string;
  /** True when drawing it would reach a host the reader did not choose. */
  remote: boolean;
  /** The host, so a placeholder can say where the image would come from. */
  host: string;
}

interface Segment {
  content: string;
  bold?: boolean;
  code?: boolean;
  italic?: boolean;
  strike?: boolean;
  href?: string;
}
interface Line {
  segments: Segment[];
  size: number;
  bold?: boolean;
  /** An image block rather than a line of text. */
  image?: StickyImage;
}

/**
 * Vet an image source.
 *
 * `data:image/*` and relative paths are self-contained or same-origin, so they
 * disclose nothing. Remote http(s) is allowed through but flagged, and the
 * caller decides. Everything else -- `javascript:`, `vbscript:`, `data:text/html`
 * -- is refused outright: sticky content is untrusted input rendered inside
 * someone else's page.
 */
function safeImageSrc(src: string): StickyImage | undefined {
  const trimmed = src.trim();
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed)?.[1]?.toLowerCase();
  if (scheme === 'data') {
    return /^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(trimmed)
      ? { src: trimmed, alt: '', remote: false, host: '' }
      : undefined;
  }
  if (scheme === 'http' || scheme === 'https') {
    const host = /^https?:\/\/([^/?#]+)/i.exec(trimmed)?.[1] ?? '';
    return { src: trimmed, alt: '', remote: true, host };
  }
  if (scheme) return undefined; // any other scheme
  if (trimmed.startsWith('//')) {
    return { src: `https:${trimmed}`, alt: '', remote: true, host: trimmed.slice(2).split(/[/?#]/)[0] ?? '' };
  }
  return { src: trimmed, alt: '', remote: false, host: '' };
}

/**
 * Undo the HTML escaping `marked` applies to the text it hands back.
 *
 * The lexer escapes for HTML; the SVG serialiser escapes for XML on the way
 * out. Escaping twice is what prints a literal `&#39;` on a sticky instead of
 * an apostrophe. `&amp;` is decoded last, so text that genuinely contained the
 * five characters `&` `l` `t` `;` survives as those characters.
 */
const decodeEntities = (value: string): string =>
  value
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function inlineSegments(tokens: unknown[]): Segment[] {
  const out: Segment[] = [];
  for (const token of tokens as Array<Record<string, unknown>>) {
    const type = token['type'];
    const children = Array.isArray(token['tokens']) ? (token['tokens'] as unknown[]) : undefined;
    if (type === 'strong') {
      out.push(...(children ? inlineSegments(children) : []).map((s) => ({ ...s, bold: true })));
    } else if (type === 'em') {
      out.push(...(children ? inlineSegments(children) : []).map((s) => ({ ...s, italic: true })));
    } else if (type === 'del') {
      out.push(...(children ? inlineSegments(children) : []).map((s) => ({ ...s, strike: true })));
    } else if (type === 'image') {
      // Drawn as its own block by stickyLines, not as text in the flow.
      continue;
    } else if (type === 'codespan') {
      out.push({ content: decodeEntities(String(token['text'] ?? '')), code: true });
    } else if (type === 'link') {
      out.push(
        ...(children ? inlineSegments(children) : []).map((s) => ({ ...s, href: String(token['href'] ?? '') })),
      );
    } else if (children && children.length > 0) {
      out.push(...inlineSegments(children));
    } else if (type === 'br') {
      out.push({ content: ' ' });
    } else {
      out.push({ content: decodeEntities(String(token['text'] ?? '')) });
    }
  }
  return out;
}

/** Every image in an inline token tree, vetted, in document order. */
function collectImages(tokens: unknown[]): StickyImage[] {
  const out: StickyImage[] = [];
  for (const token of tokens as Array<Record<string, unknown>>) {
    if (token['type'] === 'image') {
      const vetted = safeImageSrc(String(token['href'] ?? ''));
      if (vetted) out.push({ ...vetted, alt: String(token['text'] ?? '') });
      continue;
    }
    if (Array.isArray(token['tokens'])) out.push(...collectImages(token['tokens'] as unknown[]));
  }
  return out;
}

/** Break segments into lines that fit `width` at `size` (average glyph ≈ 0.55em). */
function wrap(segments: Segment[], width: number, size: number): Segment[][] {
  const perLine = Math.max(Math.floor(width / (size * 0.55)), 8);
  const lines: Segment[][] = [[]];
  let used = 0;
  for (const segment of segments) {
    for (const word of segment.content.split(/(\s+)/)) {
      if (word === '') continue;
      if (used + word.length > perLine && used > 0) {
        lines.push([]);
        used = 0;
        if (/^\s+$/.test(word)) continue;
      }
      lines[lines.length - 1]!.push({ ...segment, content: word });
      used += word.length;
    }
  }
  return lines.filter((line) => line.length > 0);
}

/** The markdown subset n8n stickies use: headings, bold, inline code, links, lists. */
function stickyLines(content: string, width: number): Line[] {
  const lines: Line[] = [];
  for (const token of marked.lexer(content) as Array<Record<string, unknown>>) {
    const type = token['type'];
    if (type === 'space') continue;
    if (type === 'heading') {
      const depth = Number(token['depth'] ?? 1);
      const size = STICKY_HEADING_SIZES[depth] ?? STICKY_HEADING_SIZES[3]!;
      for (const segments of wrap(inlineSegments((token['tokens'] as unknown[]) ?? []), width, size)) {
        lines.push({ segments, size, bold: true });
      }
    } else if (type === 'list') {
      for (const item of (token['items'] as Array<Record<string, unknown>>) ?? []) {
        const segments = inlineSegments((item['tokens'] as unknown[]) ?? []);
        const wrapped = wrap(segments, width, STICKY_BODY_SIZE);
        wrapped.forEach((line, index) => {
          lines.push({ segments: index === 0 ? [{ content: '• ' }, ...line] : line, size: STICKY_BODY_SIZE });
        });
      }
    } else if (type === 'code') {
      for (const line of decodeEntities(String(token['text'] ?? '')).split('\n')) {
        lines.push({ segments: [{ content: line, code: true }], size: STICKY_BODY_SIZE });
      }
    } else if (type === 'table') {
      // A table used to render as nothing at all: its content vanished with
      // nothing to show the reader anything was missing. Laying out real
      // columns is out of scope, so the cells are kept as delimited rows.
      const row = (cells: unknown[], bold: boolean): void => {
        const segments: Segment[] = [];
        for (const cell of cells as Array<Record<string, unknown>>) {
          if (segments.length > 0) segments.push({ content: ' | ' });
          const inner = Array.isArray(cell['tokens'])
            ? inlineSegments(cell['tokens'] as unknown[])
            : [{ content: decodeEntities(String(cell['text'] ?? '')) }];
          segments.push(...inner.map((sg) => ({ ...sg, bold: bold || sg.bold })));
        }
        for (const line of wrap(segments, width, STICKY_BODY_SIZE)) {
          lines.push({ segments: line, size: STICKY_BODY_SIZE });
        }
      };
      row((token['header'] as unknown[]) ?? [], true);
      for (const r of (token['rows'] as unknown[][]) ?? []) row(r, false);
    } else {
      const inline = (token['tokens'] as unknown[]) ?? [{ text: token['text'] }];
      const segments = inlineSegments(inline);
      for (const line of wrap(segments, width, STICKY_BODY_SIZE)) {
        lines.push({ segments: line, size: STICKY_BODY_SIZE });
      }
      // Images are blocks, not words, so they follow the paragraph's text.
      for (const image of collectImages(inline)) {
        lines.push({ segments: [], size: STICKY_BODY_SIZE, image });
      }
    }
  }
  return lines;
}

function renderSticky(
  scene: SceneSticky,
  index: number,
  tokens: ThemeTokens,
  remoteImages: boolean,
): string {
  const { sticky } = scene;
  // A custom colour gives only the background; the border and the text colour
  // are derived from it, the text so a dark sticky stays readable.
  const color = sticky.color;
  const palette = isHexColor(color)
    ? { bg: color, border: stickyBorderFor(color) }
    : (STICKY_COLORS[color as number] ?? STICKY_COLORS[1]!);
  const bodyFill = isHexColor(color) ? contrastTextFor(color) : tokens.text;
  const { x, y } = scene;
  const clipId = `wr-sticky-clip-${index}`;
  // `cursor` tracks the top of each line box; the baseline is derived from the
  // line's own size, so headings and body text both land correctly.
  let cursor = y + STICKY_PAD_Y;

  const body: string[] = [];
  for (const line of stickyLines(sticky.content, sticky.width - STICKY_PAD_X * 2)) {
    if (cursor > y + sticky.height - 4) break;

    if (line.image) {
      const boxW = sticky.width - STICKY_PAD_X * 2;
      const left = x + STICKY_PAD_X;
      if (!line.image.remote || remoteImages) {
        body.push(
          el('image', {
            class: 'wr-sticky-image',
            x: left,
            y: cursor,
            width: boxW,
            height: STICKY_IMAGE_HEIGHT,
            preserveAspectRatio: 'xMidYMid meet',
            'xlink:href': line.image.src,
          }),
        );
      } else {
        // Say an image is here and where it points, rather than dropping it.
        body.push(
          el('rect', {
            class: 'wr-sticky-image-placeholder',
            x: left,
            y: cursor,
            width: boxW,
            height: STICKY_IMAGE_HEIGHT,
            rx: 4,
            fill: 'none',
            stroke: palette.border,
            'stroke-dasharray': '4 3',
          }),
          el(
            'text',
            {
              x: left + boxW / 2,
              y: cursor + STICKY_IMAGE_HEIGHT / 2,
              'font-size': STICKY_BODY_SIZE,
              'text-anchor': 'middle',
              fill: tokens.textMuted,
            },
            el('tspan', {}, esc(line.image.alt || 'image')),
            el('tspan', {}, esc(line.image.host ? ` — ${line.image.host}` : '')),
          ),
        );
      }
      cursor += STICKY_IMAGE_HEIGHT + 6;
      continue;
    }

    const lineHeight = line.size * STICKY_LINE_RATIO;
    const baseline = cursor + (lineHeight - line.size) / 2 + line.size * STICKY_ASCENT_RATIO;
    const spans = line.segments.map((segment) => {
      const attrs = {
        'font-weight': segment.bold || line.bold ? STICKY_HEADING_WEIGHT : undefined,
        'font-family': segment.code ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined,
        'font-style': segment.italic ? 'italic' : undefined,
        'text-decoration':
          [
            segment.href && safeHref(segment.href) ? 'underline' : '',
            segment.strike ? 'line-through' : '',
          ]
            .filter(Boolean)
            .join(' ') || undefined,
      };
      const span = el('tspan', attrs, esc(segment.content));
      const href = segment.href === undefined ? undefined : safeHref(segment.href);
      return href ? el('a', { 'xlink:href': href }, span) : span;
    });
    body.push(
      el(
        'text',
        {
          class: 'wr-sticky-text',
          x: x + STICKY_PAD_X,
          y: baseline,
          'font-size': line.size,
          'font-weight': line.bold ? STICKY_HEADING_WEIGHT : STICKY_BODY_WEIGHT,
          fill: bodyFill,
        },
        ...spans,
      ),
    );
    cursor += lineHeight;
  }

  return el(
    'g',
    { class: 'wr-sticky', 'data-sticky-name': sticky.name },
    el(
      'clipPath',
      { id: clipId },
      el('rect', { x, y, width: sticky.width, height: sticky.height, rx: NODE_RADIUS }),
    ),
    // Selection halo, as on a node tile: emitted always, painted only when
    // selected, so exports are unaffected.
    el('rect', {
      class: 'wr-sticky-halo',
      x: x - SELECTION_RING_WIDTH / 2,
      y: y - SELECTION_RING_WIDTH / 2,
      width: sticky.width + SELECTION_RING_WIDTH,
      height: sticky.height + SELECTION_RING_WIDTH,
      rx: STICKY_RADIUS + SELECTION_RING_WIDTH / 2,
      fill: 'none',
      stroke: 'none',
      'stroke-width': SELECTION_RING_WIDTH,
    }),
    el('rect', {
      // Only a palette index becomes a class suffix: a hex would produce
      // `wr-sticky-#1DA1F2`, which is not a valid class name.
      class: isHexColor(color) ? 'wr-sticky-bg wr-sticky-custom' : `wr-sticky-bg wr-sticky-${color}`,
      x,
      y,
      width: sticky.width,
      height: sticky.height,
      rx: STICKY_RADIUS,
      fill: palette.bg,
      stroke: palette.border,
      'stroke-width': STICKY_BORDER_WIDTH,
    }),
    el('g', { 'clip-path': `url(#${clipId})` }, ...body),
  );
}

// ---------------------------------------------------------------- nodes

/**
 * n8n does not put a badge disc on an executed node: it recolours the tile
 * border and draws a small check or cross inset from the bottom-right corner.
 */
function statusGlyph(scene: SceneNode, tokens: ThemeTokens): string | undefined {
  const status = scene.node.run?.status;
  if (status !== 'success' && status !== 'error') return undefined;
  const cx = scene.x + scene.w - STATUS_GLYPH_INSET;
  const cy = scene.y + scene.h - STATUS_GLYPH_INSET;
  const r = STATUS_GLYPH_SIZE / 2;
  const stroke = status === 'success' ? tokens.success : tokens.error;
  const d =
    status === 'success'
      ? `M ${num(cx - r * 0.7)} ${num(cy)} L ${num(cx - r * 0.15)} ${num(cy + r * 0.55)} L ${num(cx + r * 0.7)} ${num(cy - r * 0.6)}`
      : `M ${num(cx - r * 0.55)} ${num(cy - r * 0.55)} L ${num(cx + r * 0.55)} ${num(cy + r * 0.55)} M ${num(cx + r * 0.55)} ${num(cy - r * 0.55)} L ${num(cx - r * 0.55)} ${num(cy + r * 0.55)}`;
  return el('g', { class: `wr-badge wr-badge-${status}` }, el('path', {
    class: 'wr-badge-glyph',
    d,
    fill: 'none',
    stroke,
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  }));
}

function renderNode(
  scene: SceneNode,
  tokens: ThemeTokens,
  icons: Record<string, IconEntry>,
  subtitles: RenderOptions['subtitles'],
): string {
  const { node } = scene;
  const classes = ['wr-node'];
  if (node.disabled) classes.push('wr-disabled');
  if (node.run?.status === 'none') classes.push('wr-not-run');

  const isSub = node.kind === 'sub';
  const corner = isSub ? scene.w / 2 : NODE_RADIUS;
  const lead = node.kind === 'trigger' ? TRIGGER_RADIUS : corner;
  const iconSize = isSub ? SUB_ICON_SIZE : ICON_SIZE;
  const iconX = scene.x + (scene.w - iconSize) / 2;
  const iconY = scene.y + (scene.h - iconSize) / 2;
  const status = node.run?.status;
  const tileStroke =
    status === 'success'
      ? tokens.success
      : status === 'error'
        ? tokens.error
        : node.disabled
          ? tokens.nodeBorderDisabled
          : tokens.nodeBorder;
  const tileStrokeWidth =
    status === 'success'
      ? STATUS_BORDER_WIDTH_SUCCESS
      : status === 'error'
        ? STATUS_BORDER_WIDTH_ERROR
        : NODE_BORDER_WIDTH;

  const entry = icons[scene.iconKey];
  const icon =
    entry?.type === 'svg'
      ? svgIcon(entry.svg, iconX, iconY, iconSize)
      : entry?.type === 'image'
        ? imageIcon(entry, iconX, iconY, iconSize)
        : entry?.type === 'glyph'
          ? glyphIcon(entry, iconX, iconY, iconSize)
          : monogramIcon(entry ?? fallbackMonogram(node.name), iconX, iconY, iconSize);

  return el(
    'g',
    { class: classes.join(' '), 'data-node-name': node.name, 'data-node-type': node.type },
    // The selection halo. Always emitted, painted only when the viewer marks
    // this node selected -- selection is a live interaction, so an exported SVG
    // must look identical whether or not something happened to be selected.
    // Expanded by half the ring width and stroked at the full width, so the
    // stroke straddles that path and lands entirely outside the tile edge.
    el('path', {
      class: 'wr-tile-halo',
      d: insetTilePath(
        scene.x, scene.y, scene.w, scene.h, lead, corner, corner, lead,
        -SELECTION_RING_WIDTH / 2,
      ),
      fill: 'none',
      stroke: 'none',
      'stroke-width': SELECTION_RING_WIDTH,
    }),
    el('path', {
      class: 'wr-tile',
      d: insetTilePath(scene.x, scene.y, scene.w, scene.h, lead, corner, corner, lead, tileStrokeWidth),
      fill: tokens.nodeBg,
    }),
    el('path', {
      class: 'wr-tile-border',
      d: insetTilePath(scene.x, scene.y, scene.w, scene.h, lead, corner, corner, lead, tileStrokeWidth / 2),
      fill: 'none',
      stroke: tileStroke,
      'stroke-width': tileStrokeWidth,
    }),
    icon,
    // n8n marks a trigger with a lightning bolt beside the tile.
    node.kind === 'trigger' && icons['n3:trigger-bolt']?.type === 'glyph'
      ? glyphBody(
          icons['n3:trigger-bolt'],
          scene.x + TRIGGER_BOLT_OFFSET_X - TRIGGER_BOLT_SIZE / 2,
          scene.y + scene.h / 2 - TRIGGER_BOLT_SIZE / 2,
          TRIGGER_BOLT_SIZE,
          TRIGGER_BOLT_COLOR,
          'wr-trigger-bolt',
        )
      : undefined,
    ...(() => {
      const lines = wrapLabel(node.disabled ? `${node.name}${DISABLED_SUFFIX}` : node.name);
      const spec = subtitles?.[node.type];
      const subtitle = spec ? evaluateSubtitle(spec, node.parameters) : undefined;
      if (!subtitle) return [];
      const top = scene.y + scene.h + NAME_GAP + lines.length * LABEL_LINE_HEIGHT + SUBTITLE_GAP;
      return [
        text(
          {
            class: 'wr-node-subtitle',
            x: scene.x + scene.w / 2,
            y: top + (SUBTITLE_LINE_HEIGHT - SUBTITLE_FONT_SIZE) / 2 + SUBTITLE_FONT_SIZE * NAME_ASCENT_RATIO,
            'text-anchor': 'middle',
            'font-size': SUBTITLE_FONT_SIZE,
            fill: tokens.subtitle,
          },
          truncateLabel(subtitle, SUBTITLE_WIDTH, SUBTITLE_FONT_SIZE),
        ),
      ];
    })(),
    // What this node itself produced. The connector labels say what moved
    // between nodes; this is the node's own output, as n8n prints it.
    ...(() => {
      const produced = (node.run?.itemsOut ?? []).reduce((sum, n) => sum + n, 0);
      if (!node.run || produced === 0) return [];
      // Pinned data is counted here too, as n8n counts it, even though the node
      // never ran -- hence the status check admitting `none` when pinned.
      if (node.run.status === 'none' && !node.run.pinned) return [];
      const lines = wrapLabel(node.disabled ? `${node.name}${DISABLED_SUFFIX}` : node.name);
      const spec = subtitles?.[node.type];
      const hasSubtitle = Boolean(spec && evaluateSubtitle(spec, node.parameters));
      const top =
        scene.y +
        scene.h +
        NAME_GAP +
        lines.length * LABEL_LINE_HEIGHT +
        SUBTITLE_GAP +
        (hasSubtitle ? SUBTITLE_LINE_HEIGHT + SUBTITLE_GAP : 0);
      return [
        text(
          {
            class: 'wr-node-items',
            x: scene.x + scene.w / 2,
            y: top + (SUBTITLE_LINE_HEIGHT - SUBTITLE_FONT_SIZE) / 2 + SUBTITLE_FONT_SIZE * NAME_ASCENT_RATIO,
            'text-anchor': 'middle',
            'font-size': SUBTITLE_FONT_SIZE,
            fill: tokens.textMuted,
          },
          `${produced} ${produced === 1 ? 'item' : 'items'}`,
        ),
      ];
    })(),
    ...wrapLabel(node.disabled ? `${node.name}${DISABLED_SUFFIX}` : node.name).map((line, index) =>
      text(
        {
          class: 'wr-node-name',
          x: scene.x + scene.w / 2,
          y: scene.y + scene.h + NAME_GAP + NAME_BASELINE + index * LABEL_LINE_HEIGHT,
          'text-anchor': 'middle',
          'font-size': NAME_FONT_SIZE,
          'font-weight': NAME_FONT_WEIGHT,
          fill: tokens.text,
        },
        line,
      ),
    ),
    statusGlyph(scene, tokens),
  );
}

// ---------------------------------------------------------------- edges

function renderEdge(scene: SceneEdgePath, tokens: ThemeTokens): string {
  // In an execution, a connector that carried data is drawn in the success
  // colour — including the one feeding a node that then failed.
  const carriedData = (scene.edge.itemCount ?? 0) > 0;
  const stroke =
    scene.edge.kind === 'ai'
      ? tokens.edgeAi
      : scene.edge.kind === 'error'
        ? tokens.error
        : carriedData
          ? tokens.success
          : tokens.edge;
  return el('path', {
    class: `wr-edge wr-edge-${scene.edge.kind}${carriedData ? ' wr-edge-ran' : ''}`,
    d: scene.path,
    fill: 'none',
    stroke,
    'stroke-width': EDGE_WIDTH,
    'stroke-dasharray': scene.edge.kind === 'ai' ? AI_EDGE_DASH : undefined,
    'marker-end':
      scene.edge.kind === 'ai'
        ? undefined
        : `url(#wr-arrow-${scene.edge.kind === 'error' ? 'error' : carriedData ? 'ran' : 'main'})`,
    'data-from': scene.edge.from,
    'data-to': scene.edge.to,
  });
}

function edgeLabel(
  scene: SceneEdgePath,
  tokens: ThemeTokens,
  multiRun: ReadonlySet<string>,
): string | undefined {
  const at = scene.labelAt;
  if (!at) return undefined;
  const parts: string[] = [];
  if (scene.edge.label) parts.push(scene.edge.label);
  if (scene.edge.itemCount !== undefined) {
    const unit = scene.edge.itemCount === 1 ? 'item' : 'items';
    // Across all runs, when the source ran more than once.
    const suffix = multiRun.has(scene.edge.from) ? EDGE_LABEL_TOTAL_SUFFIX : '';
    parts.push(`${scene.edge.itemCount} ${unit}${suffix}`);
  }
  if (parts.length === 0) return undefined;
  const content = parts.join(' · ');
  const width = content.length * 7 + 8;
  return el(
    'g',
    { class: 'wr-edge-label' },
    el('rect', {
      class: 'wr-label-bg',
      x: at.x - width / 2,
      y: at.y - 9,
      width,
      height: 18,
      fill: tokens.labelBg,
      'fill-opacity': EDGE_LABEL_BG_OPACITY,
    }),
    text(
      {
        class: 'wr-label-text',
        x: at.x,
        y: at.y,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        'font-size': EDGE_LABEL_FONT_SIZE,
        fill: tokens.textMuted,
      },
      content,
    ),
  );
}

/** n8n draws a small dot where a connector meets a node. */
function portDots(scene: SceneGraph, tokens: ThemeTokens): string {
  const seen = new Set<string>();
  const dots: string[] = [];
  for (const edge of scene.edges) {
    for (const point of [edge.endpoints.source, edge.endpoints.target]) {
      const key = `${num(point.x)}:${num(point.y)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dots.push(
        el('circle', {
          class: 'wr-port',
          cx: point.x,
          cy: point.y,
          r: PORT_DOT_RADIUS,
          fill: tokens.nodeBg,
          stroke: tokens.portBorder,
        }),
      );
    }
  }
  return el('g', { class: 'wr-layer-ports' }, ...dots);
}

// ---------------------------------------------------------------- document

function duration(ms: number | undefined): string | undefined {
  if (ms === undefined) return undefined;
  return ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${ms}ms`;
}

function header(scene: SceneGraph, tokens: ThemeTokens): string | undefined {
  const execution = scene.execution;
  if (!execution) return undefined;
  const content = [execution.status, duration(execution.durationMs), execution.mode]
    .filter((part): part is string => Boolean(part))
    .join(' · ');
  const x = scene.bounds.x + GRID;
  const y = scene.bounds.y + GRID;
  const width = content.length * 6.6 + 16;
  return el(
    'g',
    { class: 'wr-header' },
    el('rect', {
      class: 'wr-header-bg',
      x,
      y,
      width,
      height: 22,
      rx: 11,
      fill: tokens.labelBg,
      stroke: execution.status === 'error' ? tokens.error : tokens.success,
    }),
    text(
      {
        class: 'wr-header-text',
        x: x + 8,
        y: y + 11,
        'dominant-baseline': 'central',
        'font-size': 11,
        fill: tokens.text,
      },
      content,
    ),
  );
}

function styleBlock(): string {
  return [
    `.wr-root { font-family: ${FONT_STACK}; }`,
    '.wr-not-run { opacity: 0.45; }',
    '.wr-edge { stroke-linecap: round; }',
  ].join('\n');
}

/** Connector colours that need their own arrowhead marker. */
const ARROW_KINDS = ['main', 'ran', 'error'] as const;
type ArrowKind = (typeof ARROW_KINDS)[number];

const arrowColor = (kind: ArrowKind, tokens: ThemeTokens): string =>
  kind === 'ran' ? tokens.success : kind === 'error' ? tokens.error : tokens.edge;

/** The canvas dot grid and the connector arrowheads. */
function defs(tokens: ThemeTokens): string {
  return el(
    'defs',
    {},
    el(
      'pattern',
      {
        id: 'wr-dots',
        patternUnits: 'userSpaceOnUse',
        width: DOT_SPACING,
        height: DOT_SPACING,
        patternTransform: `translate(${num(DOT_PHASE)},${num(DOT_PHASE)})`,
      },
      el('circle', { class: 'wr-dot', cx: DOT_RADIUS, cy: DOT_RADIUS, r: DOT_RADIUS, fill: tokens.dot }),
    ),
    ...ARROW_KINDS.map((kind) =>
      el(
        'marker',
        {
          id: `wr-arrow-${kind}`,
          class: `wr-arrow wr-arrow-${kind}`,
          viewBox: ARROW_VIEWBOX,
          markerWidth: ARROW_SIZE,
          markerHeight: ARROW_SIZE,
          refX: 0,
          refY: 0,
          orient: 'auto-start-reverse',
          markerUnits: 'userSpaceOnUse',
        },
        el('polyline', {
          points: ARROW_POINTS,
          fill: arrowColor(kind, tokens),
          stroke: arrowColor(kind, tokens),
          'stroke-width': ARROW_STROKE_WIDTH,
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
        }),
      ),
    ),
  );
}

export function renderSVG(scene: SceneGraph, opts: RenderOptions = {}): string {
  const tokens = LIGHT;
  const multiRun = new Set(
    scene.nodes.filter((node) => (node.node.run?.runs ?? 0) > 1).map((node) => node.node.name),
  );
  const icons = opts.icons ?? {};
  const { bounds } = scene;

  return el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      'xmlns:xlink': 'http://www.w3.org/1999/xlink',
      class: 'wr-root',
      // Stop the browser re-hinting glyphs at every scale: without this the
      // labels shimmer while the canvas zooms.
      'text-rendering': 'geometricPrecision',
      viewBox: `${num(bounds.x)} ${num(bounds.y)} ${num(bounds.width)} ${num(bounds.height)}`,
      width: bounds.width,
      height: bounds.height,
      'data-descriptions-version': DESCRIPTIONS_VERSION,
      'data-theme': 'light',
      'data-view': scene.view,
    },
    el('style', {}, styleBlock()),
    defs(tokens),
    el('rect', {
      class: 'wr-canvas-bg',
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      fill: tokens.canvasBg,
    }),
    // The grid has to outlast panning. Sized to the workflow it simply ran out,
    // and the reader panned off the edge of the canvas onto bare background.
    el('rect', {
      class: 'wr-canvas-dots',
      x: bounds.x - bounds.width * 2,
      y: bounds.y - bounds.height * 2,
      width: bounds.width * 5,
      height: bounds.height * 5,
      // One ground for both views. The diagonal hatch that used to sit under a
      // run belongs to n8n's read-only preview canvas, where it appears with no
      // execution at all -- it was never a signal that you were looking at one.
      fill: 'url(#wr-dots)',
    }),
    el('g', { class: 'wr-layer-stickies' }, ...scene.stickies.map((s, i) => renderSticky(s, i, tokens, opts.remoteImages === true))),
    el('g', { class: 'wr-layer-edges' }, ...scene.edges.map((edge) => renderEdge(edge, tokens))),
    el(
      'g',
      { class: 'wr-layer-edge-labels' },
      ...scene.edges.map((edge) => edgeLabel(edge, tokens, multiRun) ?? ''),
    ),
    el('g', { class: 'wr-layer-nodes' }, ...scene.nodes.map((node) => renderNode(node, tokens, icons, opts.subtitles))),
    // n8n stacks the port handles above the node, so a dot covers the tile edge.
    portDots(scene, tokens),
    header(scene, tokens),
  );
}
