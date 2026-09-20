/**
 * Node-name wrapping and truncation, measured rather than estimated.
 *
 * n8n lays a name out in a box twice the tile's width and lets it wrap inside
 * it. Layout needs the same line breaks as render — bounds must reserve room for
 * the wrapped name — so the wrapping lives here and both stages call it.
 *
 * Widths come from the real advances of the Inter faces we ship (see
 * `scripts/extract-font-metrics.mts`). The previous version assumed every
 * character was the same width, fitted to an average: right on average, wrong
 * per character, since "I" and "W" are nothing alike.
 */
import { LABEL_WIDTH, NAME_FONT_SIZE } from './constants.js';
import { ADVANCES, FALLBACK_ADVANCE, MEASURED } from './font-metrics.generated.js';

/** The weight node names are drawn at; the default for measuring. */
const DEFAULT_WEIGHT = 500;
const ELLIPSIS = '…';

/**
 * How much a string may overhang its box and still be kept.
 *
 * Two small effects push the same way. Summing per-glyph advances ignores
 * kerning, which the browser applies, so our figure runs slightly wide -- a
 * measured +0.2% to +0.45% on the reference strings, at most 0.83px. And CSS
 * fits an ellipsised line against a rounded layout width, so the browser keeps
 * text fractionally wider than its box: the reference subtitle measures 192.42
 * in a 192px box and is drawn in full. One pixel covers both for boxes of this
 * size without letting a real overflow through.
 */
const KERNING_DRIFT = 0.005;
const SUBPIXEL_ROUNDING = 0.5;

/** The tolerance for a box of a given width, from the two effects above. */
const fitTolerance = (width: number): number => width * KERNING_DRIFT + SUBPIXEL_ROUNDING;

/**
 * Width of `text` in user units, at a font size and weight.
 *
 * Advances are measured per size because InterVariable is optically sized: its
 * glyphs are relatively wider at small sizes, so a single em-normalised table
 * cannot describe it. A size we have not measured falls back to the nearest one
 * that was, scaled -- an approximation, and flagged as such, since scaling is
 * exactly what optical sizing breaks.
 */
export function measureWidth(text: string, fontSize: number, weight: number = DEFAULT_WEIGHT): number {
  const exact = ADVANCES[`${fontSize}/${weight}`];
  if (exact) return sum(text, exact, FALLBACK_ADVANCE[`${fontSize}/${weight}`] ?? 0);

  // Nearest measured table for this weight, else the nearest of any weight.
  const sameWeight = MEASURED.filter((m) => m.weight === weight);
  const pool = sameWeight.length > 0 ? sameWeight : MEASURED;
  if (pool.length === 0) return 0;
  const nearest = pool.reduce((best, m) =>
    Math.abs(m.size - fontSize) < Math.abs(best.size - fontSize) ? m : best,
  );
  const table = ADVANCES[nearest.key] ?? {};
  return sum(text, table, FALLBACK_ADVANCE[nearest.key] ?? 0) * (fontSize / nearest.size);
}

/** Total advance of a string against one table. */
function sum(text: string, table: Record<number, number>, fallback: number): number {
  let total = 0;
  for (const character of text) total += table[character.codePointAt(0) ?? 0] ?? fallback;
  return total;
}

/** Break one over-long word so it cannot overflow its box. */
function breakWord(word: string, width: number, fontSize: number, weight: number): string[] {
  const pieces: string[] = [];
  let current = '';
  for (const character of word) {
    if (current !== '' && measureWidth(current + character, fontSize, weight) > width) {
      pieces.push(current);
      current = character;
    } else {
      current += character;
    }
  }
  if (current !== '') pieces.push(current);
  return pieces;
}

/** Break a node name into the lines n8n would show under the tile. */
export function wrapLabel(
  name: string,
  width: number = LABEL_WIDTH,
  fontSize: number = NAME_FONT_SIZE,
  weight: number = DEFAULT_WEIGHT,
): string[] {
  const lines: string[] = [];
  let current = '';

  for (const word of name.split(/\s+/).filter(Boolean)) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (measureWidth(candidate, fontSize, weight) <= width) {
      current = candidate;
      continue;
    }

    if (current !== '') {
      lines.push(current);
      current = '';
    }
    if (measureWidth(word, fontSize, weight) <= width) {
      current = word;
      continue;
    }
    const pieces = breakWord(word, width, fontSize, weight);
    lines.push(...pieces.slice(0, -1));
    current = pieces[pieces.length - 1] ?? '';
  }

  if (current !== '') lines.push(current);
  return lines.length > 0 ? lines : [''];
}

/**
 * Clip a single line to its box, ellipsising like n8n does — its subtitle is one
 * line that never overflows ("GET: https://api.example.co…").
 */
export function truncateLabel(
  text: string,
  width: number = LABEL_WIDTH,
  fontSize: number = NAME_FONT_SIZE,
  weight: number = 400,
): string {
  const fits = width + fitTolerance(width);
  if (measureWidth(text, fontSize, weight) <= fits) return text;

  let kept = '';
  for (const character of text) {
    if (measureWidth(`${kept}${character}${ELLIPSIS}`, fontSize, weight) > fits) break;
    kept += character;
  }
  return `${kept}${ELLIPSIS}`;
}
