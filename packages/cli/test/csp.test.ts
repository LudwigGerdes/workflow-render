import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = resolve(process.cwd(), process.cwd().endsWith('packages/cli') ? '../element/src' : 'packages/element/src');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });

/**
 * A strict Content-Security-Policy refuses inline `style` attributes unless
 * the page adds 'unsafe-inline'. Lit's `styleMap` and `element.style.x = …`
 * go through the CSSOM, which CSP allows, so those are the only ways the
 * element may set a style. This scan keeps a `style="…"` template binding
 * from creeping back in.
 */
describe('the element under a Content-Security-Policy', () => {
  it('never renders a literal style attribute', () => {
    const scanned = files(src);
    expect(scanned.length).toBeGreaterThan(5);
    for (const file of scanned) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toMatch(/\sstyle="/);
      expect(text, file).not.toMatch(/setAttribute\(\s*['"]style['"]/);
    }
  });
});
