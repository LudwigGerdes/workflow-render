import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { renderToSVG } from '../src/core.js';
import { packageVersion, renderFile } from '../src/index.js';

const fixture = resolve(__dirname, '../../core/test/fixtures/order-intake.json');

describe('renderToSVG (workflow-render/core)', () => {
  it('renders parsed JSON to the same bytes the CLI writes', async () => {
    const json: unknown = JSON.parse(readFileSync(fixture, 'utf8'));
    const { svg, warnings } = await renderToSVG(json);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(warnings).toEqual([]);
    expect(svg).toBe((await renderFile(fixture)).svg);
  });

  it('draws real icons and embeds the fonts by default', async () => {
    const { svg } = await renderToSVG(JSON.parse(readFileSync(fixture, 'utf8')));
    expect(svg).not.toContain('class="wr-monogram"');
    expect(svg).toContain('font/woff2');
  });

  it('leaves the fonts out when asked, and falls back to initials when given no icons', async () => {
    const { svg } = await renderToSVG(JSON.parse(readFileSync(fixture, 'utf8')), { embedFonts: false, icons: {} });
    expect(svg).not.toContain('font/woff2');
    expect(svg).toContain('class="wr-monogram"');
  });

  describe('provenance stamp', () => {
    const load = (): Record<string, unknown> => JSON.parse(readFileSync(fixture, 'utf8')) as Record<string, unknown>;
    const root = (svg: string): string => svg.match(/^<svg\b[^>]*>/)?.[0] ?? '';

    it('carries the tool version and a hash of the input', async () => {
      const { svg } = await renderToSVG(load());
      expect(root(svg)).toContain(`data-tool-name="workflow-render"`);
      expect(root(svg)).toContain(`data-tool-version="${packageVersion()}"`);
      expect(root(svg)).toMatch(/data-input-hash="sha256:[0-9a-f]{16}"/);
    });

    it('carries the workflow id, name and versionId when the export has them', async () => {
      const json = { ...load(), id: 'wf_abc', versionId: 'ver_123' };
      const { svg } = await renderToSVG(json);
      expect(root(svg)).toContain('data-workflow-id="wf_abc"');
      expect(root(svg)).toContain('data-workflow-name="Order intake"');
      expect(root(svg)).toContain('data-workflow-version-id="ver_123"');
    });

    it('reads the identity from workflowData for an execution', async () => {
      const execution = resolve(__dirname, '../../core/test/fixtures/execution-success.json');
      const json = JSON.parse(readFileSync(execution, 'utf8')) as Record<string, unknown>;
      const workflowData = json['workflowData'] as Record<string, unknown>;
      json['workflowData'] = { ...workflowData, versionId: 'ver_exec' };
      const { svg } = await renderToSVG(json);
      expect(root(svg)).toContain('data-workflow-name="Execution Success"');
      expect(root(svg)).toContain('data-workflow-version-id="ver_exec"');
    });

    it('hashes the canonical input: key order does not matter, content does', async () => {
      const a = load();
      const b = Object.fromEntries(Object.entries(a).reverse());
      const hashOf = async (json: unknown): Promise<string> =>
        root((await renderToSVG(json)).svg).match(/data-input-hash="([^"]+)"/)?.[1] ?? '';
      expect(await hashOf(a)).toBe(await hashOf(b));
      expect(await hashOf({ ...a, name: 'Renamed' })).not.toBe(await hashOf(a));
    });

    it('is byte-identical across two renders', async () => {
      const [first, second] = await Promise.all([renderToSVG(load()), renderToSVG(load())]);
      expect(first.svg).toBe(second.svg);
    });

    it('never writes meta.instanceId into the SVG', async () => {
      const instanceId = 'deadbeefcafe0000instance';
      const json = { ...load(), meta: { instanceId, templateCredsSetupCompleted: true } };
      const { svg } = await renderToSVG(json);
      expect(svg).not.toContain(instanceId);
      expect(svg).not.toMatch(/data-[a-z-]*instance/);
    });

    it('lets a caller override the computed provenance', async () => {
      const { svg } = await renderToSVG(load(), { provenance: { tool: { name: 'my-tool', version: '1.0.0' } } });
      expect(root(svg)).toContain('data-tool-name="my-tool"');
      expect(root(svg)).toMatch(/data-input-hash="sha256:[0-9a-f]{16}"/);
    });
  });

  it('rejects input that is not a workflow', async () => {
    await expect(renderToSVG({ hello: 'world' })).rejects.toThrow();
  });
});
