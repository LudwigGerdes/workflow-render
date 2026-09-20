import { describe, expect, it } from 'vitest';
import { LABEL_WIDTH, NAME_FONT_SIZE, SUBTITLE_FONT_SIZE, SUBTITLE_WIDTH } from '../src/constants.js';
import { measureWidth, truncateLabel, wrapLabel } from '../src/text.js';

describe('measureWidth', () => {
  it('knows narrow characters from wide ones', () => {
    // the whole reason for real metrics: these are not the same width
    expect(measureWidth('IIII', 16, 500)).toBeLessThan(measureWidth('WWWW', 16, 500));
    expect(measureWidth('.', 16, 500)).toBeLessThan(measureWidth('M', 16, 500));
  });

  it('scales with font size', () => {
    expect(measureWidth('Hello', 32, 500)).toBeCloseTo(measureWidth('Hello', 16, 500) * 2, 5);
  });

  it('is zero for nothing and additive across characters', () => {
    expect(measureWidth('', 16, 500)).toBe(0);
    expect(measureWidth('ab', 16, 500)).toBeCloseTo(
      measureWidth('a', 16, 500) + measureWidth('b', 16, 500),
      5,
    );
  });

  it('falls back for characters it has no metric for', () => {
    expect(measureWidth('☃', 16, 500)).toBeGreaterThan(0);
  });
});

describe('wrapLabel with real metrics', () => {
  it('wraps where n8n wraps this name', () => {
    expect(wrapLabel("When clicking 'Execute workflow'", LABEL_WIDTH, NAME_FONT_SIZE)).toEqual([
      "When clicking 'Execute",
      "workflow'",
    ]);
  });

  it('keeps a name that fits on one line', () => {
    expect(wrapLabel('HTTP Request', LABEL_WIDTH, NAME_FONT_SIZE)).toEqual(['HTTP Request']);
  });

  it('fits more narrow characters than wide ones on a line', () => {
    const narrow = wrapLabel('i'.repeat(60), LABEL_WIDTH, NAME_FONT_SIZE);
    const wide = wrapLabel('W'.repeat(60), LABEL_WIDTH, NAME_FONT_SIZE);
    expect(narrow.length).toBeLessThan(wide.length);
  });

  it('breaks a single over-long word rather than overflowing', () => {
    const lines = wrapLabel('W'.repeat(80), LABEL_WIDTH, NAME_FONT_SIZE);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measureWidth(line, NAME_FONT_SIZE, 500)).toBeLessThanOrEqual(LABEL_WIDTH);
  });
});

describe('truncateLabel with real metrics', () => {
  it('clips to the box and marks it', () => {
    const clipped = truncateLabel('GET: https://api.example.com/users/and/more/path', LABEL_WIDTH, 13);
    expect(clipped.endsWith('…')).toBe(true);
    // "Fits" is what the browser means by it: our per-glyph sum carries the
    // kerning it does not, and CSS fits against a rounded width, so the box
    // admits a little over its nominal size (see FIT_TOLERANCE in text.ts).
    expect(measureWidth(clipped, 13, 400)).toBeLessThanOrEqual(LABEL_WIDTH * 1.005 + 0.5);
  });

  it('leaves something that already fits alone', () => {
    expect(truncateLabel('manual', LABEL_WIDTH, 13)).toBe('manual');
  });
});

describe('subtitle box', () => {
  // Read off the live 2.10.0 canvas: the subtitle element lays out at exactly
  // 192px with text-overflow: ellipsis, and shows the "m" of ".com".
  it('clips the reference subtitle where n8n does', () => {
    const subtitle = 'GET: https://api.example.com/users';
    expect(truncateLabel(subtitle, SUBTITLE_WIDTH, SUBTITLE_FONT_SIZE)).toBe('GET: https://api.example.com…');
  });

  it('measures a string the way the browser does, glyph for glyph', () => {
    // The browser sums these advances to 193.23 and shapes the string, with
    // kerning, to 192.42. Our sum has no kerning, so it should land on 193.23.
    expect(measureWidth('GET: https://api.example.com…', SUBTITLE_FONT_SIZE, 400)).toBeCloseTo(193.23, 1);
  });

  it('drops the next character, which n8n also does not show', () => {
    const subtitle = 'GET: https://api.example.com/users';
    expect(truncateLabel(subtitle, SUBTITLE_WIDTH, SUBTITLE_FONT_SIZE)).not.toContain('.com/');
  });
});
