import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetIcons } from '../src/icons.js';
import '../src/workflow-render.js';
import type { WorkflowRender } from '../src/workflow-render.js';

const fixture = (name: string): Record<string, unknown> => {
	const path = [resolve(process.cwd(), `packages/core/test/fixtures/${name}.json`), resolve(process.cwd(), `../core/test/fixtures/${name}.json`)].find((p) => existsSync(p));
	if (!path) throw new Error(`fixture ${name} not found`);
	return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
};

/** A controllable prefers-color-scheme query. */
const stubScheme = (dark: boolean) => {
	const listeners = new Set<(e: { matches: boolean }) => void>();
	const mq = {
		matches: dark,
		media: '(prefers-color-scheme: dark)',
		addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
		removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
	};
	vi.spyOn(globalThis, 'matchMedia').mockImplementation(() => mq as unknown as MediaQueryList);
	return {
		listeners,
		set(next: boolean) {
			mq.matches = next;
			for (const fn of listeners) fn({ matches: next });
		},
	};
};

async function mount(attrs: Record<string, string> = {}): Promise<WorkflowRender> {
	const el = document.createElement('workflow-render') as WorkflowRender;
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	el.workflow = fixture('branching');
	document.body.append(el);
	await el.updateComplete;
	await el.ready;
	await el.updateComplete;
	return el;
}
const themeOf = (el: WorkflowRender): string | null | undefined => el.shadowRoot?.querySelector('svg.wr-root, svg')?.getAttribute('data-theme');

afterEach(() => {
	document.body.replaceChildren();
	resetIcons();
	vi.restoreAllMocks();
});

describe('theme attribute', () => {
	it('is light by default', async () => {
		const el = await mount();
		expect(el.theme).toBe('light');
		expect(themeOf(el)).toBe('light');
		expect(el.getAttribute('data-resolved-theme')).toBe('light');
	});

	it('draws dark with theme="dark"', async () => {
		const el = await mount({ theme: 'dark' });
		expect(themeOf(el)).toBe('dark');
		expect(el.getAttribute('data-resolved-theme')).toBe('dark');
	});

	it('follows the system setting with theme="auto", live, and stops listening when removed', async () => {
		const scheme = stubScheme(true);
		const el = await mount({ theme: 'auto' });
		expect(themeOf(el)).toBe('dark');
		scheme.set(false);
		await el.updateComplete; // the change schedules a redraw
		await el.ready;
		await el.updateComplete;
		expect(themeOf(el)).toBe('light');
		expect(scheme.listeners.size).toBe(1);
		el.remove();
		expect(scheme.listeners.size).toBe(0);
	});

	it('switches when the attribute changes after load', async () => {
		const el = await mount();
		el.setAttribute('theme', 'dark');
		await el.updateComplete;
		await el.ready;
		await el.updateComplete;
		expect(themeOf(el)).toBe('dark');
	});

	it('exports in the resolved theme', async () => {
		const el = await mount({ theme: 'dark' });
		expect(await el.exportSvg()).toContain('data-theme="dark"');
	});

	it('keeps no hard-coded colours in its own styles outside the theme token blocks', () => {
		const ctor = customElements.get('workflow-render') as unknown as { elementStyles: Array<{ cssText: string }> };
		const css = ctor.elementStyles.map((s) => s.cssText).join('\n');
		const outside = css.replace(/\/\* theme tokens \*\/[\s\S]*?\/\* end theme tokens \*\//g, '');
		expect(outside.match(/#[0-9a-f]{3,8}\b/gi) ?? []).toEqual([]);
		// rgb()/rgba() colours too, except the black backdrop and shadows, which are the same in both themes.
		const rgb = (outside.match(/rgba?\([^)]*\)/gi) ?? []).filter((c) => !/^rgba?\(0, 0, 0/.test(c));
		expect(rgb).toEqual([]);
	});
});
