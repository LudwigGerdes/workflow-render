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
		const s = out(input, { mask: [/acme-internal-\d+/], keep: [/ada@example\.com/] });
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
describe('redactWorkflow: bypass probes', () => {
	it('masks secret values in URL query strings', () => {
		const s = out(wf([node('H', { url: 'https://api.example.com/x?api_key=abc123secretvalue&q=1', u2: 'https://h.example.com/?access_token=t0k3n#frag' })]));
		expect(s).not.toContain('abc123secretvalue');
		expect(s).not.toContain('t0k3n');
		expect(s).toContain('q=1');
	});

	it('masks fields whose names contain a secret word', () => {
		const s = out(wf([node('H', { dbPassword: 'p1', stripeApiKey: 'k1', clientSecret: 'c1', headerParameters: { parameters: [{ name: 'X-Auth-Token', value: 'v1' }] } })]));
		for (const v of ['"p1"', '"k1"', '"c1"', '"v1"']) expect(s).not.toContain(v);
	});

	it('masks vendor-prefixed tokens inside code', () => {
		const s = out(wf([node('C', { jsCode: 'const a = "sk_live_51Habcdefghijklmn"; const b = "xoxb-123456789012-abcdefghijkl"; const c = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";' })]));
		for (const v of ['sk_live_51H', 'xoxb-1234', 'ghp_abcdef']) expect(s).not.toContain(v);
	});

	it('masks secret values inside a JSON string body', () => {
		const s = out(wf([node('H', { jsonBody: '{"user":"ada","password":"hunter2","api_key":"zz9"}' })]));
		expect(s).not.toContain('hunter2');
		expect(s).not.toContain('zz9');
		expect(s).toContain('\\"user\\":\\"ada\\"');
	});
});

describe('redactWorkflow: incomplete-redaction probes', () => {
	it('does not exempt an expression that carries a literal secret', () => {
		const s = out(wf([node('H', { password: '={{ "hunter2" }}', token: "={{ 'abc' + $json.x }}", apiKey: '={{ $env.API_KEY }}' })]));
		expect(s).not.toContain('hunter2');
		expect(s).not.toContain("'abc'");
		expect(s).toContain('={{ $env.API_KEY }}');
	});

	it('masks emails and tokens used as object keys, in parameters and in item data', () => {
		const s = out(wf([node('S', { lookup: { 'ada@example.com': 1 } })], { pinData: { S: [{ json: { 'grace@example.com': 'x' } }] } }));
		expect(s).not.toContain('ada@example.com');
		expect(s).not.toContain('grace@example.com');
	});
});

describe('redactWorkflow: hostile input', () => {
	const hostile: Array<[string, string]> = [
		['plain run', 'a'.repeat(60_000)],
		['quote then run', `"${'a'.repeat(60_000)}`],
		['query then run', `?${'a'.repeat(60_000)}`],
		['email-ish', `a@${'b.'.repeat(30_000)}`],
		['scheme-ish', `${'a'.repeat(60_000)}:`],
		['repeated prefixes', 'sk-'.repeat(20_000)],
		['repeated jwt starts', 'eyJ'.repeat(20_000)],
		['unterminated keys', '-----BEGIN PRIVATE KEY-----'.repeat(2_000)],
	];
	it.each(hostile)('handles %s in well under a second', (_name, text) => {
		const started = performance.now();
		redactWorkflow(wf([node('S', { text, [text.slice(0, 5_000)]: 1 })]));
		expect(performance.now() - started).toBeLessThan(500);
	});
});

describe('redactWorkflow: exposure probes', () => {
	it('never puts a masked key into the report', () => {
		const r = redactWorkflow(wf([node('S', { lookup: { 'ada@example.com': { password: 'x' } } })]));
		expect(JSON.stringify(r.report)).not.toContain('ada@example.com');
	});

	it('masks ownership fields from API exports (they carry names and emails)', () => {
		const s = out(wf([node('S', {})], {
			shared: [{ role: 'workflow:owner', project: { id: 'p1', name: 'Ada Lovelace <ada@example.com>', type: 'personal' } }],
			homeProject: { id: 'p1', name: 'Ada Lovelace <ada@example.com>' },
			owner: { firstName: 'Ada', lastName: 'Lovelace' },
		}));
		expect(s).not.toContain('Lovelace');
		expect(s).toContain('[redacted: identifier]');
	});

	it("masks an execution's resultData.pinData as data", () => {
		const e = fixture('execution-success.json') as { data: { resultData: Record<string, unknown> } };
		e.data.resultData['pinData'] = { 'Schedule Trigger': [{ json: { who: 'Grace Hopper' } }] };
		expect(JSON.stringify(redactWorkflow(e).json)).not.toContain('Grace Hopper');
	});
});

