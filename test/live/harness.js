// Shared by ops.test.js and measure.mjs: the sample ids, the credentials, and one call of an op as the node builds it.
'use strict';
const { buildRequest, send } = require('./node-request');

const BASE = (process.env.TAIFOON_BASE || 'https://coord.taifoon.dev').replace(/\/+$/, '') + '/v1';
/** the test key (a relayer key the layer counts as its own probe): X-API-Key on keyed ops, x-taifoon-probe on keyless ones,
 *  so every test call is counted as the layer's own traffic and never as a customer's */
const PROBE_KEY = (process.env.TAIFOON_PROBE_KEY || '').trim();
// a key-shaped value that is no key (built in two parts so no scanner mistakes this line for a key)
const BAD_KEY = 'tfr' + '_n8n_contract_test_not_a_real_key_0000';

let idsMemo = null;
/** Sample ids read live from the list operations, so the single-record reads always name a record that exists. */
async function sampleIds() {
	if (idsMemo) return idsMemo;
	const get = async (p) => { try { const r = await fetch(`${BASE}/${p}`, { headers: { accept: 'application/json', ...(PROBE_KEY ? { 'x-taifoon-probe': PROBE_KEY } : {}) }, signal: AbortSignal.timeout(30_000) }); return r.ok ? r.json() : null; } catch { return null; } };
	const [cat, ls, dm, st, rv, lg] = await Promise.all([get('catalog?limit=1'), get('listings?limit=1'), get('demands?limit=5&state=settled'), get('settle'), get('grid/review'), get('agents/ledger?limit=20')]);
	const demand = dm?.demands?.find((d) => d.handshake_id) ?? dm?.demands?.[0];
	idsMemo = {
		catalog: cat?.rows?.[0]?.id ?? null,
		listing: ls?.rows?.[0]?.id ?? null,
		demand: demand?.id ?? null,
		handshake: demand?.handshake_id ?? null,
		settlement: st?.settlements?.[0]?.id ?? null,
		completionJob: demand?.job_id ?? '81067',
		traceJob: rv?.jobs?.[0]?.id ?? '81067',
		// a recent Base transaction (the newest ledger job's last tx): inside the headers the producer retains, so its proof is
		// served or pending, never the permanent gap (409) an old block now is
		baseTx: (lg?.jobs ?? []).map((j) => j.last_tx).find((t) => /^0x[0-9a-f]{64}$/i.test(String(t ?? ''))) ?? null,
	};
	return idsMemo;
}

/**
 * Call one op the way the node does. `as`: 'ok' (the op's credential rule), 'noKey', 'badKey'.
 * Every call carries the probe key in x-taifoon-probe, so the layer counts it (and a refused bad key) as ours.
 */
async function callOp(resource, operation, params, { key, as = 'ok', method } = {}) {
	const apiKey = as === 'badKey' ? BAD_KEY : as === 'noKey' ? null : key ? PROBE_KEY : null;
	const req = await buildRequest(resource, operation, params, apiKey ? { apiKey } : {});
	// every call carries the probe, the bad-key refusals included: a key that does not exist is then counted as ours too
	const extra = PROBE_KEY ? { 'x-taifoon-probe': PROBE_KEY } : {};
	let r;
	try { r = await send(req, { base: BASE, extraHeaders: extra, method }); }
	catch (e) { r = { status: 0, error: String(e?.message ?? e), ms: NaN, bytes: 0, json: null, text: '', type: '' }; }
	return { req, ...r };
}

module.exports = { BASE, PROBE_KEY, BAD_KEY, sampleIds, callOp };
