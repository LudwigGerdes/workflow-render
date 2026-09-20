import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMULATED_VERSION } from 'workflow-render-assets';
import { describe, expect, it } from 'vitest';
import { DESCRIPTIONS_VERSION } from '../src/constants.js';

/**
 * One pin, three readers. The version the assets package serves, the version
 * core stamps onto every SVG and the version recorded by the extractor must
 * be the same string, or an export claims a bundle it did not render with.
 */
describe('the pinned n8n version', () => {
  it('is the same constant in core and assets', () => {
    expect(DESCRIPTIONS_VERSION).toBe(EMULATED_VERSION);
  });

  it('names the bundle that is actually committed', () => {
    const meta = JSON.parse(
      readFileSync(resolve(__dirname, `../../assets/data/${EMULATED_VERSION}/meta.json`), 'utf8'),
    ) as { n8nVersion: string };
    expect(meta.n8nVersion).toBe(EMULATED_VERSION);
  });
});
