/**
 * The glyph tint table, against the node types that actually use it.
 *
 * `ICON_COLORS` maps n8n's `iconColor` names to the hex a glyph is drawn in.
 * A name with no entry does not fail loudly -- `render.ts` falls back to the
 * default tint -- so a missing colour is invisible until someone notices a
 * node drawn in the wrong one. Thirteen names were missing that way, covering
 * ~24 node types, and nothing here noticed.
 *
 * This asserts the table against the bundle rather than against itself, so a
 * description refresh that introduces a new colour name fails here instead of
 * silently rendering grey.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DESCRIPTIONS_VERSION, ICON_COLORS } from '../src/constants.js';

const load = (relative: string): Record<string, unknown> => {
  const path = [resolve(process.cwd(), relative), resolve(process.cwd(), '../..', relative)].find(
    existsSync,
  );
  if (!path) throw new Error(`not found: ${relative}`);
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

/** Every distinct `iconColor` the bundled descriptions ask for. */
const usedColorNames = (): string[] => {
  const descriptions = load(`packages/assets/data/${DESCRIPTIONS_VERSION}/descriptions.json`);
  const names = new Set<string>();
  for (const entries of Object.values(descriptions)) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      const color = (entry as { iconColor?: unknown }).iconColor;
      if (typeof color === 'string' && color) names.add(color);
    }
  }
  return [...names].sort();
};

describe('the glyph tint table', () => {
  it('has an entry for every colour name the bundle uses', () => {
    const missing = usedColorNames().filter((name) => !(name in ICON_COLORS));
    expect(missing).toEqual([]);
  });

  it('gives every entry a full-length hex', () => {
    for (const [name, hex] of Object.entries(ICON_COLORS)) {
      expect(hex, name).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('carries no entry the bundle never asks for', () => {
    // A stale name is dead weight and, worse, implies a coverage it does not
    // have. If a description refresh drops a colour, drop it here too.
    const used = new Set(usedColorNames());
    expect(Object.keys(ICON_COLORS).filter((name) => !used.has(name))).toEqual([]);
  });
});
