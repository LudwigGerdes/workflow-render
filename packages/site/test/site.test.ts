import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initSite } from '../src/main.js';

const root = (...parts: string[]): string =>
  [resolve(process.cwd(), 'packages/site', ...parts), resolve(process.cwd(), ...parts)].find(
    (candidate) => existsSync(candidate),
  ) ?? resolve(process.cwd(), 'packages/site', ...parts);

/** The page markup the tests drive, kept in step with index.html. */
const PAGE = `
  <div id="messages"></div>
  <div id="dropzone"><textarea id="paste"></textarea></div>
  <button id="load"></button>
  <button data-example="linear.json"></button>
  <section class="widget" id="w-load">
    <button class="widget-toggle" data-target="load-body" aria-expanded="true"></button>
    <div class="widget-body" id="load-body"></div>
  </section>
  <section class="widget" id="w-embed">
    <textarea id="embed-snippet"></textarea>
    <button id="copy-embed"></button>
    <button id="download-embed"></button>
    <span id="embed-size"></span>
  </section>
  <workflow-render id="canvas"></workflow-render>
  <span id="emulates"></span>
`;

const setup = (search = ''): HTMLElement => {
  document.body.replaceChildren();
  document.body.innerHTML = PAGE; // fixed markup, no user input
  initSite(search);
  return document.getElementById('canvas') as HTMLElement;
};

describe('wiring', () => {
  it('points the canvas at ?src=', () => {
    const canvas = setup('?src=/workflows/foo.json');
    expect(canvas.getAttribute('src')).toBe('/workflows/foo.json');
  });

  it('leaves src alone when the query has none', () => {
    expect(setup('').getAttribute('src')).toBeNull();
  });

  it('loads pasted JSON onto the canvas', () => {
    const canvas = setup() as HTMLElement & { workflow?: unknown };
    const paste = document.getElementById('paste') as HTMLTextAreaElement;
    paste.value = JSON.stringify({ nodes: [], connections: {} });
    document.getElementById('load')?.dispatchEvent(new MouseEvent('click'));
    expect(canvas.workflow).toEqual({ nodes: [], connections: {} });
  });

  it('reports invalid pasted JSON without throwing', () => {
    setup();
    const paste = document.getElementById('paste') as HTMLTextAreaElement;
    paste.value = '{ not json';
    document.getElementById('load')?.dispatchEvent(new MouseEvent('click'));
    expect(document.getElementById('messages')?.textContent).toContain('not valid JSON');
  });

  it('loads an example by relative path', () => {
    const canvas = setup();
    document.querySelector('[data-example]')?.dispatchEvent(new MouseEvent('click'));
    expect(canvas.getAttribute('src')).toBe('./examples/linear.json');
  });

  it('offers one theme, and it is light', () => {
    // Light only to start: there is no toggle to leave the canvas in a theme
    // the palette was never checked against.
    const canvas = setup();
    expect(document.getElementById('theme')).toBeNull();
    expect(canvas.getAttribute('theme')).not.toBe('dark');
  });

  it('tells you to load something before there is anything to embed', () => {
    setup();
    const snippet = (document.getElementById('embed-snippet') as HTMLTextAreaElement).value;
    // The embed inlines the workflow, so there is nothing to build without one.
    expect(snippet === '' || snippet.includes('Load a workflow')).toBe(true);
  });

  it('steps the widgets aside once the pointer settles, and brings them back', () => {
    setup();
    // The canvas is the page; the chrome should not sit on top of it forever.
    document.body.classList.add('is-idle');
    globalThis.dispatchEvent(new Event('pointermove'));
    expect(document.body.classList.contains('is-idle')).toBe(false);
  });

  it('collapses a widget from its header', () => {
    setup();
    const toggle = document.querySelector('.widget-toggle') as HTMLButtonElement;
    const body = document.getElementById('load-body') as HTMLElement;
    expect(body.hidden).toBe(false);
    toggle.dispatchEvent(new MouseEvent('click'));
    expect(body.hidden).toBe(true);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('shows warnings and errors from the canvas events', () => {
    const canvas = setup();
    canvas.dispatchEvent(
      new CustomEvent('wr-load', { detail: { view: 'design', warnings: ['dropped a connection'] } }),
    );
    expect(document.getElementById('messages')?.textContent).toContain('dropped a connection');
    canvas.dispatchEvent(new CustomEvent('wr-error', { detail: { message: 'could not load' } }));
    const text = document.getElementById('messages')?.textContent ?? '';
    expect(text).toContain('could not load');
    expect(text).not.toContain('dropped a connection');
  });
});

describe('build output', () => {
  const dist = root('dist');

  it('is a self-contained static bundle', () => {
    if (!existsSync(dist)) expect.fail('build the site first: pnpm --filter workflow-render-site build');
    expect(existsSync(resolve(dist, 'index.html'))).toBe(true);
    expect(existsSync(resolve(dist, 'workflow-render.js'))).toBe(true);
    expect(existsSync(resolve(dist, 'workflow-render-icons.json'))).toBe(true);
    for (const example of ['linear.json', 'branching.json', 'execution-success.json']) {
      expect(existsSync(resolve(dist, 'examples', example)), example).toBe(true);
    }
    const scripts = readdirSync(resolve(dist, 'assets')).filter((f) => f.endsWith('.js'));
    expect(scripts).toHaveLength(1);
  });

  it('references nothing off-host', () => {
    if (!existsSync(dist)) expect.fail('build the site first');
    const files = [
      resolve(dist, 'index.html'),
      ...readdirSync(resolve(dist, 'assets')).map((f) => resolve(dist, 'assets', f)),
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      const external = [...text.matchAll(/https?:\/\/[^"'\s)]+/g)]
        .map((match) => match[0])
        .filter((url) => !url.startsWith('http://www.w3.org/')); // SVG/XML namespaces
      expect(external, `${file} must not reference external hosts`).toEqual([]);
    }
  });
});

describe('idle chrome stays findable', () => {
  it('dims the widgets rather than erasing them', () => {
    const css = readFileSync(root('src/style.css'), 'utf8');
    const idle = /body\.is-idle \.widget \{[^}]*\}/.exec(css)?.[0] ?? '';
    // Fully hidden means a first-time reader never learns the controls exist.
    expect(idle).not.toMatch(/opacity:\s*0\s*[;}]/);
    expect(idle).not.toContain('pointer-events: none');
  });
});
