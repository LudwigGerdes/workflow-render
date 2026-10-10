/**
 * Redaction: mask what should not leave the machine before a workflow or an
 * execution is exported, embedded or published.
 *
 * Values are masked in place with a labelled placeholder so the structure stays
 * readable. Structural rules cover credential references, identifiers and
 * pinned or executed item data; string rules cover secret-named fields, token
 * shapes, emails, credentials inside URLs and caller patterns. The token, JWT
 * and Basic patterns and the secret header names follow integration-mock's
 * redact.ts.
 */
import { decodeExecution } from './adapters/n8n.js';

export type RedactKind =
	| 'credential'
	| 'identifier'
	| 'secret field'
	| 'token'
	| 'email'
	| 'url credentials'
	| 'data'
	| 'custom';

export interface RedactOptions {
	/** Extra patterns to mask wherever they match. */
	mask?: RegExp[];
	/** A string matching any of these is left alone (except credentials and identifiers). */
	keep?: RegExp[];
	/** Leave pinned and execution item values as they are (they are still pattern-scanned). */
	keepData?: boolean;
}

export interface RedactHit {
	kind: RedactKind;
	where: string;
}

export interface RedactReport {
	hits: RedactHit[];
	/** Hosts still present in URLs, sorted: what a reader would still learn. */
	hostsKept: string[];
	/** False when the input was neither a workflow nor an execution. */
	recognised: boolean;
}

const placeholder = (kind: RedactKind): string => `[redacted: ${kind}]`;
const PLACEHOLDER_RE = /\[redacted: [a-z ]+\]/g;
const isPlaceholder = (s: string): boolean => /^\[redacted: [a-z ]+\]$/.test(s);

/** A field or parameter name that holds a secret: it contains one of these words. */
const SECRET_KEY = /password|passwd|secret|api[-_]?key|token|authorization|cookie|private[-_]?key/i;
const isExpression = (s: string): boolean => s.startsWith('=') && s.includes('{{');

/** Opaque token as a whole value: a long unbroken run of token characters, optionally after `Bearer`. */
const WHOLE_TOKEN = /^(?:Bearer\s+)?[A-Za-z0-9_-]{20,}$/;
/** Token shapes found inside longer text. */
const INLINE_TOKENS: RegExp[] = [
	/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
	/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]{20,}=*/g,
	/\bBasic\s+[A-Za-z0-9+/]{8,}={0,2}/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	// Vendor key formats: Stripe, OpenAI, Slack, GitHub, GitLab, Google.
	/\b[rsp]k_(?:live|test)_[A-Za-z0-9]{8,}/g,
	/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/g,
	/\bxox[abprs]-[A-Za-z0-9-]{10,}/g,
	/\bgh[pousr]_[A-Za-z0-9]{20,}/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}/g,
	/\bglpat-[A-Za-z0-9_-]{20,}/g,
	/\bAIza[0-9A-Za-z_-]{35}/g,
];
/** `?api_key=…` and friends: the value of a secret-named query parameter. */
const QUERY_SECRET = /([?&][A-Za-z0-9_.-]*(?:password|passwd|secret|api[-_]?key|token|authorization|signature|sig)[A-Za-z0-9_.-]*=)([^&#\s"']+)/gi;
/** `"password": "…"` inside JSON text (a body or header field written as a string). */
const JSON_SECRET = /("[^"\\]*(?:password|passwd|secret|api[-_]?key|token|authorization|cookie|private[-_]?key)[^"\\]*"\s*:\s*")((?:[^"\\]|\\.)*)"/gi;
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)([^\s/@:]+(?::[^\s/@]*)?)@/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const URL_HOST = /\b[a-z][a-z0-9+.-]*:\/\/(?:(?:\[redacted: [a-z ]+\]|[^\s/@]*)@)?([A-Za-z0-9.-]+)/gi;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const global = (re: RegExp): RegExp => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

/** Node fields that are structure, not content: never scanned. */
const NODE_STRUCTURE = new Set(['id', 'name', 'type', 'typeVersion', 'position', 'disabled', 'onError', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'alwaysOutputData', 'executeOnce', 'color']);

class Redactor {
	readonly hits: RedactHit[] = [];
	private readonly hosts = new Set<string>();
	private readonly mask: RegExp[];
	private readonly keep: RegExp[];

	constructor(private readonly options: RedactOptions) {
		this.mask = (options.mask ?? []).map(global);
		this.keep = options.keep ?? [];
	}

	get keepData(): boolean {
		return this.options.keepData === true;
	}

