// The gate: every operation the node ships has a live contract (test/live/ops.spec.js), every contract names an operation
// the node ships, and the operations removed in 0.6.1 (the /v1/harvest reads, ours only since 2026-10-01) stay removed.
// Offline: it reads the built node description only, so it runs on every PR (npm test, judge/gates.sh).
const test = require('node:test');
const assert = require('node:assert/strict');
const { operations, buildRequest } = require('./live/node-request');
const { SPEC, REMOVED } = require('./live/ops.spec');

const shipped = operations().map((o) => `${o.resource}.${o.operation}`);

test('every shipped operation has a live contract', () => {
	assert.deepEqual(shipped.filter((id) => !SPEC[id]), [], 'operations with no entry in test/live/ops.spec.js');
});

test('every contract names an operation the node ships', () => {
	assert.deepEqual(Object.keys(SPEC).filter((id) => !shipped.includes(id)), []);
});

test('the harvest operations are gone, and no operation calls /harvest', () => {
	for (const id of REMOVED) assert.ok(!shipped.includes(id), `${id} is shipped again`);
	const harvest = operations().filter((o) => /\/harvest\b/.test(String(o.url)));
	assert.deepEqual(harvest, []);
});

test('each contract is complete: a mode, a budget, refusals, and a gap note on every refusal-only write', () => {
	for (const [id, s] of Object.entries(SPEC)) {
		assert.ok(['read', 'plan', 'dry-run', 'idempotent', 'refusal-only'].includes(s.mode), `${id}: mode`);
		assert.ok(Number.isFinite(s.budgetMs) && s.budgetMs > 0, `${id}: budgetMs`);
		assert.ok(Array.isArray(s.refusals), `${id}: refusals`);
		if (s.mode === 'refusal-only') { assert.ok(s.gap, `${id}: a refusal-only op names its gap`); assert.ok(s.refusals.length > 0, `${id}: at least one refusal`); }
		for (const r of s.refusals) assert.ok(r.status.every((x) => x >= 400 && x < 500), `${id}: a refusal is a 4xx`);
	}
});

test('every operation builds a request from its contract parameters (no throw, the node’s own headers)', async () => {
	const ids = { catalog: 'cat_x', listing: 'ls_0000000000000000', demand: 'dm_x', handshake: 'hs_x', settlement: '0x' + '0'.repeat(64), completionJob: '1', traceJob: '1' };
	for (const o of operations()) {
		const s = SPEC[`${o.resource}.${o.operation}`];
		const req = await buildRequest(o.resource, o.operation, s.params(ids));
		assert.equal(req.method, o.method);
		assert.match(req.headers['X-Taifoon-Client'], /^n8n-nodes-taifoon\/\d+\.\d+\.\d+$/);
		assert.ok(!/\{\{|undefined/.test(req.url), `${o.resource}.${o.operation}: url ${req.url}`);
	}
});
