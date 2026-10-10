import { describe, expect, it } from 'vitest';
import { redactWorkflow } from '../src/redact.js';
import { readFileSync, writeFileSync } from 'node:fs';

const wf = (nodes: unknown[], extra: Record<string, unknown> = {}) => ({ name: 'W', nodes, connections: {}, ...extra });
const node = (name: string, parameters: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
	id: 'a1111111-1111-4111-8111-111111111111',
	name,
	type: 'n8n-nodes-base.set',
	typeVersion: 3,
	position: [0, 0],
	parameters,
	...extra,
});
const out = (input: unknown, o = {}) => JSON.stringify(redactWorkflow(input, o).json);

describe('redactWorkflow: workflows', () => {
	it('masks credential ids and names but keeps the credential type', () => {
		const r = redactWorkflow(wf([node('Notify', {}, { credentials: { slackApi: { id: 'cred123', name: 'My Slack' } } })]));
		const n = (r.json as { nodes: Array<{ credentials: Record<string, { id: string; name: string }> }> }).nodes[0]!;
		expect(n.credentials.slackApi).toEqual({ id: '[redacted: credential]', name: '[redacted: credential]' });
		expect(r.report.hits).toContainEqual({ kind: 'credential', where: 'Notify › credentials.slackApi' });
	});

	it('masks identifiers: instance id, workflow id, versionId, webhookId', () => {
		const s = out(wf([node('Hook', {}, { webhookId: 'abc-def' })], { id: 'wf1', versionId: 'v1', meta: { instanceId: 'deadbeef' } }));
		for (const secret of ['abc-def', 'wf1', '"v1"', 'deadbeef']) expect(s).not.toContain(secret);
		expect(s).toContain('[redacted: identifier]');
	});

	it('never scans node id, name, type, typeVersion or position', () => {
		const r = redactWorkflow(wf([node('Some Node With A Long Name', {})]));
		const n = (r.json as { nodes: Array<Record<string, unknown>> }).nodes[0]!;
		expect(n.id).toBe('a1111111-1111-4111-8111-111111111111');
		expect(n.name).toBe('Some Node With A Long Name');
		expect(n.type).toBe('n8n-nodes-base.set');
	});

	it('masks secret-named fields, but keeps an expression', () => {
		const s = out(wf([node('H', { password: 'hunter2', apiKey: 'k', token: '={{ $env.TOKEN }}' })]));
		expect(s).not.toContain('hunter2');
		expect(s).toContain('"apiKey":"[redacted: secret field]"');
		expect(s).toContain('={{ $env.TOKEN }}');
	});

	it('masks a header entry whose name is a secret name', () => {
		const s = out(wf([node('HTTP', { headerParameters: { parameters: [{ name: 'Authorization', value: 'abc' }, { name: 'Accept', value: 'application/json' }] } })]));
		expect(s).toContain('"name":"Authorization","value":"[redacted: secret field]"');
		expect(s).toContain('application/json');
	});

	it('masks tokens, JWTs, Basic, PEM keys and AWS key ids, including inside longer text', () => {
		const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
		const s = out(wf([node('C', {
			whole: 'sk_live_0123456789abcdefghijkl',
			code: `const t = "${jwt}"; fetch(u, { headers: { a: "Bearer abcdefghijklmnopqrstuvwx" } });`,
			basic: 'Basic dXNlcjpwYXNzd29yZA==',
			pem: '-----BEGIN PRIVATE KEY-----\nMIIBVQ\n-----END PRIVATE KEY-----',
			aws: 'key AKIAABCDEFGHIJKLMNOP here',
		})]));
		for (const secret of ['sk_live_0123456789abcdefghijkl', jwt, 'abcdefghijklmnopqrstuvwx', 'dXNlcjpwYXNzd29yZA==', 'MIIBVQ', 'AKIAABCDEFGHIJKLMNOP']) {
			expect(s).not.toContain(secret);
		}
		expect(s).toContain('const t = \\"[redacted: token]\\"');
		expect(s).toContain('key [redacted: token] here');
	});

	it('masks only the email and the user:pass part of a URL', () => {
		const s = out(wf([node('S', { text: 'Write to ada@example.com today', db: 'postgres://admin:s3cret@db.internal:5432/app' })]));
		expect(s).toContain('Write to [redacted: email] today');
		expect(s).toContain('postgres://[redacted: url credentials]@db.internal:5432/app');
	});

	it('masks custom patterns and honours keep, but keep cannot unmask credentials or identifiers', () => {
		const input = wf([node('S', { a: 'acme-internal-42', b: 'ada@example.com' }, { credentials: { x: { id: '1', name: 'n' } } })], { id: 'wf1' });
		const s = out(input, { mask: [/acme-internal-\d+/], keep: [/@example\.com$/] });
		expect(s).toContain('[redacted: custom]');
		expect(s).not.toContain('acme-internal-42');
		expect(s).toContain('ada@example.com');
		const all = out(input, { keep: [/.*/] });
		expect(all).toContain('ada@example.com');
		expect(all).toContain('[redacted: credential]');
		expect(all).toContain('[redacted: identifier]');
	});

	it('masks the same pinned data value-by-value, keeping keys and counts', () => {
		const r = redactWorkflow(wf([node('S', {})], { pinData: { S: [{ json: { name: 'Ada', age: 36, ok: true, none: null } }] } }));
		expect((r.json as { pinData: unknown }).pinData).toEqual({ S: [{ json: { name: '[redacted: data]', age: '[redacted: data]', ok: '[redacted: data]', none: null } }] });
		expect(r.report.hits).toContainEqual({ kind: 'data', where: 'pinData › S' });
		const kept = redactWorkflow(wf([node('S', {})], { pinData: { S: [{ json: { name: 'Ada' } }] } }), { keepData: true });
		expect(JSON.stringify(kept.json)).toContain('Ada');
	});

	it('lists the hosts it kept, sorted and unique', () => {
		const r = redactWorkflow(wf([node('H', { url: 'https://api.slack.com/x', b: 'see https://hooks.example.com/a and https://api.slack.com/y' })]));
		expect(r.report.hostsKept).toEqual(['api.slack.com', 'hooks.example.com']);
	});

	it('still lists the host of a URL whose credentials were masked', () => {
		const r = redactWorkflow(wf([node('P', { db: 'postgres://admin:s3cret@db.example.test:5432/app' })]));
		expect(r.report.hostsKept).toEqual(['db.example.test']);
	});

	it('is idempotent, deterministic, never re-masks a placeholder and leaves the input alone', () => {
		const input = wf([node('S', { password: 'p', text: 'mail ada@example.com' })], { id: 'wf1' });
		const before = JSON.stringify(input);
		const once = redactWorkflow(input, { mask: [/redacted/] });
		expect(JSON.stringify(input)).toBe(before);
		expect(JSON.stringify(redactWorkflow(input, { mask: [/redacted/] }).json)).toBe(JSON.stringify(once.json));
		const twice = redactWorkflow(once.json, { mask: [/redacted/] });
		expect(JSON.stringify(twice.json)).toBe(JSON.stringify(once.json));
		expect(twice.report.hits).toEqual([]);
	});
});

