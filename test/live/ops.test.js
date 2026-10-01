// Every operation the n8n node ships, called live against https://coord.taifoon.dev/v1 with exactly the request the node
// builds (node-request.js: same method, path, query, body and headers, X-Taifoon-Client included).
//
//   TAIFOON_PROBE_KEY=… node --test --test-concurrency=1 test/live/ops.test.js     (npm run test:ops)
//
// Per operation: the success answer (status, JSON, the fields consumers map present and not null, the answer valid against
// the 2xx schema /v1/openapi.json declares — no undeclared null, no wrong type, nothing secret or internal in it, inside
// its latency budget), each documented refusal (its 4xx, never a 5xx, as { ok:false, code, error, next_step }), and the
// wrong method (405). Writes without a safe live path are refusal-only (see ops.spec.js and the gaps it names).
// Results go to $OPS_RESULTS (JSON) when set, for a scheduler to export (status and latency per check).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { writeFileSync } = require('node:fs');
const { operations } = require('./node-request');
const { SPEC } = require('./ops.spec');
const { BASE, PROBE_KEY, sampleIds, callOp } = require('./harness');

const LIVE = Boolean(PROBE_KEY) || process.env.OPS_LIVE === '1';
const results = [];
const record = (r) => results.push({ at: Date.now(), ...r });
process.on('exit', () => { if (process.env.OPS_RESULTS) writeFileSync(process.env.OPS_RESULTS, JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1)); });

// ── what no answer may carry ──
const SECRET_PATTERNS = [
	[/\btfr_[A-Za-z0-9_-]{16,}/, 'a relayer key'],
	// server secret names, spelled in parts here so this file itself carries none of them
	[new RegExp(['x-coord-token', ...['OPERATOR', 'COORD', 'RELAY_CLIENT'].map((x) => `${x}_TOKEN`), 'SIGNER_SECRET'].join('|'), 'i'), 'a server secret name'],
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
	[/"(private_?key|secret|password|mnemonic)"\s*:\s*"[^"]{8,}"/i, 'a secret field'],
	// no IP pattern in general: agents' own cards (third-party data the layer relays) may carry bare or private IPs
	// the runner names the addresses of its own hosts (never written in this file): none may appear in an answer
	...String(process.env.OPS_FORBIDDEN_IPS ?? '').split(',').map((x) => x.trim()).filter(Boolean).map((ip) => [new RegExp(`(?<![\\w.])${ip.replace(/\./g, '\\.')}(?![\\w.])`), 'one of our host addresses']),
	[/"(unrecognised|candidateCount)"\s*:/, 'the internal harvest (its candidates)'],
	// no host of ours by name, no server path, no private repository path (the GPU product's note named "box 62", "docs/revenue/04")
	[/\bbox[ -]?(?:46|62|88|116|138)\b/i, 'one of our hosts by name'],
	[/(?<![\w.])\/(?:opt|var\/lib|etc|srv)\/[\w.-]+/, 'a server path'],
	[/\bdocs\/(?:revenue|machines|api-contract|reviews)\b|\bBACKLOG\.md\b/, 'a private repository path'],
];
function noSecrets(text, label) {
	for (const [re, what] of SECRET_PATTERNS) assert.doesNotMatch(text, re, `${label}: the answer carries ${what}`);
}

// ── the declared 2xx schema of a route, from the live OpenAPI document ──
let OA = null;
async function openapi() { if (!OA) OA = await (await fetch(`${BASE}/openapi.json`)).json(); return OA; }
function declared(oa, method, url) {
	const p = '/v1' + String(url).replace(/^=/, '').replace(/\{\{[^}]+\}\}/g, '{x}');
	for (const [k, ms] of Object.entries(oa.paths)) {
		const op = ms[method.toLowerCase()];
		if (k.replace(/\{[^}]+\}/g, '{x}') === p && op) {
			const ok = Object.entries(op.responses).find(([s]) => /^2/.test(s));
			return { op, schema: ok?.[1]?.content?.['application/json']?.schema ?? null, path: k };
		}
	}
	return null;
}
const typeOk = (v, t) => (t === 'null' ? v === null : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : t === 'number' ? typeof v === 'number' : t === 'object' ? v !== null && typeof v === 'object' && !Array.isArray(v) : typeof v === t);
/** Top-level validation against a JSON schema: required present, each declared field of its declared type(s), no null
 *  where the schema does not declare one. Returns the problems. */
