#!/usr/bin/env node
// Derive each live n8n operation's response shape (top-level fields, their JSON types, which are always present and which
// may be null) from N live answers, and print it as the TypeScript table the layer's /v1/openapi.json declares
// (the layer's src/lib/openapi-shapes.generated.ts). Run after a deliberate change to a response; the op tests then hold the live
// answers to the declared shape.
//   TAIFOON_PROBE_KEY=… node test/live/shapes.mjs [--runs 3] > …/openapi-shapes.generated.ts
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { operations } = require('./node-request.js');
const { SPEC } = require('./ops.spec.js');
const { BASE, sampleIds, callOp } = require('./harness.js');
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1] || 3);
const oa = await (await fetch(`${BASE}/openapi.json`)).json();
const opName = (method, url) => {
	const p = '/v1' + url.replace(/^=/, '').replace(/\{\{[^}]+\}\}/g, '{x}');
	for (const [k, ms] of Object.entries(oa.paths)) if (k.replace(/\{[^}]+\}/g, '{x}') === p && ms[method.toLowerCase()]) return k.replace(/^\/v1\//, '').replace(/\{([^}]+)\}/g, ':$1');
	return null;
};
// A field seen only as null in the sample has no observed type: its declared type, from the handler (null = absent / not yet).
const NULL_AS = {
	first_seen: 'integer', last_seen: 'integer', capability: 'object', state: 'string', budget_usdc: 'number', onchain: 'object',
	devnet_feedback: 'object', chainsCovered: 'integer', buyer: 'string', seller: 'string', kind: 'string', price: 'string', token: 'string',
	tenant: 'string', operator_decision_id: 'string', pool: 'string',
	// a handshake whose job settled on chain has no next step (_HS_ATTACH_v1_)
	next: 'object',
};
// Operations that answer in more than one form, whose sample may show only one: their declared shape is the union, required
// only what every form carries. GET proof/tx answers the proof, or the pending answer while the producer builds it.
const MULTI_FORM = {
	// GET judge/trace answers the job and its seller's record from the observatory, or null for both when the observatory keeps
	// no row for the job (an assurance-hook job on a chain it does not index, an unknown id): the trail and det still answer
	'GET judge/trace/:chain/:jobId': { status: [200], props: { chain: 'integer', contract: 'string', det: 'object', devnet_feedback: 'object?', events: 'array', explorer_contract: 'string', get_key: 'object', how: 'string', jev: 'object', job: 'object?', job_id: 'string', ok: 'boolean', read_at: 'string', registry_stamps: 'object', seller_record: 'object?', window: 'object' }, required: ['chain', 'contract', 'det', 'events', 'explorer_contract', 'how', 'jev', 'job_id', 'ok', 'read_at', 'registry_stamps', 'window'] },
	'GET proof/tx/:chain/:tx': { status: [200], props: { batch_id: 'integer?', blob: 'object', block_hash: 'string', block_number: 'integer', chain_id: 'integer', checks: 'object', finality_block: 'integer?', finalized_block_hash: 'string?', is_finalized: 'boolean', last_anchor: 'object?', ok: 'boolean', pending_proof: 'boolean', proof_state: 'string', retry: 'string', retry_after_seconds: 'integer', source: 'string', super_root_hash: 'string?', tx: 'string', verifiable_block: 'integer?' }, required: ['block_hash', 'block_number', 'chain_id', 'checks', 'is_finalized', 'ok', 'source', 'tx'] },
};
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const ids = await sampleIds();
const out = {};
for (const op of operations()) {
	const s = SPEC[`${op.resource}.${op.operation}`];
	if (!s || s.mode === 'refusal-only') continue;
	const name = opName(op.method, op.url);
	if (!name) continue;
	const seen = {}; let n = 0; const statuses = new Set();
	for (let i = 0; i < RUNS; i++) {
		const r = await callOp(op.resource, op.operation, s.params(ids), { key: s.key });
		statuses.add(r.status);
		if (r.status >= 300 || !r.json || typeof r.json !== 'object' || Array.isArray(r.json)) continue;
		n++;
		for (const [k, v] of Object.entries(r.json)) (seen[k] ??= { types: new Set(), count: 0 }).count++, seen[k].types.add(typeOf(v));
	}
	if (!n) { process.stderr.write(`skip ${op.method} ${name}: no 2xx JSON object (${[...statuses]})\n`); continue; }
	const key = `${op.method} ${name}`;
	const props = {}; const required = [];
	for (const [k, { types, count }] of Object.entries(seen).sort(([a], [b]) => a.localeCompare(b))) {
		const t = [...types].filter((x) => x !== 'null'); const nullable = types.has('null');
		if (!t.length && NULL_AS[k]) t.push(NULL_AS[k]);
		props[k] = (t.length === 1 ? t[0] : t.length === 0 ? 'null' : t.sort().join('|')) + (nullable && t.length ? '?' : '');
		if (count === n && !nullable && k !== 'get_key') required.push(k);
	}
	out[key] = { status: [...statuses].filter((x) => x < 300).sort(), props, required };
}
// fields a sample may show filled that the handler sets to null in another state (a settled handshake has no next step)
const NULLABLE = { 'GET handshake/:id': ['next'] };
for (const [k, fs] of Object.entries(NULLABLE)) if (out[k]) for (const f of fs) { if (out[k].props[f] && !out[k].props[f].endsWith('?')) out[k].props[f] += '?'; out[k].required = out[k].required.filter((x) => x !== f); }
Object.assign(out, MULTI_FORM);
const lines = Object.entries(out).map(([k, v]) => `  ${JSON.stringify(k)}: { status: ${JSON.stringify(v.status)}, props: ${JSON.stringify(v.props)}, required: ${JSON.stringify(v.required)} },`);
process.stdout.write(`// GENERATED by n8n-nodes-taifoon test/live/shapes.mjs from live answers (${new Date().toISOString().slice(0, 10)}) — do not
// edit by hand; regenerate after a deliberate change to a response. Each n8n node operation's 2xx body: its top-level fields
// and JSON types ("x?" = may be null, "a|b" = either), and the fields always present and never null (required).
// /v1/openapi.json declares these (_N8N_OPS_CONTRACT_v1_); the node's op tests (test/live/ops.test.js) hold every live answer to them.
export type Shape = { status: number[]; props: Record<string, string>; required: string[] };
export const N8N_OP_SHAPES: Record<string, Shape> = {
${lines.join('\n')}
};
`);
