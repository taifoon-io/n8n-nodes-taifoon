// The trigger's memory. Both rules here were learned by getting them wrong against the live API.
const test = require('node:test');
const assert = require('node:assert');
const { initialCursor, takeFresh, takeFreshOffers } = require('../dist/nodes/TaifoonTrigger/cursor.js');

const job = (id, status, updatedAt) => ({ id, status, updatedAt });

test('a job is emitted once per (id, status), not once per id', () => {
	const state = {};
	const seen = [];
	for (const s of ['open', 'open', 'done']) seen.push(...takeFresh(state, [job('7', s, 1)], 1000).map((j) => j.status));
	// funded → submitted are both "open" and collapse; "done" is a NEW fact and must come through.
	assert.deepStrictEqual(seen, ['open', 'done']);
});

test('keying on id alone would have dropped the completion', () => {
	const state = {};
	takeFresh(state, [job('7', 'open', 1)], 1000);
	const next = takeFresh(state, [job('7', 'done', 2)], 2000);
	assert.strictEqual(next.length, 1, 'the completion is the fact most workflows exist to catch');
});

test('an identical batch re-delivered is dropped entirely', () => {
	const state = {};
	const batch = [job('a', 'done', 1), job('b', 'expired', 1)];
	assert.strictEqual(takeFresh(state, batch, 1000).length, 2);
	assert.strictEqual(takeFresh(state, batch, 2000).length, 0);
});

test('first run starts an hour back unless backfill is asked for', () => {
	assert.strictEqual(initialCursor(3_600_000 * 10, false), String(36000 - 3600));
	assert.strictEqual(initialCursor(3_600_000 * 10, true), '0');
});

test('the dedupe map is pruned by age once it grows large, never below what is recent', () => {
	const state = { seen: {} };
	const old = 1_000, now = old + 8 * 24 * 3600 * 1000;
	for (let i = 0; i < 5001; i++) state.seen[`old${i}:done`] = old;
	takeFresh(state, [job('fresh', 'done', 1)], now);
	assert.ok(Object.keys(state.seen).length < 10, 'week-old entries are gone');
	assert.ok(state.seen['fresh:done'], 'the entry just recorded survives the prune');
});

// ── the seller's inbox (event Offer to My Seller Address): no cursor, newest first ──
const NOW = Date.parse('2026-11-16T12:00:00.000Z');
const offer = (id, state, updated) => ({ handshake_id: id, state, created_at: '2026-11-16T09:00:00.000Z', updated_at: updated });

test('an offer is emitted once per (offer, state), oldest first, and the inbox read again emits nothing', () => {
	const state = {};
	const inbox = [offer('hs_b', 'NOTIFIED', '2026-11-16T11:50:00.000Z'), offer('hs_a', 'OPEN', '2026-11-16T11:40:00.000Z')];
	assert.deepStrictEqual(takeFreshOffers(state, inbox, NOW, false).map((o) => o.handshake_id), ['hs_a', 'hs_b']);
	assert.deepStrictEqual(takeFreshOffers(state, inbox, NOW + 60_000, false), []);
	// hs_b is answered: a new fact about the same offer
	const later = [offer('hs_b', 'DELIVERED', '2026-11-16T12:00:30.000Z'), inbox[1]];
	assert.deepStrictEqual(takeFreshOffers(state, later, NOW + 120_000, false).map((o) => `${o.handshake_id}:${o.state}`), ['hs_b:DELIVERED']);
	assert.ok(!('id' in later[0]) && !('status' in later[0]), 'the rows are emitted as the API answered them');
});

test('the first poll keeps the last hour (all with backfill), and the floor stays where the first poll set it', () => {
	const old = offer('hs_old', 'DELIVERED', '2026-11-16T10:00:00.000Z');
	const recent = offer('hs_new', 'OPEN', '2026-11-16T11:30:00.000Z');
	const state = {};
	assert.deepStrictEqual(takeFreshOffers(state, [recent, old], NOW, false).map((o) => o.handshake_id), ['hs_new']);
	assert.strictEqual(state.offerFloor, NOW - 3600_000);
	// a day later the floor has not moved: an old offer that moves on is news again
	assert.deepStrictEqual(takeFreshOffers(state, [offer('hs_old', 'PRICED', '2026-11-17T12:00:00.000Z')], NOW + 86_400_000, false).map((o) => o.state), ['PRICED']);
	const all = {};
	assert.deepStrictEqual(takeFreshOffers(all, [recent, old], NOW, true).map((o) => o.handshake_id), ['hs_old', 'hs_new']);
	assert.strictEqual(all.offerFloor, 0);
});