function validate(body, schema) {
	const out = [];
	if (!schema || schema.type !== 'object') return out;
	if (!body || typeof body !== 'object' || Array.isArray(body)) return ['the body is not a JSON object'];
	for (const k of schema.required ?? []) if (!(k in body)) out.push(`required field ${k} is missing`);
	for (const [k, v] of Object.entries(body)) {
		const d = schema.properties?.[k];
		if (!d) { if (v === null) out.push(`${k} is null and not declared`); continue; }
		const types = Array.isArray(d.type) ? d.type : [d.type];
		if (!types.some((t) => typeOk(v, t))) out.push(`${k} is ${v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v}, declared ${types.join('|')}`);
	}
	return out;
}

const statusIn = (s, want) => (Array.isArray(want) ? want : [want]).includes(s);

let IDS = null;
const ids = async () => (IDS ??= await sampleIds());

for (const op of operations()) {
	const id = `${op.resource}.${op.operation}`;
	const s = SPEC[id];
	if (!s) continue; // coverage.test.js fails on it
	test(`${id} → ${op.method} ${String(op.url).replace(/^=/, '')}`, { skip: !LIVE && 'no TAIFOON_PROBE_KEY: live op tests skipped', timeout: 180_000 }, async (t) => {
		const oa = await openapi();
		const d = declared(oa, op.method, op.url);
		assert.ok(d, `${op.method} ${op.url} is not in the live OpenAPI document`);

		if (s.mode !== 'refusal-only') {
			await t.test(`success (${s.mode})`, async () => {
				const params = s.params(await ids());
				let r = await callOp(op.resource, op.operation, params, { key: s.key });
				// one retry for a blink of the upstream (a timeout or 5xx), never for a 4xx
				if (r.status === 0 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 2000)); r = await callOp(op.resource, op.operation, params, { key: s.key }); }
				record({ op: id, kind: 'success', status: r.status, ms: Math.round(r.ms), bytes: r.bytes, budgetMs: s.budgetMs, ok: statusIn(r.status, s.ok.status) });
				assert.ok(statusIn(r.status, s.ok.status), `status ${r.status}, want ${s.ok.status}: ${r.text?.slice(0, 300)}`);
				assert.match(r.type, /application\/json/, 'Content-Type is JSON');
				assert.ok(r.json && typeof r.json === 'object', 'a JSON body');
				noSecrets(r.text, id);
				if (r.status >= 400) return; // an allowed 4xx (a poll with nothing recorded yet) is checked as a refusal below
				for (const f of s.ok.fields ?? []) assert.ok(r.json[f] !== undefined && r.json[f] !== null, `field ${f} is missing or null`);
				for (const f of s.ok.lists ?? []) assert.ok(Array.isArray(r.json[f]), `field ${f} is not a list`);
				for (const f of s.ok.nonEmpty ?? []) assert.ok(r.json[f].length > 0, `list ${f} is empty`);
				const problems = validate(r.json, d.schema);
				assert.deepEqual(problems, [], `the answer does not match the declared schema of ${d.path}`);
				assert.ok(r.ms <= s.budgetMs, `took ${Math.round(r.ms)} ms, budget ${s.budgetMs} ms`);
			});
			if (s.mode === 'idempotent' || s.mode === 'dry-run') {
				await t.test(`${s.mode}: a repeat answers the same and keeps nothing`, async () => {
					const params = s.params(await ids());
					const a = await callOp(op.resource, op.operation, params, { key: s.key });
					const b = await callOp(op.resource, op.operation, params, { key: s.key });
					assert.equal(a.status, b.status);
					if (s.mode === 'dry-run') { assert.equal(b.json?.kept, false, 'a dry run keeps nothing'); assert.equal(b.json?.dry_run, true); }
					if (s.mode === 'idempotent') assert.deepEqual(Object.keys(a.json ?? {}).sort(), Object.keys(b.json ?? {}).sort());
				});
			}
		} else t.diagnostic(`GAP ${id}: ${s.gap}`);

		// extra contracts on what an answer means (s.extra): a `todo` names a fix another change owns — reported, never failing
		// the run, and it shows as passing once the fix is live
		for (const x of s.extra ?? []) {
			await t.test(`contract: ${x.why}`, { todo: x.todo || false }, async () => {
				const r = await callOp(op.resource, op.operation, x.params ?? s.params(await ids()), { key: s.key });
				record({ op: id, kind: 'contract', why: x.why, status: r.status, ms: Math.round(r.ms), ok: r.status < 500 && x.check(r.json, r.status).length === 0, todo: Boolean(x.todo) });
				assert.deepEqual(x.check(r.json, r.status), [], `${x.why}: ${r.text?.slice(0, 300)}`);
			});
		}

		for (const rf of s.refusals) {
			await t.test(`refusal: ${rf.why} → ${rf.status.join('|')}`, async () => {
				const params = rf.params ?? s.params(await ids());
				const r = await callOp(op.resource, op.operation, params, { key: s.key, as: rf.noKey ? 'noKey' : rf.badKey ? 'badKey' : 'ok' });
				const undone = s.cleanup ? await s.cleanup(r.json) : 0;
				record({ op: id, kind: 'refusal', why: rf.why, status: r.status, ms: Math.round(r.ms), ok: statusIn(r.status, rf.status) && !undone });
				assert.equal(undone, 0, `the refusal created ${undone} thing(s), revoked again`);
				assert.ok(r.status < 500, `a refusal must never be a 5xx (got ${r.status}): ${r.text?.slice(0, 200)}`);
				assert.ok(statusIn(r.status, rf.status), `status ${r.status}, want ${rf.status}: ${r.text?.slice(0, 300)}`);
				assert.match(r.type, /application\/json/, 'Content-Type is JSON');
				assert.equal(r.json?.ok, false, 'ok:false');
				assert.equal(typeof r.json?.code, 'string', 'a code');
				assert.ok(typeof r.json?.error === 'string' && r.json.error.length > 0, 'an error message');
				assert.ok(r.json?.next_step && typeof r.json.next_step === 'object', 'a next_step');
				if (rf.code) assert.equal(r.json.code, rf.code);
				noSecrets(r.text, `${id} refusal`);
			});
		}

		// the other method on the same path: 405 with Allow, unless the path serves both
		const other = op.method === 'GET' ? 'POST' : 'GET';
		if (!d.path || !oa.paths[d.path][other.toLowerCase()]) {
			await t.test(`wrong method (${other}) → 405`, async () => {
				const r = await callOp(op.resource, op.operation, s.mode === 'refusal-only' ? (s.refusals.find((x) => x.params)?.params ?? s.params(await ids())) : s.params(await ids()), { key: s.key, method: other });
				record({ op: id, kind: 'method', status: r.status, ms: Math.round(r.ms), ok: r.status === 405 });
				assert.equal(r.status, 405, `${other} answered ${r.status}`);
				assert.equal(r.json?.code, 'method_not_allowed');
				assert.equal(r.headers.get('allow'), op.method);
			});
		}
	});
}

// Public answers outside the node's operations that integrators read beside it: no host, server path or repo path either.
test('public reads beside the node carry no host, server path or repo path', { skip: !LIVE && 'no TAIFOON_PROBE_KEY', timeout: 120_000 }, async () => {
	for (const p of ['judge/credits/grid', 'judge/credits', 'landscape', 'catalog?limit=5']) {
		const r = await fetch(`${BASE}/${p}`, { headers: { 'x-taifoon-probe': PROBE_KEY } });
		noSecrets(await r.text(), `GET /v1/${p}`);
	}
});

test('an oversize body is refused with a 4xx, never a 5xx', { skip: !LIVE && 'no TAIFOON_PROBE_KEY', timeout: 120_000 }, async () => {
	// 5 MB: over the platform's request-body limit (4.5 MB); a POST the node sends (Agent → Match)
	const r = await fetch(`${BASE}/match`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-taifoon-probe': PROBE_KEY }, body: JSON.stringify({ required_skills: ['x'], pad: 'x'.repeat(5 * 1024 * 1024) }) });
	record({ op: 'agent.match', kind: 'oversize', status: r.status, ok: r.status >= 400 && r.status < 500 });
	assert.ok(r.status >= 400 && r.status < 500, `got ${r.status}`);
});
