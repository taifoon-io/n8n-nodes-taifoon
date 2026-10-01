// The 0.6.0 templates, proven without n8n: each workflow is importable-shaped, every Taifoon node calls an operation the
// built node has, and the sellers' Code nodes are run here (plain node:test) against sample offers, tricky ones included.
// The digest seller's hash is n8n's Crypto node, so only its parsing and its reply are run.
const test = require('node:test');
const assert = require('node:assert');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Taifoon } = require('../dist/nodes/Taifoon/Taifoon.node.js');

const W = (f) => JSON.parse(readFileSync(join(__dirname, '..', 'workflows', f), 'utf8'));
const NEW = ['10-buy-through-taifoon.json', '11-first-run.json', '12-sell-digest.json', '13-sell-json-normalize.json', '14-sell-word-count.json'];
const SELLERS = { '12-sell-digest.json': ['tfn-digest', 'mcp.digest'], '13-sell-json-normalize.json': ['tfn-json-normalize', 'a2a.json_normalize'], '14-sell-word-count.json': ['tfn-word-count', 'chat.word_count'] };
const ADDRESS = '0x21399bEeec163BD3E44CC17CEaA49f3b469D2e99';
const NONCE = 'b58d930e-5327-49a3-9d7e-000000000001';

/** Run a Code node's JS the way n8n does (the body of an async function), with $ / $json stubbed. */
function run(wf, nodeName, { nodes = {}, json = {} } = {}) {
	const code = wf.nodes.find((n) => n.name === nodeName).parameters.jsCode;
	const $ = (name) => {
		if (!(name in nodes)) throw new Error(`node ${name} did not run`);
		return { first: () => ({ json: nodes[name] }), last: () => ({ json: nodes[name] }) };
	};
	const out = new Function('$', '$json', code)($, json);
	assert.ok(Array.isArray(out) && out.length === 1, `${nodeName} returns one item`);
	return out[0].json;
}
const offer = (task, extra = {}) => ({ body: { jobId: null, chain: 36927, client: '0x' + '1'.repeat(40), provider: ADDRESS.toLowerCase(), evaluator: null, verify: ['self'], phase: 'NEGOTIATION', state: 'offer', budget_usdc: 0.05, task, required_skills: [], reply_to: null, nonce: NONCE, ...extra } });

function assertReply(r, status) {
	assert.deepStrictEqual(Object.keys(r).sort(), ['nonce', 'provider', 'result', 'status'], 'the reply is exactly { nonce, provider, status, result }');
	assert.strictEqual(r.nonce, NONCE);
	assert.strictEqual(r.provider, ADDRESS.toLowerCase());
	assert.strictEqual(r.status, status);
	if (status === 'refused') assert.strictEqual(typeof r.result.error, 'string');
	return r.result;
}

