// Every route the node calls must exist in the LIVE OpenAPI document, with the same method.
//
// The previous version of this package called 17 endpoints, of which 2 existed. Nothing caught it,
// because nothing checked. This test walks the built node description, collects every request it can
// make, and looks each one up in https://coord.taifoon.dev/v1/openapi.json.
const test = require('node:test');
const assert = require('node:assert');
const { Taifoon } = require('../../dist/nodes/Taifoon/Taifoon.node.js');

const BASE = process.env.TAIFOON_BASE || 'https://coord.taifoon.dev';

function collect() {
	const out = [];
	for (const p of new Taifoon().description.properties) {
		if (p.name !== 'operation') continue;
		const resource = p.displayOptions.show.resource[0];
		for (const o of p.options) {
			const req = o.routing && o.routing.request;
			assert.ok(req, `${resource}.${o.value} has no routing.request`);
			// "=/jobs/{{$parameter.jobId}}/complete" → "/jobs/{x}/complete"
			const path = String(req.url).replace(/^=/, '').replace(/\{\{[^}]+\}\}/g, '{x}');
			out.push({ op: `${resource}.${o.value}`, method: req.method.toLowerCase(), path, ...(req.baseURL ? { baseURL: req.baseURL } : {}) });
		}
	}
	return out;
}

test('the node declares a sensible number of operations', () => {
	const ops = collect();
	assert.ok(ops.length >= 25, `only ${ops.length} operations found`);
});

// Routes 0.6.0 calls that the layer may not have deployed yet. Each is checked like any other once its probe answers;
// while the probe answers 404 the route is not live, and its operations are skipped with a message instead of failing.
const NEW_ROUTES = [
	{ prefix: '/listings', probe: '/v1/listings?view=funnel', since: '0.6.0' },
	{ prefix: '/sma', probe: '/v1/sma/graph?product=taifoon&scope=public', since: '1.1.0' },
];

test('every operation exists in the live OpenAPI document', async (t) => {
	const res = await fetch(`${BASE}/v1/openapi.json`);
	assert.strictEqual(res.status, 200, 'openapi.json must be served');
	const spec = await res.json();
	const live = new Set();
	for (const [p, methods] of Object.entries(spec.paths))
		for (const m of Object.keys(methods)) live.add(`${m} ${p.replace(/^\/v1/, '').replace(/\{[^}]+\}/g, '{x}')}`);

	const notDeployed = [];
	for (const r of NEW_ROUTES) {
		const probe = await fetch(`${BASE}${r.probe}`);
		if (probe.status === 404) notDeployed.push(r);
	}
	const pending = (o) => notDeployed.find((r) => o.path.startsWith(r.prefix));
	const skipped = collect().filter(pending);
	for (const o of skipped)
		t.diagnostic(`SKIP ${o.op} → ${o.method.toUpperCase()} ${o.path}: GET ${pending(o).probe} answers 404, the route (new in ${pending(o).since}) is not deployed yet`);

	// 0.9.0: an operation on another host of ours (the GPU gate, api.taifoon.dev) is not in coord's OpenAPI; its host must answer
	const OWN_HOSTS = { 'https://api.taifoon.dev': '/gpu/pricing' };
	for (const [host, probe] of Object.entries(OWN_HOSTS)) {
		const ops = collect().filter((o) => o.baseURL === host);
		if (!ops.length) continue;
		const r = await fetch(`${host}${probe}`);
		assert.strictEqual(r.status, 200, `${host}${probe} must answer 200 for ${ops.map((o) => o.op).join(', ')}`);
	}
	const missing = collect().filter((o) => !o.baseURL && !pending(o) && !live.has(`${o.method} ${o.path}`));
	assert.deepStrictEqual(missing, [], `operations with no matching route in the live API:\n${missing.map((m) => `  ${m.op} → ${m.method.toUpperCase()} ${m.path}`).join('\n')}`);
	if (skipped.length) t.skip(`${skipped.length} operation(s) on routes not deployed yet: ${skipped.map((o) => o.op).join(', ')}`);
});

test('the credential test endpoint exists and refuses a bad key', async () => {
	const res = await fetch(`${BASE}/v1/relayer/whoami`, { headers: { 'x-api-key': 'tfr_not_a_real_key' } });
	assert.strictEqual(res.status, 401, 'a bad key must be a 401 so n8n reports the credential as invalid');
});

