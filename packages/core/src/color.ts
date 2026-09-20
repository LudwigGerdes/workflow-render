/**
 * Colour arithmetic for custom sticky notes.
 *
 * A sticky's `color` is either a palette index or a `#RRGGBB` string. A custom
 * colour supplies only the background, so the border and the text colour have
 * to be derived from it -- the text especially, since a dark sticky needs light
 * text or its content is unreadable rather than merely off-palette.
 *
 * The luminance maths here is the WCAG 2.x relative-luminance formula, a
 * published standard rather than anything specific to a workflow canvas. The
 * two choices layered on top -- how far the border darkens, and where the
 * light/dark text threshold sits -- live in `constants.ts`.
 */
import {
  STICKY_CONTRAST_THRESHOLD,
  STICKY_CUSTOM_BORDER_SCALE,
  STICKY_TEXT_DARK,
  STICKY_TEXT_LIGHT,
} from './constants.js';

/** Exactly six hex digits, as n8n validates: `#abc` is not a sticky colour. */
const HEX = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX.test(value);
}

function channels(hex: string): [number, number, number] {
  const raw = hex.slice(1);
  return [
    Number.parseInt(raw.slice(0, 2), 16),
    Number.parseInt(raw.slice(2, 4), 16),
    Number.parseInt(raw.slice(4, 6), 16),
  ];
}

const toHex = (n: number): string => n.toString(16).padStart(2, '0');

/**
 * The same colour with every channel scaled, clamped to a byte.
 *
 * Scaling each channel is not a perceptual operation -- it darkens a saturated
 * colour more than a pale one -- but it is what produces the border beside the
 * background, so it is the arithmetic that matches.
 */
export function scaleChannels(hex: string, factor: number): string {
  if (!isHexColor(hex)) return hex;
  const scaled = channels(hex).map((c) => Math.min(255, Math.max(0, Math.round(c * factor))));
  return `#${scaled.map(toHex).join('')}`;
}

/** The border drawn beside a custom sticky background. */
export function stickyBorderFor(hex: string): string {
  return scaleChannels(hex, STICKY_CUSTOM_BORDER_SCALE);
}

/** WCAG 2.x relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Dark text on a light sticky, light text on a dark one. */
export function contrastTextFor(hex: string): string {
  return relativeLuminance(hex) > STICKY_CONTRAST_THRESHOLD ? STICKY_TEXT_DARK : STICKY_TEXT_LIGHT;
}
