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
    <input type="checkbox" id="embed-redact" checked>
    <span id="embed-redacted"></span>
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

describe('embed redaction', () => {
	const secretWorkflow = {
		id: 'wf-secret-id',
		nodes: [{ id: 'n', name: 'S', type: 'n8n-nodes-base.set', typeVersion: 3, position: [0, 0], parameters: { text: 'ada@example.com' } }],
		connections: {},
	};
	const copied = async (): Promise<string> => {
		let text = '';
		Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t: string) => { text = t; } }, configurable: true });
		document.getElementById('copy-embed')?.dispatchEvent(new MouseEvent('click'));
		await new Promise((r) => setTimeout(r, 0));
		return text;
	};
	const loaded = async (canvas: HTMLElement & { workflow?: unknown }): Promise<void> => {
		canvas.workflow = secretWorkflow;
		canvas.dispatchEvent(new CustomEvent('wr-load', { detail: { view: 'design', warnings: [] } }));
		await new Promise((r) => setTimeout(r, 20));
	};

	it('masks the shared embed by default, and says how much', async () => {
		const canvas = setup() as HTMLElement & { workflow?: unknown };
		expect((document.getElementById('embed-redact') as HTMLInputElement).checked).toBe(true);
		await loaded(canvas);
		const text = await copied();
		expect(text).not.toContain('ada@example.com');
		expect(text).not.toContain('wf-secret-id');
		expect(document.getElementById('embed-redacted')?.textContent).toMatch(/2 values masked/);
		expect(canvas.workflow).toEqual(secretWorkflow);
	});

	it('shares the raw workflow when unchecked', async () => {
		const canvas = setup() as HTMLElement & { workflow?: unknown };
		await loaded(canvas);
		const box = document.getElementById('embed-redact') as HTMLInputElement;
		box.checked = false;
		box.dispatchEvent(new Event('change'));
		await new Promise((r) => setTimeout(r, 20));
		expect(await copied()).toContain('ada@example.com');
	});
});

describe('embed redaction race', () => {
	it('a slow earlier build never replaces a newer redacted one', async () => {
		const realFetch = globalThis.fetch;
		let delay = 0;
		globalThis.fetch = ((..._args: unknown[]) =>
			new Promise((resolve) => {
				const wait = delay;
				setTimeout(() => resolve(new Response('{}')), wait);
			})) as typeof fetch;
		try {
			const canvas = setup() as HTMLElement & { workflow?: unknown };
			canvas.workflow = { id: 'wf-secret-id', nodes: [{ id: 'n', name: 'S', type: 't', typeVersion: 1, position: [0, 0], parameters: { text: 'ada@example.com' } }], connections: {} };
			const box = document.getElementById('embed-redact') as HTMLInputElement;
			delay = 80; // the unredacted build is slow
			box.checked = false;
			box.dispatchEvent(new Event('change'));
			await new Promise((r) => setTimeout(r, 5)); // that build has read the box and started fetching
			delay = 0; // the redacted build is fast
			box.checked = true;
			box.dispatchEvent(new Event('change'));
			await new Promise((r) => setTimeout(r, 200));
			let text = '';
			Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t: string) => { text = t; } }, configurable: true });
			document.getElementById('copy-embed')?.dispatchEvent(new MouseEvent('click'));
			await new Promise((r) => setTimeout(r, 0));
			expect(text).not.toContain('ada@example.com');
			expect(text).not.toContain('wf-secret-id');
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});

describe('embed redaction on unrecognised input', () => {
	it('says only the text patterns were applied', async () => {
		const canvas = setup() as HTMLElement & { workflow?: unknown };
		canvas.workflow = { something: 'else' };
		canvas.dispatchEvent(new CustomEvent('wr-load', { detail: { view: 'design', warnings: [] } }));
		await new Promise((r) => setTimeout(r, 30));
		expect(document.getElementById('embed-redacted')?.textContent).toMatch(/not a workflow/);
	});
});