	hit(kind: RedactKind, where: string): void {
		this.hits.push({ kind, where });
	}

	hostsKept(): string[] {
		return [...this.hosts].sort();
	}

	private kept(s: string): boolean {
		return this.keep.some((re) => new RegExp(re.source, re.flags.replace('g', '')).test(s));
	}

	/** Replace matches outside existing placeholders; returns the new string and how many were replaced. */
	private replaceOutside(s: string, re: RegExp, by: (m: string, ...groups: string[]) => string): [string, number] {
		let count = 0;
		const parts: string[] = [];
		let last = 0;
		for (const p of s.matchAll(PLACEHOLDER_RE)) {
			const before = s.slice(last, p.index);
			parts.push(before.replace(re, (m: string, ...rest: string[]) => (count++, by(m, ...rest))), p[0]);
			last = (p.index ?? 0) + p[0].length;
		}
		parts.push(s.slice(last).replace(re, (m: string, ...rest: string[]) => (count++, by(m, ...rest))));
		return [parts.join(''), count];
	}

	/** The string rules, applied to one string value. */
	string(s: string, where: string): string {
		if (isPlaceholder(s) || this.kept(s)) {
			this.collectHosts(s);
			return s;
		}
		if (WHOLE_TOKEN.test(s)) {
			this.hit('token', where);
			return placeholder('token');
		}
		let out = s;
		const apply = (re: RegExp, kind: RedactKind, by: (m: string, ...g: string[]) => string): void => {
			const [next, n] = this.replaceOutside(out, re, by);
			if (n > 0) this.hit(kind, where);
			out = next;
		};
		apply(JSON_SECRET, 'secret field', (_m, key) => `${key}${placeholder('secret field')}"`);
		apply(QUERY_SECRET, 'secret field', (_m, key) => `${key}${placeholder('secret field')}`);
		for (const re of INLINE_TOKENS) apply(re, 'token', () => placeholder('token'));
		apply(URL_CREDENTIALS, 'url credentials', (_m, scheme) => `${scheme}${placeholder('url credentials')}@`);
		apply(EMAIL, 'email', () => placeholder('email'));
		for (const re of this.mask) apply(re, 'custom', () => placeholder('custom'));
		this.collectHosts(out);
		return out;
	}

	private collectHosts(s: string): void {
		for (const m of s.matchAll(URL_HOST)) if (m[1]) this.hosts.add(m[1].toLowerCase());
	}

	/** Generic scan: secret-named keys, header entries, then string rules on every leaf. */
	scan(v: unknown, where: string): unknown {
		if (typeof v === 'string') return this.string(v, where);
		if (Array.isArray(v)) return v.map((x, i) => this.scan(x, `${where}[${i}]`));
		if (!isRecord(v)) return v;
		const secretEntry = typeof v['name'] === 'string' && SECRET_KEY.test(v['name']) && typeof v['value'] === 'string';
		const out: Record<string, unknown> = {};
		for (const [k, x] of Object.entries(v)) {
			const path = where ? `${where}.${k}` : k;
			if ((SECRET_KEY.test(k) || (secretEntry && k === 'value')) && !this.exemptSecret(x)) {
				out[k] = this.maskAll(x, 'secret field', path);
			} else {
				out[k] = this.scan(x, path);
			}
		}
		return out;
	}

	private exemptSecret(x: unknown): boolean {
		return typeof x === 'string' && (isExpression(x) || isPlaceholder(x) || this.kept(x));
	}

	/** Mask every leaf of a value as one kind, counting one hit. */
	maskAll(v: unknown, kind: RedactKind, where: string): unknown {
		let masked = false;
		const walk = (x: unknown): unknown => {
			if (x === null || x === undefined) return x;
			if (Array.isArray(x)) return x.map(walk);
			if (isRecord(x)) return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
			if (typeof x === 'string' && isPlaceholder(x)) return x;
			masked = true;
			return placeholder(kind);
		};
		const out = walk(v);
		if (masked) this.hit(kind, where);
		return out;
	}

	/** Pinned or executed item data: masked whole unless keepData, then only pattern-scanned. */
	data(v: unknown, where: string): unknown {
		return this.keepData ? this.scan(v, where) : this.maskAll(v, 'data', where);
	}

	identifier(v: unknown, where: string): unknown {
		if (typeof v !== 'string' && typeof v !== 'number') return v;
		if (typeof v === 'string' && isPlaceholder(v)) return v;
		this.hit('identifier', where);
		return placeholder('identifier');
	}
}

const isWorkflow = (v: unknown): v is Record<string, unknown> => isRecord(v) && Array.isArray(v['nodes']) && isRecord(v['connections']);

