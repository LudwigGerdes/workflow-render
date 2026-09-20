/**
 * The palette, in the vocabulary the renderer speaks.
 *
 * The values themselves live in `constants.ts`, measured from real n8n. This
 * module does not introduce a palette of its own — it names the measured one in
 * platform-neutral terms (canvas, node, kind, status) so a second adapter can
 * one day supply its own values without the renderer learning a new vocabulary.
 *
 * Why it is not an original palette: the canvas is meant to be recognisable as
 * an n8n canvas rather than to have an identity of its own, so a near-miss would
 * read as wrong to anyone who knows the original. See the spec's decision 9.
 *
 * Two things are asserted in `theme.test.ts` rather than eyeballed: text
 * contrast against the surface behind it, and that node kind and run status
 * each carry a non-colour signal, so both survive the greyscale screenshot that
 * ends up attached to a bug report.
 */
import {
  FONT_STACK,
  LIGHT,
  NAME_FONT_SIZE,
  STICKY_COLORS,
  SUBTITLE_FONT_SIZE,
  TRIGGER_BOLT_COLOR,
} from './constants.js';

export const THEME = Object.freeze({
  canvas: {
    /** Painted, never transparent: the host page's background must not reach in. */
    background: LIGHT.canvasBg,
    grid: LIGHT.dot,
    edge: LIGHT.edge,
    edgeHighlight: LIGHT.success,
  },
  node: {
    background: LIGHT.nodeBg,
    border: LIGHT.nodeBorder,
    label: LIGHT.text,
    subtitle: LIGHT.subtitle,
    chip: LIGHT.labelBg,
  },
  /**
   * Each kind's outline, so kind survives a greyscale screenshot. These shapes
   * are what the renderer already draws: a trigger's rounded leading edge, a
   * sub-node's pill, a sticky's backdrop, everything else a rounded rectangle.
   */
  kind: {
    trigger: { shape: 'rounded-left' as const, accent: TRIGGER_BOLT_COLOR },
    regular: { shape: 'rect' as const, accent: LIGHT.portBorder },
    sub: { shape: 'pill' as const, accent: LIGHT.portBorder },
    sticky: { shape: 'note' as const, accent: STICKY_COLORS[1]?.border ?? LIGHT.nodeBorderDisabled },
  },
  status: {
    success: { mark: 'check' as const, colour: LIGHT.success },
    error: { mark: 'cross' as const, colour: LIGHT.error },
    /** Not measured: no waiting node appeared in the captured runs. */
    waiting: { mark: 'dots' as const, colour: LIGHT.textMuted },
  },
  type: {
    family: FONT_STACK,
    label: NAME_FONT_SIZE,
    subtitle: SUBTITLE_FONT_SIZE,
  },
});

const channel = (hex: string, at: number): number => {
  const v = parseInt(hex.slice(at, at + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

/** WCAG contrast ratio, so "readable" is measured rather than asserted. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