// ── 2.2.0: the market reads, the listing's venues, and the reads a hire → settle workflow makes, called with exactly the request
// the node builds (node-request.js) from the parameters its live contract names (ops.spec.js). With TAIFOON_PROBE_KEY a keyed op
// runs on that key and must answer its success; without one it must refuse as a key-gated route does (401 { ok:false, code, error }).
// A keyless call the visitor budget of this address refuses (402 past_free_rate: 600 a day per address) is reported, not failed:
// the budget is the caller's, not the route's. The e2e settle run reuses HIRE_TO_SETTLE.
const { SPEC } = require('./ops.spec');
const { PROBE_KEY, sampleIds, callOp } = require('./harness');

/** the reads a hire → settle workflow makes, in its order: ask (dry run), match, follow the handshake, read the settlements, the meter */
const HIRE_TO_SETTLE = ['demand.post', 'agent.match', 'handshake.get', 'settlement.getAll', 'settlement.get', 'account.getUsage'];
/** new in 2.2.0: every Market operation (read from the built node) and the four hand-typed ones */
const NEW_IN_220 = () => [...collect().filter((o) => o.op.startsWith('market.')).map((o) => o.op), 'agent.getRegistered', 'account.getUsage', 'sellerListing.getVenues', 'sellerListing.setVenue'];

const isRefusal = (j) => j && j.ok === false && typeof j.code === 'string' && typeof j.error === 'string';
async function answers(t, op, ids) {
	const [resource, operation] = op.split('.');
	const s = SPEC[op];
	assert.ok(s, `${op} has a live contract in ops.spec.js`);
	const params = s.params(ids);
	const keyed = Boolean(s.key);
	const withKey = keyed && Boolean(PROBE_KEY);
	if (s.mode === 'refusal-only') {
		// a write the probe key cannot make for real: the refusal before any row (a key that does not exist)
		const r = await callOp(resource, operation, params, { key: true, as: 'badKey' });
		assert.strictEqual(r.status, 401, `${op}: a key that does not exist is a 401 (got ${r.status} ${r.text?.slice(0, 160)})`);
		assert.ok(isRefusal(r.json), `${op}: the refusal is { ok:false, code, error }`);
		return `${op} → ${r.req.method} ${r.req.url}: 401 ${r.json.code}`;
	}
	const r = await callOp(resource, operation, params, { key: withKey, as: withKey ? 'ok' : 'noKey' });
	const want = [].concat(s.ok.status);
	if (!withKey && r.status === 402 && r.json?.reason === 'past_free_rate') {
		t.diagnostic(`${op}: this address's keyless budget is spent today (402 past_free_rate); set TAIFOON_PROBE_KEY to call it on a key`);
		return `${op} → ${r.req.method} ${r.req.url}: 402 past_free_rate (visitor budget)`;
	}
	if (keyed && !withKey && r.status === 401) {
		assert.ok(isRefusal(r.json), `${op}: the keyless refusal is { ok:false, code, error }`);
		assert.strictEqual(r.json.code, 'unauthorized');
		return `${op} → ${r.req.method} ${r.req.url}: 401 unauthorized (no key)`;
	}
	assert.ok(want.includes(r.status), `${op} → ${r.req.method} ${r.req.url}: ${r.status}, want ${want.join('|')} (${r.text?.slice(0, 200)})`);
	assert.ok(r.json && typeof r.json === 'object', `${op}: a JSON answer`);
	for (const f of s.ok.fields ?? []) assert.ok(r.json[f] !== undefined && r.json[f] !== null, `${op}: ${f} is in the answer`);
	for (const f of s.ok.lists ?? []) assert.ok(Array.isArray(r.json[f]), `${op}: ${f} is a list`);
	for (const x of s.extra ?? []) { const p = x.check(r.json, r.status); if (!x.todo) assert.deepStrictEqual(p, [], `${op}: ${x.why}`); }
	return `${op} → ${r.req.method} ${r.req.url}${r.req.qs && Object.keys(r.req.qs).length ? '?' + new URLSearchParams(r.req.qs) : ''}: ${r.status}`;
}

test('2.2.0: Market, Get Registered (filtered), Get Usage and the listing venues answer the requests the node sends', async (t) => {
	const ids = await sampleIds();
	for (const op of NEW_IN_220()) t.diagnostic(await answers(t, op, ids));
});

test('the hire → settle reads a workflow makes answer the requests the node sends (dry run: nothing is hired or paid)', async (t) => {
	const ids = await sampleIds();
	assert.ok(ids.handshake && ids.settlement, `a live handshake and settlement to read (got ${JSON.stringify({ handshake: ids.handshake, settlement: ids.settlement })})`);
	assert.strictEqual(SPEC['demand.post'].params(ids).demandOptions.dryRun, true, 'the demand is posted as a dry run only');
	for (const op of HIRE_TO_SETTLE) t.diagnostic(await answers(t, op, ids));
});

module.exports = { HIRE_TO_SETTLE };
