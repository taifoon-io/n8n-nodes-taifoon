// Every route the node calls must exist in the LIVE OpenAPI document, with the same method.
//
// The previous version of this package called 17 endpoints, of which 2 existed. Nothing caught it,
// because nothing checked. This test walks the built node description, collects every request it can
// make, and looks each one up in https://www.taifoon.io/v1/openapi.json.
const test = require('node:test');
const assert = require('node:assert');
const { Taifoon } = require('../../dist/nodes/Taifoon/Taifoon.node.js');

const BASE = process.env.TAIFOON_BASE || 'https://www.taifoon.io';

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
			out.push({ op: `${resource}.${o.value}`, method: req.method.toLowerCase(), path });
		}
	}
	return out;
}

test('the node declares a sensible number of operations', () => {
	const ops = collect();
	assert.ok(ops.length >= 25, `only ${ops.length} operations found`);
});

test('every operation exists in the live OpenAPI document', async () => {
	const res = await fetch(`${BASE}/v1/openapi.json`);
	assert.strictEqual(res.status, 200, 'openapi.json must be served');
	const spec = await res.json();
	const live = new Set();
	for (const [p, methods] of Object.entries(spec.paths))
		for (const m of Object.keys(methods)) live.add(`${m} ${p.replace(/^\/v1/, '').replace(/\{[^}]+\}/g, '{x}')}`);

	const missing = collect().filter((o) => !live.has(`${o.method} ${o.path}`));
	assert.deepStrictEqual(missing, [], `operations with no matching route in the live API:\n${missing.map((m) => `  ${m.op} → ${m.method.toUpperCase()} ${m.path}`).join('\n')}`);
});

test('the credential test endpoint exists and refuses a bad key', async () => {
	const res = await fetch(`${BASE}/v1/relayer/whoami`, { headers: { 'x-api-key': 'tfr_not_a_real_key' } });
	assert.strictEqual(res.status, 401, 'a bad key must be a 401 so n8n reports the credential as invalid');
});
