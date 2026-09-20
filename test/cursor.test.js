// The trigger's memory. Both rules here were learned by getting them wrong against the live API.
const test = require('node:test');
const assert = require('node:assert');
const { initialCursor, takeFresh } = require('../dist/nodes/TaifoonTrigger/cursor.js');

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
