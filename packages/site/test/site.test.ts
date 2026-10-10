import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DARK, ERROR_PANEL_DARK, NDV_CHROME_DARK, NDV_DARK, WARNING_PANEL_DARK } from 'workflow-render-core';
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
    <select id="theme"><option value="light">Light</option><option value="dark">Dark</option><option value="auto">Auto</option></select>
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

  it('defaults to light, and the theme select sets the canvas theme', () => {
    const canvas = setup();
    const select = document.getElementById('theme') as HTMLSelectElement;
    expect(select.value).toBe('light');
    expect(canvas.getAttribute('theme') ?? 'light').toBe('light');
    select.value = 'dark';
    select.dispatchEvent(new Event('change'));
    expect(canvas.getAttribute('theme')).toBe('dark');
  });

  it('tells you to load something before there is anything to embed', async () => {
    setup();
    await new Promise((r) => setTimeout(r, 0)); // the (empty) build settles
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
	// Slow asset fetches, as under a loaded test run: a fixed sleep is not enough.
	beforeEach(() => {
		vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((r) => setTimeout(() => r(new Response('{}')), 80)));
	});
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
	/** Wait for the embed build itself (copy hands out nothing while one is pending), not a guess at how long it takes. */
	const built = async (): Promise<void> => {
		const field = document.getElementById('embed-snippet') as HTMLTextAreaElement;
		for (let i = 0; i < 100 && !field.value.includes('self-contained'); i++) await new Promise((r) => setTimeout(r, 10));
	};
	const loaded = async (canvas: HTMLElement & { workflow?: unknown }): Promise<void> => {
		canvas.workflow = secretWorkflow;
		canvas.dispatchEvent(new CustomEvent('wr-load', { detail: { view: 'design', warnings: [] } }));
		await built();
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
		await built();
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
		// Slow asset fetches, as under a loaded test run: a fixed sleep is not enough.
		vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((r) => setTimeout(() => r(new Response('{}')), 80)));
		const canvas = setup() as HTMLElement & { workflow?: unknown };
		canvas.workflow = { something: 'else' };
		canvas.dispatchEvent(new CustomEvent('wr-load', { detail: { view: 'design', warnings: [] } }));
		// Wait for the build itself, not a guess at how long it takes.
		const note = (): string => document.getElementById('embed-redacted')?.textContent ?? '';
		for (let i = 0; i < 100 && !/not a workflow/.test(note()); i++) await new Promise((r) => setTimeout(r, 10));
		expect(note()).toMatch(/not a workflow/);
	});
});

describe('copy while a rebuild is pending', () => {
	it('never copies the previous build after the Redact box changed', async () => {
		const realFetch = globalThis.fetch;
		let delay = 0;
		globalThis.fetch = (() => new Promise((resolve) => { const w = delay; setTimeout(() => resolve(new Response('{}')), w); })) as typeof fetch;
		try {
			const canvas = setup() as HTMLElement & { workflow?: unknown };
			canvas.workflow = { id: 'wf-secret-id', nodes: [{ id: 'n', name: 'S', type: 't', typeVersion: 1, position: [0, 0], parameters: { text: 'ada@example.com' } }], connections: {} };
			const box = document.getElementById('embed-redact') as HTMLInputElement;
			box.checked = false;
			box.dispatchEvent(new Event('change'));
			await new Promise((r) => setTimeout(r, 50)); // the unredacted build is now the saved one
			delay = 100;
			box.checked = true;
			box.dispatchEvent(new Event('change')); // the redacted build is still running
			let text = 'not copied';
			Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t: string) => { text = t; } }, configurable: true });
			document.getElementById('copy-embed')?.dispatchEvent(new MouseEvent('click'));
			await new Promise((r) => setTimeout(r, 0));
			expect(text).not.toContain('ada@example.com');
		} finally {
			globalThis.fetch = realFetch;
		}
	});
});

