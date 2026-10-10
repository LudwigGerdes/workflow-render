/**
 * Resolve n8n design-system tokens to concrete colours, in both themes.
 *
 * Dev-time only. Reads the SCSS sources of an n8n checkout and writes, for the
 * custom properties asked for, the value a browser computes on `body` under
 * `[data-theme='light']` and `[data-theme='dark']`.
 *
 * It follows the cascade the way a browser does: the light theme and the
 * primitives are declared on `:root` and resolve there; the dark theme
 * re-declares some tokens on the themed element, and only those re-resolve
 * against dark values. A token the dark theme does not re-declare keeps its
 * light-resolved value, even when it refers to one the dark theme changes.
 *
 *   node packages/core/scripts/n8n-tokens.ts <design-system css dir> <out.json> --prop --canvas--color--background …
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Decls = Map<string, string>;

/** The declarations of one `@mixin`, in order, with `@include`d mixins expanded in place. */
function mixin(sources: string, name: string, all: Record<string, string>): Decls {
	const body = all[name];
	if (body === undefined) throw new Error(`no @mixin ${name}`);
	const out: Decls = new Map();
	for (const raw of body.split(';')) {
		const line = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
		const inc = /^@include\s+(?:[\w-]+\.)?([\w-]+)\s*$/.exec(line);
		if (inc?.[1] !== undefined) {
			for (const [k, v] of mixin(sources, inc[1], all)) out.set(k, v);
			continue;
		}
		const decl = /^(--[\w-]+)\s*:\s*([\s\S]+)$/.exec(line);
		if (decl?.[1] !== undefined && decl[2] !== undefined) out.set(decl[1], decl[2].replace(/\s+/g, ' ').trim());
	}
	return out;
}