const fixture = (f: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));

describe('redactWorkflow: executions and other input', () => {
	it('masks execution item data, identifiers and the embedded workflow', () => {
		const input = fixture('execution-success.json') as Record<string, unknown>;
		const r = redactWorkflow(input);
		const s = JSON.stringify(r.json);
		expect(r.report.recognised).toBe(true);
		expect(s).not.toContain('"wrexecok00000001"');
		expect(s).not.toContain('August 30th 2026');
		expect(r.report.hits.some((h) => h.kind === 'data' && h.where.startsWith('runData › '))).toBe(true);
		// still an execution the renderer can draw
		expect((r.json as { workflowData: { nodes: unknown[] } }).workflowData.nodes.length).toBe(
			(input['workflowData'] as { nodes: unknown[] }).nodes.length,
		);
	});

	it('decodes a flatted API execution before masking', () => {
		const input = fixture('execution-api-flatted.json') as Record<string, unknown>;
		expect(typeof input['data']).toBe('string');
		const r = redactWorkflow(input);
		expect(typeof (r.json as Record<string, unknown>)['data']).toBe('object');
		expect(r.report.hits.some((h) => h.kind === 'data')).toBe(true);
	});

	it('keepData leaves execution items but still scans them', () => {
		const s = JSON.stringify(redactWorkflow(fixture('execution-success.json'), { keepData: true }).json);
		expect(s).toContain('August 30th 2026');
	});

	it('scans anything else as plain JSON and says so', () => {
		const r = redactWorkflow({ note: 'mail ada@example.com' });
		expect(r.report.recognised).toBe(false);
		expect(JSON.stringify(r.json)).toContain('[redacted: email]');
	});

	it('matches the golden output for a realistic workflow', () => {
		const r = redactWorkflow(fixture('redact-input.json'), { mask: [/acme-internal-\d+/] });
		const goldenPath = new URL('./golden/redact-output.json', import.meta.url);
		if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath, JSON.stringify({ json: r.json, report: r.report }, null, 2) + '\n');
		const golden = JSON.parse(readFileSync(goldenPath, 'utf8'));
		expect({ json: r.json, report: r.report }).toEqual(golden);
	});
});