describe('embed theme', () => {
  it('carries the chosen theme into the embed', async () => {
    // Slow asset fetches, as under a loaded test run: a fixed sleep is not enough.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((r) => setTimeout(() => r(new Response('{}')), 80)));
    const canvas = setup() as HTMLElement & { workflow?: unknown };
    canvas.workflow = { nodes: [], connections: {} };
    const select = document.getElementById('theme') as HTMLSelectElement;
    select.value = 'auto';
    select.dispatchEvent(new Event('change'));
    // Wait for the build itself, not a guess at how long it takes.
    const field = document.getElementById('embed-snippet') as HTMLTextAreaElement;
    for (let i = 0; i < 100 && !field.value.includes('self-contained'); i++) await new Promise((r) => setTimeout(r, 10));
    let text = '';
    Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText: async (t: string) => { text = t; } }, configurable: true });
    document.getElementById('copy-embed')?.dispatchEvent(new MouseEvent('click'));
    await new Promise((r) => setTimeout(r, 0));
    expect(text).toContain('<workflow-render theme="auto">');
  });
});

afterEach(() => vi.restoreAllMocks());

describe('page theme', () => {
  const css = readFileSync(resolve(__dirname, '../src/style.css'), 'utf8');
  /** The custom properties declared in the block that starts with `selector {`. */
  const block = (selector: string): Record<string, string> => {
    const start = css.indexOf(`${selector} {`);
    expect(start, `${selector} block`).toBeGreaterThanOrEqual(0);
    const body = css.slice(start, css.indexOf('}', start));
    return Object.fromEntries([...body.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2]?.trim()]));
  };
  const hex = (c: string): string => c.replace(/\s+/g, '').toLowerCase();

  it('dark page colours are n8n dark values the canvas already uses', () => {
    const dark = block(":root[data-theme='dark']");
    const light = block(':root');
    // Every light variable has a dark counterpart.
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    const expected: Record<string, string> = {
      '--fg': DARK.text,
      '--muted': DARK.textMuted,
      '--line': NDV_CHROME_DARK.inputBorder,
      '--line-hover': DARK.portBorder,
      '--accent': DARK.success,
      '--field': NDV_DARK.fieldBg,
      '--panel': 'rgba(43,43,43,0.94)', // DARK.nodeBg at the light panel's 94%
      '--error-bg': ERROR_PANEL_DARK.bg,
      '--error-border': ERROR_PANEL_DARK.border,
      '--error-text': ERROR_PANEL_DARK.text,
      '--warning-bg': WARNING_PANEL_DARK.bg,
      '--warning-border': WARNING_PANEL_DARK.border,
      '--warning-text': WARNING_PANEL_DARK.text,
    };
    for (const [name, value] of Object.entries(expected)) expect(hex(dark[name] ?? ''), name).toBe(hex(value));
    expect(DARK.nodeBg).toBe('#2b2b2b');
  });

  it('asks the browser for dark native controls (select, checkbox) in dark', () => {
    const start = css.indexOf(":root[data-theme='dark'] {");
    expect(css.slice(start, css.indexOf('}', start))).toMatch(/color-scheme:\s*dark;/);
  });

  it('keeps colours in the variable blocks', () => {
    // Outside :root blocks, only var() references and the shadow's black remain.
    const rest = css.replace(/:root[^{]*\{[^}]*\}/g, '');
    const colours = (rest.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi) ?? []).filter((c) => !/^rgba\(0, 0, 0, 0\.08\)$/.test(c));
    expect(colours).toEqual([]);
  });

  it("mirrors the canvas's resolved theme onto the page", async () => {
    // The element sets data-resolved-theme (light/dark, auto resolved); the page follows it.
    const canvas = setup();
    const html = document.documentElement;
    const settle = async (want: string): Promise<void> => {
      for (let i = 0; i < 100 && html.getAttribute('data-theme') !== want; i++) await new Promise((r) => setTimeout(r, 5));
    };
    expect(html.getAttribute('data-theme')).toBe('light');
    canvas.setAttribute('data-resolved-theme', 'dark');
    await settle('dark');
    expect(html.getAttribute('data-theme')).toBe('dark');
    canvas.setAttribute('data-resolved-theme', 'light');
    await settle('light');
    expect(html.getAttribute('data-theme')).toBe('light');
  });
});