function redactNode(r: Redactor, n: unknown): unknown {
	if (!isRecord(n)) return r.scan(n, 'nodes');
	const name = typeof n['name'] === 'string' ? n['name'] : '?';
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(n)) {
		if (NODE_STRUCTURE.has(k)) out[k] = v;
		else if (k === 'webhookId') out[k] = r.identifier(v, `${name} › webhookId`);
		else if (k === 'credentials' && isRecord(v)) {
			out[k] = Object.fromEntries(
				Object.entries(v).map(([type, ref]) => {
					if (!isRecord(ref)) return [type, ref];
					let masked = false;
					const next = Object.fromEntries(
						Object.entries(ref).map(([f, x]) => {
							if ((f === 'id' || f === 'name') && !(typeof x === 'string' && isPlaceholder(x))) {
								masked = true;
								return [f, placeholder('credential')];
							}
							return [f, x];
						}),
					);
					if (masked) r.hit('credential', `${name} › credentials.${type}`);
					return [type, next];
				}),
			);
		} else out[k] = r.scan(v, `${name} › ${k}`);
	}
	return out;
}

/** Redact a workflow object (also used for an execution's workflowData). */
export function redactWorkflowObject(r: Redactor, w: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(w)) {
		if (k === 'nodes' && Array.isArray(v)) out[k] = v.map((n) => redactNode(r, n));
		else if (k === 'connections') out[k] = v;
		else if (k === 'id' || k === 'versionId') out[k] = r.identifier(v, k);
		else if (k === 'meta' && isRecord(v)) {
			out[k] = Object.fromEntries(
				Object.entries(v).map(([mk, mv]) => [mk, mk === 'instanceId' ? r.identifier(mv, 'meta.instanceId') : r.scan(mv, `meta.${mk}`)]),
			);
		} else if (k === 'pinData' && isRecord(v)) {
			out[k] = Object.fromEntries(Object.entries(v).map(([node, items]) => [node, r.data(items, `pinData › ${node}`)]));
		} else out[k] = r.scan(v, k);
	}
	return out;
}

const isExecution = (v: unknown): v is Record<string, unknown> => {
	if (!isRecord(v) || !isWorkflow(v['workflowData']) || !isRecord(v['data'])) return false;
	const rd = v['data']['resultData'];
	return isRecord(rd) && isRecord(rd['runData']);
};

function redactExecution(r: Redactor, e: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(e)) {
		if (k === 'workflowData' && isRecord(v)) out[k] = redactWorkflowObject(r, v);
		else if (k === 'id' || k === 'workflowId') out[k] = r.identifier(v, k);
		else if (k === 'data' && isRecord(v)) out[k] = redactExecutionData(r, v);
		else out[k] = r.scan(v, k);
	}
	return out;
}

function redactExecutionData(r: Redactor, d: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(d)) {
		if (k === 'resultData' && isRecord(v)) {
			out[k] = Object.fromEntries(
				Object.entries(v).map(([rk, rv]) => {
					if (rk !== 'runData' || !isRecord(rv)) return [rk, r.scan(rv, `resultData.${rk}`)];
					return [rk, Object.fromEntries(Object.entries(rv).map(([node, runs]) => [node, redactRuns(r, node, runs)]))];
				}),
			);
		} else if (k === 'executionData') out[k] = r.data(v, 'executionData');
		else out[k] = r.scan(v, k);
	}
	return out;
}

/** Each run keeps its timing and status; its item payloads (`data`) are data. */
function redactRuns(r: Redactor, node: string, runs: unknown): unknown {
	if (!Array.isArray(runs)) return r.scan(runs, `runData › ${node}`);
	return runs.map((run) => {
		if (!isRecord(run)) return run;
		return Object.fromEntries(
			Object.entries(run).map(([k, v]) => [k, k === 'data' || k === 'inputOverride' ? r.data(v, `runData › ${node}`) : r.scan(v, `runData › ${node} › ${k}`)]),
		);
	});
}

export function redactWorkflow(input: unknown, options: RedactOptions = {}): { json: unknown; report: RedactReport } {
	const r = new Redactor(options);
	let json: unknown;
	let recognised = true;
	const decoded = decodeExecution(input);
	if (isExecution(decoded)) json = redactExecution(r, decoded);
	else if (isWorkflow(decoded)) json = redactWorkflowObject(r, decoded);
	else { recognised = false; json = r.scan(decoded, ''); }
	return { json, report: { hits: r.hits, hostsKept: r.hostsKept(), recognised } };
}