describe('final review fixes', () => {
	const cred = { slackApi: { id: 'slackCred01', name: 'Team Slack PROD' } };
	const failingNode = { id: 'n1', name: 'Notify', type: 'n8n-nodes-base.slack', typeVersion: 2, position: [0, 0], parameters: {}, credentials: cred };

	it('C1: masks credential references wherever they appear (execution errors, stacks, legacy strings)', () => {
		const e = fixture('execution-error.json') as { data: { resultData: Record<string, unknown>; executionData?: unknown } };
		e.data.resultData['error'] = { message: 'boom', node: failingNode };
		const s = JSON.stringify(redactWorkflow(e, { keepData: true }).json);
		expect(s).not.toContain('Team Slack PROD');
		expect(s).not.toContain('slackCred01');
		expect(out(wf([node('Old', {}, { credentials: { slackApi: 'Team Slack' } })]))).not.toContain('Team Slack');
	});

	it('I2: masks secret assignments in connection strings, env text, form bodies, object literals and YAML', () => {
		const s = out(wf([node('C', {
			mssql: 'Server=db;User Id=sa;Password=hunter2a;',
			env: 'API_KEY=hunter2b\nDEBUG=1',
			form: 'client_secret=hunter2c&grant_type=client_credentials',
			js: "fetch(u, { headers: { 'x-api-key': 'hunter2d' }, password: 'hunter2e' })",
			yaml: 'user: ada\npassword: hunter2f',
		})]));
		for (const v of ['hunter2a', 'hunter2b', 'hunter2c', 'hunter2d', 'hunter2e', 'hunter2f']) expect(s).not.toContain(v);
		expect(s).toContain('DEBUG=1');
		expect(s).toContain('grant_type=client_credentials');
	});

	it('I3: masks secrets carried in URL paths and SendGrid keys', () => {
		const s = out(wf([node('H', {
			// Built from pieces so the source holds no literal that secret scanners take for a real key.
			slack: ['https://hooks.slack.com/services', 'T00000000', 'B00000000', 'X'.repeat(24)].join('/'),
			discord: 'https://discord.com/api/webhooks/123456789012345678/abcDEFghiJKLmnoPQRstuVWXyz0123456789',
			tg: 'https://api.telegram.org/bot123456789:AAHfixtureTOKENnotREALabcdefghijklmn/sendMessage',
			n8n: 'https://n8n.example.com/webhook/7d1c2f0a-1111-4222-8333-444455556666',
			sg: ['SG', 'abcdefghijklmnopqrstuv', 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'].join('.'),
		})]));
		for (const v of ['XXXXXXXXXXXXXXXXXXXXXXXX', 'abcDEFghiJKL', 'AAHfixtureTOKEN', '7d1c2f0a-1111', 'SG.abcdefghij']) expect(s).not.toContain(v);
		expect(s).toContain('https://hooks.slack.com/');
	});

	it('I4: masks lowercase bearer/basic and whitespace-wrapped tokens', () => {
		const s = out(wf([node('C', { a: 'curl -H "authorization: bearer abcdefghijklmnopqrstuvwxyz0123"', b: '  sk9a8b7c6d5e4f3g2h1i0jklmn  ', c: 'basic dXNlcjpwYXNzd29yZA==' })]));
		for (const v of ['abcdefghijklmnopqrstuvwxyz0123', 'sk9a8b7c6d5e4f3g2h1i0jklmn', 'dXNlcjpwYXNzd29yZA==']) expect(s).not.toContain(v);
	});

	it('I5: --keep protects the matched text, not the whole value', () => {
		const s = out(wf([node('N', { content: 'use Bearer abcdefghijklmnopqrstuvwxyz012345 against https://hooks.example.com, ask ops@example.com' })]), { keep: [/example\.com/] });
		expect(s).not.toContain('abcdefghijklmnopqrstuvwxyz012345');
		expect(s).toContain('hooks.example.com');
	});

	it('I6: leaves long option values without digits alone', () => {
		const s = out(wf([node('H', { authentication: 'genericCredentialType', category: 'HARM_CATEGORY_HATE_SPEECH', sort: 'LAST_MODIFIED_DESCENDING' })]));
		expect(s).toContain('genericCredentialType');
		expect(s).toContain('HARM_CATEGORY_HATE_SPEECH');
	});

	it('I7: applies the structural rules to arrays of workflows and { data: [...] } lists', () => {
		const one = wf([node('S', {}, { credentials: { postgres: { id: 'pgCred0001', name: 'Production Postgres' } } })], { pinData: { S: [{ json: { who: 'Ada Lovelace' } }] } });
		for (const input of [[one, one], { data: [one] }]) {
			const r = redactWorkflow(input);
			const s = JSON.stringify(r.json);
			expect(s).not.toContain('Production Postgres');
			expect(s).not.toContain('Ada Lovelace');
			expect(r.report.recognised).toBe(true);
		}
	});

	it('re-graded: masks { key, value } secret entries and expressions with a literal prefix', () => {
		const s = out(wf([node('H', { headers: [{ key: 'Authorization', value: 'Token zzz' }], password: '=hunter2x-{{ $json.x }}' })]));
		expect(s).not.toContain('Token zzz');
		expect(s).not.toContain('hunter2x');
	});
});

describe('keep cannot shelter a secret it overlaps', () => {
	it('still masks an email at a kept domain, and a token touching kept text', () => {
		const s = out(wf([node('N', { a: 'ask ops@example.com via https://hooks.example.com/x', b: 'Bearer abcdefghijklmnopqrstuvwxyz0123example.com' })]), { keep: [/example\.com/] });
		expect(s).not.toContain('ops@');
		expect(s).not.toContain('abcdefghijklmnopqrstuvwxyz0123');
		expect(s).toContain('https://hooks.example.com/x');
	});
});