test('a row without a handshake id is never emitted; offers and jobs share one dedupe map without colliding', () => {
	const state = {};
	assert.deepStrictEqual(takeFreshOffers(state, [{ state: 'OPEN', updated_at: '2026-11-16T11:59:00.000Z' }, null], NOW, true), []);
	takeFresh(state, [{ id: 'hs_x', status: 'OPEN', updatedAt: 1 }], NOW);
	assert.deepStrictEqual(takeFreshOffers(state, [offer('hs_x', 'OPEN', '2026-11-16T11:59:00.000Z')], NOW, true).length, 1);
});

// ── the trigger's poll for offers, with n8n's poll context stubbed: which request, keyed or not, and what is emitted ──
const { TaifoonTrigger } = require('../dist/nodes/TaifoonTrigger/TaifoonTrigger.node.js');
function pollCtx({ params, mode = 'trigger', credential = false, answer, state = {} }) {
	const calls = [];
	const reply = async (o) => { calls.push(o); return typeof answer === 'function' ? answer(o) : answer; };
	return { calls, state, ctx: {
		getNodeParameter: (k, d) => (k in params ? params[k] : d),
		getMode: () => mode,
		getWorkflowStaticData: () => state,
		getNode: () => ({ name: 'Taifoon Trigger', credentials: credential ? { taifoonRelayerApi: { id: '1', name: 'Taifoon Relayer API' } } : undefined }),
		helpers: {
			httpRequest: async (o) => reply({ ...o, keyed: false }),
			httpRequestWithAuthentication: async function (cred, o) { return reply({ ...o, keyed: cred }); },
			returnJsonArray: (a) => a.map((json) => ({ json })),
		},
	} };
}

test('the offer poll reads GET /v1/handshake?provider= (keyed when a credential is attached) and emits each offer once per state', async () => {
	const a = '0x' + 'ab'.repeat(20);
	const now = new Date().toISOString();
	const answer = { ok: true, count: 2, handshakes: [{ handshake_id: 'hs_2', state: 'DELIVERED', updated_at: now }, { handshake_id: 'hs_1', state: 'OPEN', updated_at: now }] };
	const run = pollCtx({ params: { event: 'offer', address: ` ${a} `, options: {} }, credential: true, answer });
	const out = await new TaifoonTrigger().poll.call(run.ctx);
	assert.deepStrictEqual(run.calls.map((c) => [c.method, c.url, c.qs, c.keyed]), [['GET', 'https://coord.taifoon.dev/v1/handshake', { provider: a, limit: 200 }, 'taifoonRelayerApi']]);
	assert.deepStrictEqual(out[0].map((i) => i.json.handshake_id), ['hs_2', 'hs_1']);
	assert.strictEqual(await new TaifoonTrigger().poll.call(run.ctx), null, 'nothing new on the next poll');
	const keyless = pollCtx({ params: { event: 'offer', address: a, options: {} }, answer });
	await new TaifoonTrigger().poll.call(keyless.ctx);
	assert.strictEqual(keyless.calls[0].keyed, false);
});

test('the offer poll: a manual test shows the newest five and consumes nothing; a short address and an unexpected answer are errors', async () => {
	const a = '0x' + 'ab'.repeat(20);
	const rows = Array.from({ length: 7 }, (_, i) => ({ handshake_id: `hs_${i}`, state: 'OPEN', updated_at: new Date().toISOString() }));
	const manual = pollCtx({ params: { event: 'offer', address: a, options: {} }, mode: 'manual', answer: { ok: true, handshakes: rows } });
	const out = await new TaifoonTrigger().poll.call(manual.ctx);
	assert.deepStrictEqual([out[0].length, manual.state], [5, {}]);
	await assert.rejects(new TaifoonTrigger().poll.call(pollCtx({ params: { event: 'offer', address: '0xab…cd', options: {} }, answer: {} }).ctx), /full 20-byte address/);
	await assert.rejects(new TaifoonTrigger().poll.call(pollCtx({ params: { event: 'offer', address: a, options: {} }, answer: { ok: false, code: 'payment_required' } }).ctx), /unexpected response for \/v1\/handshake/);
});

test('the job poll is unchanged: GET /v1/jobs with status, seller and since, keyless without a credential', async () => {
	const a = '0x' + 'ab'.repeat(20);
	const run = pollCtx({ params: { event: 'open', watch: 'seller', address: a, options: {} }, answer: { ok: true, jobs: [], cursor: '5', more: false } });
	assert.strictEqual(await new TaifoonTrigger().poll.call(run.ctx), null);
	const c = run.calls[0];
	assert.deepStrictEqual([c.url, c.qs.status, c.qs.seller, c.qs.limit, c.keyed], ['https://coord.taifoon.dev/v1/jobs', 'open', a, 50, false]);
	assert.strictEqual(run.state.cursor, '5');
});
