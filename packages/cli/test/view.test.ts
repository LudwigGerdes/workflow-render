import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { serve, type ViewServer } from '../src/view.js';

const fixture = (name: string): string =>
  [
    resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`),
    resolve(process.cwd(), `../core/test/fixtures/${name}.json`),
  ].find(existsSync) as string;

let server: ViewServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe('view server', () => {
  it('serves the page, the workflow and the bundle from one origin', async () => {
    server = await serve(fixture('linear'));
    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<workflow-render');

    const workflow = await fetch(new URL('workflow.json', server.url));
    expect(((await workflow.json()) as { nodes: unknown[] }).nodes).toHaveLength(4);

    expect((await fetch(new URL('workflow-render.js', server.url))).status).toBe(200);
  });

  it('serves nothing outside the bundle directory', async () => {
    server = await serve(fixture('linear'));
    expect((await fetch(new URL('nope.js', server.url))).status).toBe(404);
    expect((await fetch(new URL('../../package.json', server.url))).status).toBe(404);
  });

  it('fails fast on an unreadable file', async () => {
    await expect(serve('/does/not/exist.json')).rejects.toThrow();
  });
});