// ── structure ──
const built = new Taifoon().description;
const hasOp = (resource, op) => built.properties.some((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource && p.options.some((o) => o.value === op));

for (const f of NEW) {
	test(`${f}: importable, left → right, a note on every node, Taifoon nodes call real operations`, () => {
		const wf = W(f);
		assert.strictEqual(typeof wf.name, 'string');
		assert.strictEqual(wf.active, false);
		assert.deepStrictEqual(wf.settings.executionOrder, 'v1');
		const names = new Set(wf.nodes.map((n) => n.name));
		assert.strictEqual(names.size, wf.nodes.length, 'node names are unique');
		for (const n of wf.nodes) {
			assert.ok(n.id && n.type && n.typeVersion && Array.isArray(n.position), `${n.name} is a full node`);
			assert.ok(typeof n.notes === 'string' && n.notes.includes(' · ') && n.notesInFlow === true, `${n.name} carries a note`);
			assert.ok(wf.meta.taifoon.steps[n.name], `${n.name} is described in meta.taifoon.steps`);
			assert.ok(!n.type.startsWith('CUSTOM.'), 'shipped templates use the package type, not the instance alias');
			if (n.type.includes('taifoon')) {
				assert.strictEqual(n.type, 'n8n-nodes-taifoon.taifoon');
				assert.ok(hasOp(n.parameters.resource, n.parameters.operation), `${n.name}: ${n.parameters.resource}.${n.parameters.operation} exists`);
				if (n.credentials) assert.deepStrictEqual(Object.keys(n.credentials), ['taifoonRelayerApi']);
			}
			if (n.type === 'n8n-nodes-base.code') new Function('$', '$json', n.parameters.jsCode); // parses
		}
		for (const [from, c] of Object.entries(wf.connections)) {
			assert.ok(names.has(from), `connection from ${from}`);
			for (const branch of c.main) for (const to of branch) {
				assert.ok(names.has(to.node), `connection to ${to.node}`);
				const a = wf.nodes.find((n) => n.name === from).position[0], b = wf.nodes.find((n) => n.name === to.node).position[0];
				const loop = from === 'Ended?' && to.node === 'Wait 20 s';
				if (!loop) assert.ok(b > a, `${from} → ${to.node} runs left to right`);
			}
		}
		assert.doesNotMatch(JSON.stringify(wf), /tfr_[A-Za-z0-9_-]{8,}|tfn_live_|-----BEGIN/, 'no key in a template');
	});
}

test('10: the buyer posts a need, polls ≤ 20 times until the demand ends, reads the explorer and attests the settle tx', () => {
	const wf = W('10-buy-through-taifoon.json');
	const by = (n) => wf.nodes.find((x) => x.name === n);
	const need = Object.fromEntries(by('Need').parameters.assignments.assignments.map((a) => [a.name, a.value]));
	assert.deepStrictEqual(need, { need: 'the sha256 digest of the text "hello from n8n"', buyer_label: 'n8n:buy-through-taifoon' });
	assert.strictEqual(by('Post demand').parameters.demandMode, 'need');
	for (const s of ['settled', 'failed', 'unmatched', 'expired']) assert.ok(by('Ended?').parameters.conditions.boolean[0].value1.includes(`'${s}'`), s);
	assert.match(by('Ended?').parameters.conditions.boolean[0].value1, /\$runIndex >= 19/);
	assert.strictEqual(by('Wait 20 s').parameters.amount, 20);
	const nine = JSON.parse(readFileSync(join(__dirname, '..', 'workflows', '9-buy-by-demand.json'), 'utf8')).nodes.find((n) => n.name === 'Verify on chain');
	assert.deepStrictEqual(by('Verify on chain').parameters.claim.txHash, nine.parameters.claim.txHash, 'the settle tx is read as template 9 reads it');
	assert.strictEqual(by('Verify on chain').parameters.claim.chainId, 36927);
	// the receipt on a settled demand, and on one that ended unmatched (no explorer row, no tx)
	const d = { id: 'dm_1', state: 'settled', class: 'mcp.digest', ending: { transition: 'complete', tx: '0x' + 'a'.repeat(64) } };
	const r = run(wf, 'Receipt', { nodes: { 'Get demand': { demand: d }, Explorer: { job: { payee: { address: '0x' + 'b'.repeat(40), whose: 'ours', paid: true }, txs: [] } } }, json: { verdict: 'REAL', summary: 's', checks: [] } });
	assert.strictEqual(r.attestation.verdict, 'REAL');
	assert.strictEqual(r.settle.link, `https://www.taifoon.io/scan/36927/tx/0x${'a'.repeat(64)}`);
	const u = run(wf, 'Receipt', { nodes: { 'Get demand': { demand: { id: 'dm_2', state: 'unmatched', why: 'no seller' } } }, json: {} });
	assert.strictEqual(u.attestation.verdict, 'UNVERIFIED');
	assert.strictEqual(u.settle, null);
});

test('11: first run registers a key, posts a sample demand on the sandbox key, and never echoes a key', () => {
	const wf = W('11-first-run.json');
	const by = (n) => wf.nodes.find((x) => x.name === n);
	assert.strictEqual(by('Wallet').parameters.assignments.assignments[0].value, '0x0000000000000000000000000000000000000000');
	assert.deepStrictEqual([by('Register Free Key').parameters.resource, by('Register Free Key').parameters.operation], ['account', 'register']);
	assert.strictEqual(by('Register Free Key').credentials, undefined, 'no credential yet');
	const p = by('Post sample demand').parameters;
	assert.strictEqual(p.method, 'POST');
	assert.strictEqual(p.url, 'https://coord.taifoon.dev/v1/demands');
	assert.deepStrictEqual(p.headerParameters.parameters, [{ name: 'X-API-Key', value: '={{ $json.keys.sandbox }}' }]);
	assert.deepStrictEqual(JSON.parse(p.jsonBody), { need: 'the sha256 digest of the text "my first Taifoon demand"', buyer_label: 'n8n:first-run' });
	const KEY = 'tfr_free_' + 'x'.repeat(32);
	const out = run(wf, 'Next steps', { nodes: { 'Register Free Key': { api_key: KEY, keys: { live: KEY, sandbox: KEY } } }, json: { ok: true, demand: { id: 'dm_abc', state: 'open' } } });
	assert.strictEqual(out.demand, 'dm_abc');
	assert.strictEqual(out.read, 'https://coord.taifoon.dev/v1/demands/dm_abc');
	assert.ok(out.next_steps.some((s) => /Taifoon Relayer API/.test(s)) && out.next_steps.some((s) => /10-buy-through-taifoon/.test(s)));
	assert.doesNotMatch(JSON.stringify(out), /tfr_/, 'the keys are not in the output');
	assert.doesNotMatch(by('Next steps').parameters.jsCode, /\$\('Register Free Key'\)/, 'the code never reads the keys');
	assert.strictEqual(wf.settings.saveDataSuccessExecution, 'none');
});

// ── the sellers: the card, the webhooks ──
for (const [f, [slug, klass]] of Object.entries(SELLERS)) {
	test(`${f}: Card GET ${slug}-card serves a registration-v1 card of class ${klass}; Hire POST ${slug} always answers 200`, () => {
		const wf = W(f);
		const by = (n) => wf.nodes.find((x) => x.name === n);
		assert.deepStrictEqual([by('Card').parameters.httpMethod, by('Card').parameters.path, by('Card').parameters.responseMode], ['GET', `${slug}-card`, 'responseNode']);
		assert.deepStrictEqual([by('Hire').parameters.httpMethod, by('Hire').parameters.path, by('Hire').parameters.responseMode], ['POST', slug, 'responseNode']);
		assert.strictEqual(by('Respond').parameters.options.responseCode, 200);
		assert.match(by('Respond').parameters.responseBody, /\$json\.reply \|\|/, 'a failed step still answers JSON');
		const card = run(wf, 'Card JSON').card;
		const endpoint = `https://n8n.taifoon.dev/webhook/${slug}`;
		assert.strictEqual(card.type, 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1');
		assert.strictEqual(card.kind, 'n8n');
		assert.strictEqual(card.address, ADDRESS);
		assert.strictEqual(card.endpoint, endpoint);
		assert.deepStrictEqual(card.services, [{ name: 'webhook', endpoint, version: 'taifoon-offer-v1' }]);
		assert.deepStrictEqual(card.classes, [klass]);
		assert.strictEqual(card.price_usdc, 0.05);
		assert.deepStrictEqual(card.verify, ['self']);
		assert.strictEqual(card.taifoon_listing, '');
		assert.deepStrictEqual(card.supportedTrust, ['reputation']);
		assert.ok(card.name && card.description && card.skills.length);
		assert.match(by('Card JSON').parameters.jsCode, /^\/\/ ── set these two[\s\S]*\nconst TAIFOON_LISTING = '';/, 'the nonce constant is at the top');
		if (klass === 'mcp.digest') assert.deepStrictEqual(card.only, { algorithm: ['sha256'] });
		else assert.strictEqual(card.only, undefined);
	});
}

// ── 12: mcp.digest ──
const dg = W('12-sell-digest.json');
const digestTask = (text, tail = true) => `mcp.digest: return the sha256 digest (hex) of the UTF-8 text "${text}".${tail ? ' Other fields beside the digest are allowed in the reply.' : ''}`;
const parse = (body) => run(dg, 'Parse offer', { nodes: { Hire: body } });

test('12: the digest task is parsed to the LAST quote (quotes, newlines and unicode inside the text)', () => {
	for (const [text, tail] of [['hello from n8n', true], ['hello', false], ['say "hi" and "bye"', true], ['line one\nline two', true], ['zażółć gęślą jaźń 🌊 — 漢字', true], ['', true], ['ends with a quote"', false]]) {
		const p = parse(offer(digestTask(text, tail)));
		assert.strictEqual(p.hash, true, JSON.stringify(text));
		assert.strictEqual(p.algorithm, 'sha256');
		assert.strictEqual(p.text, text);
		assert.strictEqual(p.reply, undefined);
	}
	assert.strictEqual(parse(offer('mcp.digest: return the SHA-256 digest (hex) of the UTF-8 text "x".')).algorithm, 'sha256');
});

test('12: keccak256, an unparsable task and an empty body are refused, 200 with { error }', () => {
	assertReply(parse(offer('mcp.digest: return the keccak256 digest (hex) of the UTF-8 text "x".')).reply, 'refused');
	assertReply(parse(offer('mcp.digest: return the keccak-256 digest (hex) of the UTF-8 text "x".')).reply, 'refused');
	assertReply(parse(offer('please hash something')).reply, 'refused');
	const empty = parse({ body: {} }).reply;
	assert.strictEqual(empty.status, 'refused');
	assert.strictEqual(empty.nonce, null);
});

test('12: the liveness probe answers READY and does no work; a class probe does the work', () => {
	const p = parse({ body: { kind: 'taifoon.probe.v1', probe: true, task: 'Taifoon onboarding probe: reply with the single word READY.', nonce: NONCE } });
	assert.strictEqual(assertReply(p.reply, 'delivered'), 'READY');
	assert.notStrictEqual(p.hash, true);
	const c = parse(offer(digestTask('probe text'), { probe: true, class_probe: true }));
	assert.strictEqual(c.hash, true);
	assert.strictEqual(c.text, 'probe text');
});

test('12: the reply carries the Crypto node’s digest as { algorithm, encoding, digest, text }', () => {
	const text = 'say "hi" 🌊';
	const p = parse(offer(digestTask(text)));
	const digest = createHash('sha256').update(text, 'utf8').digest('hex'); // what the Crypto node (SHA256, hex) writes to $json.digest
	const r = run(dg, 'Reply', { nodes: { 'Parse offer': p }, json: { ...p, digest } }).reply;
	assert.deepStrictEqual(assertReply(r, 'delivered'), { algorithm: 'sha256', encoding: 'hex', digest, text });
	const failed = run(dg, 'Reply', { nodes: { 'Parse offer': p }, json: { error: 'boom' } }).reply;
	assertReply(failed, 'refused');
	const refused = parse(offer('nothing'));
	assert.strictEqual(run(dg, 'Reply', { nodes: { 'Parse offer': refused }, json: refused }).reply.status, 'refused');
	const sha = dg.nodes.find((n) => n.name === 'SHA256');
	assert.deepStrictEqual([sha.type, sha.parameters.action, sha.parameters.type, sha.parameters.encoding, sha.parameters.dataPropertyName], ['n8n-nodes-base.crypto', 'hash', 'SHA256', 'hex', 'digest']);
	for (const n of dg.nodes.filter((x) => x.type === 'n8n-nodes-base.code')) assert.doesNotMatch(n.parameters.jsCode, /require\(/, 'no builtins in Code nodes');
});

// ── 13: a2a.json_normalize ──
const jn = W('13-sell-json-normalize.json');
const normTask = (json) => `a2a.json_normalize: return the JSON object ${json} with its keys sorted at every depth, arrays kept in order.`;
const normalize = (body) => run(jn, 'Normalize', { nodes: { Hire: body } }).reply;

test('13: keys sorted at every depth, arrays kept in order (objects inside arrays sorted too)', () => {
	const input = { z: 1, a: { d: [3, 1, { y: 1, b: 2 }], c: null, b: { z: true, a: 'x' } }, m: [{ b: 1, a: 2 }, [{ d: 1, c: 2 }]], 'é': 'ü', A: '"quoted" 🌊' };
	const r = assertReply(normalize(offer(normTask(JSON.stringify(input)))), 'delivered');
	assert.deepStrictEqual(Object.keys(r), ['normalized']);
	assert.strictEqual(JSON.stringify(r.normalized), '{"A":"\\"quoted\\" 🌊","a":{"b":{"a":"x","z":true},"c":null,"d":[3,1,{"b":2,"y":1}]},"m":[{"a":2,"b":1},[{"c":2,"d":1}]],"z":1,"é":"ü"}');
});

test('13: pretty-printed JSON and a value that contains the end phrase still parse', () => {
	const input = { note: 'x with its keys sorted y', b: [2, 1], a: {} };
	const r = assertReply(normalize(offer(normTask(JSON.stringify(input, null, 2)))), 'delivered');
	assert.strictEqual(JSON.stringify(r.normalized), '{"a":{},"b":[2,1],"note":"x with its keys sorted y"}');
});

test('13: not JSON, not an object, or no JSON at all → refused (200, { error })', () => {
	assertReply(normalize(offer(normTask('{a: 1}'))), 'refused');
	assertReply(normalize(offer(normTask('[1,2]'))), 'refused');
	assertReply(normalize(offer(normTask('null'))), 'refused');
	assertReply(normalize(offer('a2a.json_normalize: sort this please')), 'refused');
	assert.strictEqual(assertReply(normalize({ body: { kind: 'taifoon.probe.v1', probe: true, nonce: NONCE } }), 'delivered'), 'READY');
});

// ── 14: chat.word_count ──
const wcw = W('14-sell-word-count.json');
const wcTask = (text) => `chat.word_count: Count the words in: "${text}" (reply with the number of words)`;
const count = (body) => run(wcw, 'Count', { nodes: { Hire: body } }).reply;

test('14: words = runs of non-whitespace, between the first opening and the last closing phrase', () => {
	const cases = [
		['hello world', 2],
		['  leading and   trailing  ', 3],
		['tabs\tand\nnewlines\r\nhere', 4],
		['she said "hi" (reply later) to me', 7],
		['nested " (reply inside', 4],
		['zażółć gęślą jaźń 🌊', 4],
		['one', 1],
		['', 0],
		['   ', 0],
		['Count the words in: "inner"', 5],
	];
	for (const [text, n] of cases) {
		const r = assertReply(count(offer(wcTask(text))), 'delivered');
		assert.deepStrictEqual(r, { words: n }, JSON.stringify(text));
		assert.deepStrictEqual(Object.keys(r), ['words'], 'the result carries no other number');
	}
});

test('14: no text → refused; the liveness probe → READY', () => {
	assertReply(count(offer('chat.word_count: how many words?')), 'refused');
	assertReply(count({ body: { nonce: NONCE } }), 'refused');
	assert.strictEqual(assertReply(count({ body: { kind: 'taifoon.probe.v1', probe: true, task: 'Taifoon onboarding probe: reply with the single word READY.', nonce: NONCE } }), 'delivered'), 'READY');
});
