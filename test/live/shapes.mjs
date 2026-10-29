#!/usr/bin/env node
// Derive each live n8n operation's response shape (top-level fields, their JSON types, which are always present and which
// may be null) from N live answers, and print it as the TypeScript table the layer's /v1/openapi.json declares
// (the layer's src/lib/openapi-shapes.generated.ts). Run after a deliberate change to a response; the op tests then hold the live
// answers to the declared shape.
//   TAIFOON_PROBE_KEY=… node test/live/shapes.mjs [--runs 3] [--keep <the current table>] > …/openapi-shapes.generated.ts
//   … [--only "GET access/agreements"[,…]]   sample only those operations (their lines, to add to the table)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { operations } = require('./node-request.js');
const { SPEC } = require('./ops.spec.js');
const { BASE, sampleIds, callOp } = require('./harness.js');
const RUNS = Number(process.argv[process.argv.indexOf('--runs') + 1] || 3);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
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
	// a key with no low-balance threshold (GET access/key): { under_grid, now } once one is set
	low_balance: 'object',
	// a key that inherits no agreement from a reseller (GET access/agreements): { reseller, keys } on a child key
	inherited_from: 'object',
	// agents/cards on the harvester path: the crawl's window and registry
	window_blocks: 'integer', registry: 'string',
};
// Operations that answer in more than one form, whose sample may show only one: their declared shape is the union, required
// only what every form carries. GET proof/tx answers the proof, or the pending answer while the producer builds it.
const MULTI_FORM = {
	// the OpenAI chat.completion object (_OPENAI_GATE_v1_): declared by the standard, so the table never depends on a sample (a probe key
	// that spent its free answers for the day gets 402, and the run would drop it); taifoon carries the sale and the serving listing
	'POST chat/completions': { status: [200], props: { choices: 'array', created: 'integer', id: 'string', model: 'string', object: 'string', taifoon: 'object', usage: 'object' }, required: ['choices', 'created', 'id', 'model', 'object'] },
	// GET judge/trace answers the job and its seller's record from the observatory, or null for both when the observatory keeps
	// no row for the job (an assurance-hook job on a chain it does not index, an unknown id): the trail and det still answer
	'GET judge/trace/:chain/:jobId': { status: [200], props: { chain: 'integer', contract: 'string', det: 'object', devnet_feedback: 'object?', events: 'array', explorer_contract: 'string', get_key: 'object', how: 'string', jev: 'object', job: 'object?', job_id: 'string', ok: 'boolean', read_at: 'string', registry_stamps: 'object', seller_record: 'object?', window: 'object' }, required: ['chain', 'contract', 'det', 'events', 'explorer_contract', 'how', 'jev', 'job_id', 'ok', 'read_at', 'registry_stamps', 'window'] },
	'GET proof/tx/:chain/:tx': { status: [200], props: { batch_id: 'integer?', proof: 'object?', blob: 'object', block_hash: 'string', block_number: 'integer', chain_id: 'integer', checks: 'object', finality_block: 'integer?', finalized_block_hash: 'string?', is_finalized: 'boolean', last_anchor: 'object?', ok: 'boolean', pending_proof: 'boolean', proof_state: 'string', retry: 'string', retry_after_seconds: 'integer', source: 'string', super_root_hash: 'string?', tx: 'string', verifiable_block: 'integer?' }, required: ['block_hash', 'block_number', 'chain_id', 'checks', 'is_finalized', 'ok', 'source', 'tx'] },
};
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
const ids = await sampleIds();
const out = {};
for (const op of operations()) {
	const s = SPEC[`${op.resource}.${op.operation}`];
	if (!s || s.mode === 'refusal-only') continue;
	const name = opName(op.method, op.url);
	if (!name || (ONLY && !ONLY.includes(`${op.method} ${name}`))) continue;
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
// (a key with no low-balance threshold set answers low_balance: null)
// _PLAN_NULLABLE_v1_: GET access/key answers plan: null for a key that never held a plan (planStanding: no plan, no last plan, no
// free agreement because it holds a credited balance); the probe key is such a key since 2026-10-29.
// _CARDS_NULLABLE_v1_: agents/cards answers from a live Base crawl when the harvester feed is unreachable, and says reasons_unreadable and
// skills_seen_total are null there (it cannot know them); the samples rarely catch that path, so it is declared here. The other way
// round, window_blocks and registry (the crawl's window and the registry it read) are null on the harvester path.
const NULLABLE = { 'GET handshake/:id': ['next'], 'GET access/key': ['low_balance', 'plan'], 'GET agents/cards': ['reasons_unreadable', 'skills_seen_total', 'window_blocks', 'registry'],
	'GET access/agreements': ['inherited_from'] };
// money is a decimal: a sample of whole prices must not declare an integer (GET agents/market price_min was 1 on 2026-10-01)
const MONEY = /^(price|usdc)(_|$)|_usdc$/;
for (const v of Object.values(out)) for (const [f, t] of Object.entries(v.props)) if (MONEY.test(f)) v.props[f] = t.replace(/\binteger\b/, 'number');
for (const [k, fs] of Object.entries(NULLABLE)) if (out[k]) for (const f of fs) { if (out[k].props[f] && !out[k].props[f].endsWith('?')) out[k].props[f] += '?'; out[k].required = out[k].required.filter((x) => x !== f); }
// --keep <the table now declared>: a few samples can widen a declaration, never narrow it. A field the table says may be null
// stays so (the sample just did not show it null), and a field seen only as null keeps its declared type.
const keepAt = process.argv.indexOf('--keep');
if (keepAt > 0) {
	const { readFileSync } = await import('node:fs');
	const prev = {}; const prevRequired = {};
	for (const m of readFileSync(process.argv[keepAt + 1], 'utf8').matchAll(/^\s+"([^"]+)": \{ status: \[[^\]]*\], props: (\{.*?\}), required: (\[.*?\]) \},$/gm)) { prev[m[1]] = JSON.parse(m[2]); prevRequired[m[1]] = JSON.parse(m[3]); }
	for (const [k, v] of Object.entries(out)) for (const [f, t] of Object.entries(v.props)) {
		const was = prev[k]?.[f];
		if (!was) continue;
		// seen only as null (NULLABLE may already have marked it "null?"): the declared type, may be null
		if (t.replace(/\?$/, '') === 'null') v.props[f] = was.endsWith('?') ? was : `${was}?`;
		else if (was.endsWith('?') && !t.endsWith('?')) v.props[f] = `${t}?`;
		if (v.props[f].endsWith('?')) v.required = v.required.filter((x) => x !== f);
	}
	// a field the table did not declare is new: a few samples of one kind of record cannot prove every record carries it
	for (const [k, v] of Object.entries(out)) if (prev[k]) v.required = v.required.filter((f) => prev[k][f] !== undefined);
	// nor that a field the table lets be absent is always there (agents/cards: the crawl path carries fewer fields than the feed)
	for (const [k, v] of Object.entries(out)) if (prevRequired[k]) v.required = v.required.filter((f) => prevRequired[k].includes(f));
}
if (!ONLY) Object.assign(out, MULTI_FORM);
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
