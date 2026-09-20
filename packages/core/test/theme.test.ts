import { describe, expect, it } from 'vitest';
import { THEME, contrastRatio } from '../src/theme.js';

describe('theme', () => {
  it('paints its own ground rather than inheriting the page', () => {
    // The element is embedded in pages it does not control; a transparent
    // ground means a light canvas renders dark-on-dark on a dark site.
    expect(THEME.canvas.background).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('keeps node labels readable on the tile', () => {
    expect(contrastRatio(THEME.node.label, THEME.node.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('holds the subtitle at the contrast n8n gives it, and no worse', () => {
    // 3.03:1. That is below WCAG AA for body text, and it is n8n's own value:
    // the canvas is meant to be indistinguishable from n8n's, so darkening it
    // here would be a visible deviation rather than a fix. The floor guards
    // against drifting further down; raising it is a deliberate choice to stop
    // matching, not a tidy-up.
    const ratio = contrastRatio(THEME.node.subtitle, THEME.node.background);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
  });

  it('distinguishes node kinds by more than colour', () => {
    // Someone reading a greyscale screenshot still has to tell a trigger from
    // a regular node.
    const shapes = new Set(Object.values(THEME.kind).map((k) => k.shape));
    expect(shapes.size).toBeGreaterThan(1);
  });

  it('distinguishes run status by more than hue', () => {
    const marks = Object.values(THEME.status).map((s) => s.mark);
    expect(new Set(marks).size).toBe(marks.length);
  });

  it('names the measured palette rather than inventing one', () => {
    // The guard on decision 9: if someone swaps these for colours of their own,
    // the canvas stops looking like n8n and this test says so.
    expect(THEME.canvas.background).toBe('#f5f5f5');
    expect(THEME.node.background).toBe('#ffffff');
    expect(THEME.status.success.colour).toBe('#29a360');
    expect(THEME.status.error.colour).toBe('#ea1f30');
  });
});