/** Every `@mixin name { … }` body in the given text, by name. */
function mixins(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	const re = /@mixin\s+([\w-]+)\s*\{/g;
	for (let m = re.exec(text); m; m = re.exec(text)) {
		let depth = 1;
		let i = re.lastIndex;
		for (; i < text.length && depth > 0; i++) {
			if (text[i] === '{') depth++;
			else if (text[i] === '}') depth--;
		}
		out[m[1] ?? ''] = text.slice(re.lastIndex, i - 1);
	}
	return out;
}

/** Split a CSS argument list on top-level commas. */
function args(s: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let cur = '';
	for (const ch of s) {
		if (ch === '(') depth++;
		if (ch === ')') depth--;
		if (ch === ',' && depth === 0) {
			out.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	out.push(cur.trim());
	return out;
}

const clamp = (x: number): number => Math.min(1, Math.max(0, x));
const gamma = (x: number): number => (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const hex2 = (x: number): string => Math.round(clamp(x) * 255).toString(16).padStart(2, '0');

interface Rgba {
	r: number;
	g: number;
	b: number;
	a: number;
}

/** OKLCH (L 0..1) to sRGB, per Björn Ottosson's reference matrices. */
function oklch(L: number, C: number, H: number): Rgba {
	const h = (H * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return {
		r: gamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_),
		g: gamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_),
		b: gamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_),
		a: 1,
	};
}

function hsl(h: number, s: number, l: number): Rgba {
	const k = (n: number): number => (n + h / 30) % 12;
	const f = (n: number): number => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
	return { r: f(0), g: f(8), b: f(4), a: 1 };
}

const num = (s: string): number => (s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s));

export function format(c: Rgba): string {
	const rgb = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
	return c.a >= 1 ? rgb : `rgba(${Math.round(clamp(c.r) * 255)},${Math.round(clamp(c.g) * 255)},${Math.round(clamp(c.b) * 255)},${Number(c.a.toFixed(3))})`;
}

function parseColor(v: string): Rgba | undefined {
	const s = v.trim();
	let m = /^#([0-9a-f]{3,8})$/i.exec(s);
	if (m?.[1]) {
		let h = m[1];
		if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
		const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255;
		return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
	}
	m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?))?\s*\)$/i.exec(s);
	if (m) {
		const c = oklch(num(m[1] ?? '0') > 1 ? num(m[1] ?? '0') / 100 : num(m[1] ?? '0'), Number(m[2]), Number(m[3]));
		return { ...c, a: m[4] === undefined ? 1 : num(m[4]) };
	}
	m = /^hsla?\(\s*([\d.]+)\s*,?\s*([\d.]+)%\s*,?\s*([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
	if (m) return { ...hsl(Number(m[1]), Number(m[2]) / 100, Number(m[3]) / 100), a: m[4] === undefined ? 1 : num(m[4]) };
	m = /^rgba?\(\s*([\d.]+)\s*,?\s*([\d.]+)\s*,?\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i.exec(s);
	if (m) return { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255, a: m[4] === undefined ? 1 : num(m[4]) };
	if (s === 'white') return { r: 1, g: 1, b: 1, a: 1 };
	if (s === 'black') return { r: 0, g: 0, b: 0, a: 1 };
	if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
	return undefined;
}

/** Evaluate a declaration's value, looking variables up through `lookup`. */
function evaluate(value: string, lookup: (name: string) => string | undefined, theme: 'light' | 'dark'): string | undefined {
	const v = value.trim();
	let m = /^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(v);
	if (m?.[1]) {
		const found = lookup(m[1]);
		if (found !== undefined) return found;
		return m[2] === undefined ? undefined : evaluate(m[2], lookup, theme);
	}
	m = /^light-dark\(([\s\S]+)\)$/.exec(v);
	if (m?.[1]) {
		const [light, dark] = args(m[1]);
		return evaluate((theme === 'light' ? light : dark) ?? '', lookup, theme);
	}
	m = /^oklch\(\s*from\s+(var\([^)]*\)|#[0-9a-f]+)\s+l\s+c\s+h\s*\/\s*([\d.]+%?)\s*\)$/i.exec(v);
	if (m?.[1]) {
		const base = evaluate(m[1], lookup, theme);
		const c = base === undefined ? undefined : parseColor(base);
		return c === undefined ? undefined : format({ ...c, a: num(m[2] ?? '1') });
	}
	const c = parseColor(v);
	return c === undefined ? undefined : format(c);
}

export function resolveTokens(cssDir: string): { light: Map<string, string | undefined>; dark: Map<string, string | undefined>; raw: { light: Decls; dark: Decls } } {
	const text = ['_primitives.scss', '_tokens.legacy.scss', '_tokens.scss'].map((f) => readFileSync(join(cssDir, f), 'utf8')).join('\n');
	const all = mixins(text);
	const root: Decls = new Map([...mixin(text, 'primitives', all), ...mixin(text, 'theme', all)]);
	const darkDecls = mixin(text, 'theme-dark', all);

	const light = new Map<string, string | undefined>();
	const lightOf = (name: string, seen = new Set<string>()): string | undefined => {
		if (light.has(name)) return light.get(name);
		const d = root.get(name);
		if (d === undefined || seen.has(name)) return undefined;
		seen.add(name);
		const r = evaluate(d, (n) => lightOf(n, seen), 'light');
		light.set(name, r);
		return r;
	};
	const dark = new Map<string, string | undefined>();
	const darkOf = (name: string, seen = new Set<string>()): string | undefined => {
		if (dark.has(name)) return dark.get(name);
		const d = darkDecls.get(name);
		if (d === undefined) {
			// Inherited from :root, where it was resolved against light values.
			const inherited = lightOf(name);
			dark.set(name, inherited);
			return inherited;
		}
		if (seen.has(name)) return undefined;
		seen.add(name);
		const r = evaluate(d, (n) => darkOf(n, seen), 'dark');
		dark.set(name, r);
		return r;
	};
	for (const k of [...root.keys(), ...darkDecls.keys()]) {
		lightOf(k);
		darkOf(k);
	}
	return { light, dark, raw: { light: root, dark: darkDecls } };
}

const isMain = process.argv[1]?.endsWith('n8n-tokens.ts') === true;
if (isMain) {
	const [dir, outFile, ...rest] = process.argv.slice(2);
	if (dir === undefined || outFile === undefined) throw new Error('usage: n8n-tokens.ts <css dir> <out.json> [--prop name]…');
	const props = rest.filter((x) => x !== '--prop');
	const { light, dark } = resolveTokens(dir);
	const out: Record<string, { light: string | null; dark: string | null }> = {};
	for (const p of props) out[p] = { light: light.get(p) ?? null, dark: dark.get(p) ?? null };
	writeFileSync(outFile, `${JSON.stringify({ n8n: 'n8n@2.38.3 (3a77307e04)', tokens: out }, null, '\t')}\n`);
}
