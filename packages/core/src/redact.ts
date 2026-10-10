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
/**
 * An n8n expression that only references a value (`={{ $env.KEY }}`): it is all
 * expression, with no literal text before or around it and no quoted text that
 * could be the secret itself.
 */
const isReferenceExpression = (s: string): boolean => s.startsWith('={{') && s.trimEnd().endsWith('}}') && !/["'`]/.test(s);

/**
 * Opaque token as a whole value: a long unbroken run of token characters with at
 * least one digit, optionally after `Bearer`. The digit keeps option values such
 * as `genericCredentialType` or `HARM_CATEGORY_HATE_SPEECH` readable.
 */
const WHOLE_TOKEN = /^(?:Bearer\s+)?(?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{20,}$/i;
/** Token shapes found inside longer text. */
const INLINE_TOKENS: RegExp[] = [
	/-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----[\s\S]{0,16384}?-----END [A-Z ]{0,40}PRIVATE KEY-----/g,
	/\beyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}/g,
	/\bBearer\s+[A-Za-z0-9._~+/-]{20,4096}=*/gi,
	/\bBasic\s+[A-Za-z0-9+/]{8,4096}={0,2}/gi,
	/\bAKIA[0-9A-Z]{16}\b/g,
	// Vendor key formats: Stripe, OpenAI, Slack, GitHub, GitLab, Google.
	/\b[rsp]k_(?:live|test)_[A-Za-z0-9]{8,256}/g,
	/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,256}/g,
	/\bxox[abprs]-[A-Za-z0-9-]{10,256}/g,
	/\bgh[pousr]_[A-Za-z0-9]{20,256}/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,256}/g,
	/\bglpat-[A-Za-z0-9_-]{20,256}/g,
	/\bAIza[0-9A-Za-z_-]{35}/g,
	/\bSG\.[A-Za-z0-9_-]{16,32}\.[A-Za-z0-9_-]{30,64}/g,
	// Secrets that live in URL paths: Slack incoming webhooks, Discord webhooks, Telegram bot tokens.
	/(?<=hooks\.slack\.com\/services\/)[A-Za-z0-9/]{10,200}/gi,
	/(?<=discord(?:app)?\.com\/api\/webhooks\/)\d{5,25}\/[A-Za-z0-9_-]{20,128}/gi,
	/\bbot\d{6,12}:[A-Za-z0-9_-]{30,64}/g,
];
/** A long path segment with a digit inside a URL (webhook ids, signed paths): `/7d1c2f0a-…`. */
const PATH_SECRET = /(?<=\b[a-z][a-z0-9+.-]{0,30}:\/\/[^\s"'<>]{0,2048})\/(?=[A-Za-z_-]{0,256}\d)[A-Za-z0-9_-]{24,256}(?=[/?#\s"'<>]|$)/gi;
/**
 * `key=value` or `key: value` where the key is secret-named, in any text: query
 * strings and form bodies (`?api_key=…`, `client_secret=…&…`), connection strings
 * (`;Password=…;`), `.env` lines, object literals (`'x-api-key': '…'`) and YAML.
 */
const ASSIGN_SECRET =
	/((?:^|[\s{,;?&(])['"]?[A-Za-z0-9_.-]{0,64}(?:password|passwd|pwd|secret|api[-_]?key|token|authorization|signature|sig(?=['"]?\s*=)|private[-_]?key)[A-Za-z0-9_.-]{0,64}['"]?\s*[:=]\s*['"]?)([^\s'",;&}#]+)/gim;
/** `"password": "…"` inside JSON text (a body or header field written as a string). */
const JSON_SECRET = /("[^"\\]{0,64}(?:password|passwd|secret|api[-_]?key|token|authorization|cookie|private[-_]?key)[^"\\]{0,64}"\s*:\s*")((?:[^"\\]|\\.)*)"/gi;
/** Every run below is bounded: an unbounded run lets a long hostile string take quadratic time. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]{0,30}:\/\/)([^\s/@:]{1,256}(?::[^\s/@]{0,256})?)@/gi;
const EMAIL = /[A-Za-z0-9._%+-]{1,64}@(?:[A-Za-z0-9-]{1,63}\.){1,10}[A-Za-z]{2,24}\b/g;
const URL_HOST = /\b[a-z][a-z0-9+.-]{0,30}:\/\/(?:(?:\[redacted: [a-z ]+\]|[^\s/@]{0,256})@)?([A-Za-z0-9.-]{1,253})/gi;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const global = (re: RegExp): RegExp => new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);

/** Node fields that are structure, not content: never scanned. */
const NODE_STRUCTURE = new Set(['id', 'name', 'type', 'typeVersion', 'position', 'disabled', 'onError', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'alwaysOutputData', 'executeOnce', 'color']);

class Redactor {
	readonly hits: RedactHit[] = [];
	private readonly hosts = new Set<string>();
	private readonly mask: RegExp[];
	private readonly keep: RegExp[];
	private readonly keepWhole: RegExp[];

	constructor(private readonly options: RedactOptions) {
		this.mask = (options.mask ?? []).map(global);
		this.keep = (options.keep ?? []).map(global);
		this.keepWhole = (options.keep ?? []).map((re) => new RegExp(`^(?:${re.source})$`, re.flags.replace('g', '')));
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

	/** `--keep` exempts a whole value only when a pattern matches all of it. */
	private keptWhole(s: string): boolean {
		return this.keepWhole.some((re) => re.test(s));
	}

	/**
	 * The parts of a string no rule may touch: existing placeholders and text a
	 * `--keep` pattern matched. Returned as sorted, merged [start, end) ranges.
	 */
	private protectedRanges(s: string): Array<[number, number]> {
		const spans = (res: RegExp[]): Array<[number, number]> =>
			res.flatMap((re) => [...s.matchAll(re)].filter((m) => m[0].length > 0).map((m): [number, number] => [m.index ?? 0, (m.index ?? 0) + m[0].length]));
		// A kept match shelters a secret only when it covers all of it: keeping a host must not keep
		// `ops@` that host, nor a token run up against it. Only computed when something is kept.
		const kept = spans(this.keep);
		const secrets = kept.length > 0 ? spans([EMAIL, URL_CREDENTIALS, ...INLINE_TOKENS]) : [];
		const shelters = ([a, b]: [number, number]): boolean => secrets.every(([c, d]) => !(a < d && c < b) || (a <= c && d <= b));
		const ranges: Array<[number, number]> = [...spans([PLACEHOLDER_RE]), ...kept.filter(shelters)];
		ranges.sort((a, b) => a[0] - b[0]);
		const merged: Array<[number, number]> = [];
		for (const r of ranges) {
			const last = merged.at(-1);
			if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
			else merged.push([r[0], r[1]]);
		}
		return merged;
	}

	/** Replace matches outside protected text; returns the new string and how many were replaced. */
	private replaceOutside(s: string, re: RegExp, by: (m: string, ...groups: string[]) => string): [string, number] {
		let count = 0;
		const sub = (text: string): string =>
			text.replace(re, (m: string, ...rest: unknown[]) => {
				count++;
				return by(m, ...rest.filter((x): x is string => typeof x === 'string'));
			});
		const parts: string[] = [];
		let last = 0;
		for (const [start, end] of this.protectedRanges(s)) {
			parts.push(sub(s.slice(last, start)), s.slice(start, end));
			last = end;
		}
		parts.push(sub(s.slice(last)));
		return [parts.join(''), count];
	}

	/** The string rules, applied to one string value. */
	string(s: string, where: string): string {
		if (isPlaceholder(s) || this.keptWhole(s)) {
			this.collectHosts(s);
			return s;
		}
		if (WHOLE_TOKEN.test(s.trim()) && this.protectedRanges(s).length === 0) {
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
		// Token shapes first: `Authorization: Bearer <token>` must lose the token, not the word `Bearer`.
		for (const re of INLINE_TOKENS) apply(re, 'token', () => placeholder('token'));
		apply(ASSIGN_SECRET, 'secret field', (_m, key) => `${key}${placeholder('secret field')}`);
		apply(PATH_SECRET, 'token', () => `/${placeholder('token')}`);
		apply(URL_CREDENTIALS, 'url credentials', (_m, scheme) => `${scheme}${placeholder('url credentials')}@`);
		apply(EMAIL, 'email', () => placeholder('email'));
		for (const re of this.mask) apply(re, 'custom', () => placeholder('custom'));
		this.collectHosts(out);
		return out;
	}

	private collectHosts(s: string): void {
		for (const m of s.matchAll(URL_HOST)) if (m[1]) this.hosts.add(m[1].toLowerCase());
	}

	/**
	 * An object key can be data too (`{ "ada@example.com": … }`): emails, inline
	 * tokens and custom patterns are masked in keys. A masked key that collides
	 * with one already present gets a ` #n` suffix so no entry is lost.
	 */
	key(k: string, where: string, taken: Set<string>): string {
		if (isPlaceholder(k) || this.keptWhole(k)) return k;
		let out = k;
		const apply = (re: RegExp, kind: RedactKind): void => {
			const [next, n] = this.replaceOutside(out, re, () => placeholder(kind));
			if (n > 0) this.hit(kind, where);
			out = next;
		};
		for (const re of INLINE_TOKENS) apply(re, 'token');
		apply(EMAIL, 'email');
		for (const re of this.mask) apply(re, 'custom');
		let unique = out;
		for (let i = 2; out !== k && taken.has(unique); i++) unique = `${out} #${i}`;
		taken.add(unique);
		return unique;
	}

	/** Generic scan: secret-named keys, header entries, then string rules on every leaf. */
	scan(v: unknown, where: string): unknown {
		if (typeof v === 'string') return this.string(v, where);
		if (Array.isArray(v)) return v.map((x, i) => this.scan(x, `${where}[${i}]`));
		if (!isRecord(v)) return v;
		const label = typeof v['name'] === 'string' ? v['name'] : typeof v['key'] === 'string' ? v['key'] : undefined;
		const secretEntry = label !== undefined && SECRET_KEY.test(label) && typeof v['value'] === 'string';
		const out: Record<string, unknown> = {};
		const taken = new Set<string>();
		for (const [k, x] of Object.entries(v)) {
			// The path is built from the masked key: a report must not repeat what it masked.
			const key = this.key(k, where, taken);
			const path = where ? `${where}.${key}` : key;
			if (k === 'credentials' && isRecord(x)) {
				// A credential reference can sit anywhere: a node, an error's copy of the node, an execution stack.
				out[key] = this.credentials(x, path);
			} else if ((SECRET_KEY.test(k) || (secretEntry && k === 'value')) && !this.exemptSecret(x)) {
				out[key] = this.maskAll(x, 'secret field', path);
			} else {
				out[key] = this.scan(x, path);
			}
		}
		return out;
	}

	private exemptSecret(x: unknown): boolean {
		return typeof x === 'string' && (isReferenceExpression(x) || isPlaceholder(x) || this.keptWhole(x));
	}

	/** `credentials: { <type>: { id, name } }` (or a pre-1.0 `{ <type>: "name" }`): the type stays, the rest is masked. */
	credentials(v: Record<string, unknown>, where: string): Record<string, unknown> {
		return Object.fromEntries(
			Object.entries(v).map(([type, ref]) => {
				if (typeof ref === 'string') {
					if (isPlaceholder(ref)) return [type, ref];
					this.hit('credential', `${where}.${type}`);
					return [type, placeholder('credential')];
				}
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
				if (masked) this.hit('credential', `${where}.${type}`);
				return [type, next];
			}),
		);
	}

	/** Mask every leaf of a value as one kind, counting one hit. */
	maskAll(v: unknown, kind: RedactKind, where: string): unknown {
		let masked = false;
		const walk = (x: unknown): unknown => {
			if (x === null || x === undefined) return x;
			if (Array.isArray(x)) return x.map(walk);
			if (isRecord(x)) {
				const taken = new Set<string>();
				return Object.fromEntries(Object.entries(x).map(([k, y]) => [this.key(k, where, taken), walk(y)]));
			}
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

/** Fields of an API export that name the people and projects owning the workflow. */
const OWNERSHIP = new Set(['shared', 'homeProject', 'owner', 'ownedBy', 'createdBy', 'updatedBy']);

const isWorkflow = (v: unknown): v is Record<string, unknown> => isRecord(v) && Array.isArray(v['nodes']) && isRecord(v['connections']);

function redactNode(r: Redactor, n: unknown): unknown {
	if (!isRecord(n)) return r.scan(n, 'nodes');
	const name = typeof n['name'] === 'string' ? n['name'] : '?';
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(n)) {
		if (NODE_STRUCTURE.has(k)) out[k] = v;
		else if (k === 'webhookId') out[k] = r.identifier(v, `${name} › webhookId`);
		else if (k === 'credentials' && isRecord(v)) out[k] = r.credentials(v, `${name} › credentials`);
		else out[k] = r.scan(v, `${name} › ${k}`);
	}
	return out;
}

/** Redact a workflow object (also used for an execution's workflowData). */
function redactWorkflowObject(r: Redactor, w: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(w)) {
		if (k === 'nodes' && Array.isArray(v)) out[k] = v.map((n) => redactNode(r, n));
		else if (OWNERSHIP.has(k)) out[k] = r.maskAll(v, 'identifier', k);
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
					if (rk === 'pinData') return [rk, r.data(rv, 'resultData.pinData')];
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

/** One workflow or execution, or `undefined` when the value is neither. */
function redactOne(r: Redactor, value: unknown): unknown {
	const decoded = decodeExecution(value);
	if (isExecution(decoded)) return redactExecution(r, decoded);
	if (isWorkflow(decoded)) return redactWorkflowObject(r, decoded);
	return undefined;
}

const isWorkflowOrExecution = (v: unknown): boolean => {
	const d = decodeExecution(v);
	return isExecution(d) || isWorkflow(d);
};

export function redactWorkflow(input: unknown, options: RedactOptions = {}): { json: unknown; report: RedactReport } {
	const r = new Redactor(options);
	let json = redactOne(r, input);
	let recognised = json !== undefined;
	if (json === undefined && Array.isArray(input) && input.length > 0 && input.every(isWorkflowOrExecution)) {
		// `n8n export:workflow --all` writes an array.
		json = input.map((x) => redactOne(r, x));
		recognised = true;
	} else if (json === undefined && isRecord(input) && Array.isArray(input['data']) && input['data'].length > 0 && input['data'].every(isWorkflowOrExecution)) {
		// The REST API lists as `{ data: [...], nextCursor }`.
		json = Object.fromEntries(Object.entries(input).map(([k, v]) => [k, k === 'data' && Array.isArray(v) ? v.map((x) => redactOne(r, x)) : r.scan(v, k)]));
		recognised = true;
	}
	if (json === undefined) json = r.scan(input, '');
	return { json, report: { hits: r.hits, hostsKept: r.hostsKept(), recognised } };
}
