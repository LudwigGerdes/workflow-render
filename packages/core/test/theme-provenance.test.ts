import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	DARK,
	NDV_CHROME_DARK,
	NDV_PANE_DARK,
	NDV_PANE_LIGHT,
	ICON_COLORS,
	ICON_COLORS_DARK,
	ICON_COLOR_DEFAULT_DARK,
	LIGHT,
	NDV_DARK,
	NDV_LIGHT,
	SELECTION_RING_COLOR,
	SELECTION_RING_COLOR_DARK,
	STICKY_COLORS_DARK,
	STICKY_TEXT_IN_DARK_THEME,
} from '../src/constants.js';

const fixture = <T>(name: string): T => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
const measured = fixture<{
	canvas: Record<string, string>;
	sticky: Record<string, { bg: string; border: string }>;
	stickyText: string;
	ndv: Record<string, string>;
	ndvChrome: Record<string, string>;
	ndvPane: Record<string, string>;
}>('n8n-2.38.3-dark-measured.json');
const tokens = fixture<{ tokens: Record<string, { light: string; dark: string }> }>('n8n-2.38.3-tokens.json').tokens;
const norm = (c: string): string => c.toLowerCase().replace(/\s+/g, '').replace(/,0\.(\d)0\)$/, ',0.$1)');

describe('dark palette provenance', () => {
	it('every canvas token is the value measured from n8n 2.38.3 in dark mode', () => {
		for (const key of Object.keys(LIGHT) as Array<keyof typeof LIGHT>) {
			expect(measured.canvas[key], `no measurement for ${key}`).toBeDefined();
			expect(norm(DARK[key]), key).toBe(norm(measured.canvas[key] ?? ''));
		}
	});

	it('sticky colours are the measured dark presets', () => {
		for (const [i, c] of Object.entries(measured.sticky)) expect(STICKY_COLORS_DARK[Number(i)]).toEqual(c);
		expect(STICKY_TEXT_IN_DARK_THEME).toBe(measured.stickyText);
	});

	it('inspector colours are measured, or come from a token whose light value is ours', () => {
		for (const key of ['panelBg', 'inputPanelBg', 'fieldBg', 'label', 'fieldLabel', 'text'] as const) {
			expect(NDV_DARK[key], key).toBe(measured.ndv[key]);
		}
		const fromToken: Array<[keyof typeof NDV_LIGHT, string]> = [
			['muted', '--color--text--tint-1'],
			['expressionBg', '--expression-editor--resolvable--color--background--pending'],
			['expressionBorder', '--color--foreground'],
		];
		for (const [key, token] of fromToken) {
			expect(norm(tokens[token]?.light ?? ''), `${token} light`).toBe(norm(NDV_LIGHT[key]));
			expect(norm(NDV_DARK[key]), key).toBe(norm(tokens[token]?.dark ?? ''));
		}
	});

	it('the selection ring follows --canvas--color--selected-transparent', () => {
		const t = tokens['--canvas--color--selected-transparent'];
		expect(norm(t?.light ?? '')).toBe(norm(SELECTION_RING_COLOR));
		expect(norm(SELECTION_RING_COLOR_DARK)).toBe(norm(t?.dark ?? ''));
	});

	it('icon tints follow --node--icon--color--<name>, light matching ours exactly', () => {
		for (const [name, ours] of Object.entries(ICON_COLORS)) {
			const t = tokens[`--node--icon--color--${name}`];
			expect(t?.light, name).toBe(ours);
			expect(ICON_COLORS_DARK[name], name).toBe(t?.dark);
		}
		expect(ICON_COLOR_DEFAULT_DARK).toBe('#ffffff'); // measured: an untinted glyph in dark mode
	});

	it('inspector controls are the measured dark values', () => {
		for (const [key, value] of Object.entries(measured.ndvChrome)) {
			expect(norm(NDV_CHROME_DARK[key as keyof typeof NDV_CHROME_DARK]), key).toBe(norm(value));
		}
	});

	it('pane chips, count and icons are the measured dark values', () => {
		for (const [key, value] of Object.entries(measured.ndvPane)) {
			expect(NDV_PANE_DARK[key as keyof typeof NDV_PANE_DARK], key).toBe(value);
		}
		expect(norm(NDV_PANE_LIGHT.chipBorder)).toBe(norm('rgb(240, 240, 240)'));
	});
});
