// The node is declarative: what it does IS its description. These pin the settlement step of a hire.
const test = require('node:test');
const assert = require('node:assert');
const { Taifoon } = require('../dist/nodes/Taifoon/Taifoon.node.js');

const d = new Taifoon().description;
const ops = (resource) => d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource).options;
const prop = (name) => d.properties.find((p) => p.name === name);
const route = (resource, op) => ops(resource).find((o) => o.value === op).routing.request;

test('Settlement is a resource, its three operations hit /v1/settle and nothing else', () => {
	assert.ok(prop('resource').options.some((o) => o.value === 'settlement'));
	assert.deepStrictEqual(route('settlement', 'settle'), { method: 'POST', url: '/settle' });
	assert.deepStrictEqual(route('settlement', 'getAll'), { method: 'GET', url: '/settle' });
	assert.deepStrictEqual(route('settlement', 'get'), { method: 'GET', url: '=/settle/{{$parameter.settlementId}}' });
	assert.strictEqual(ops('settlement').find((o) => o.value === 'settle').name, 'Settle');
});

test('Settle sends exactly the body POST /v1/settle reads: kind, chainId, buyer, seller, price, evidence, ref.id', () => {
	const sent = {};
	for (const p of d.properties) {
		const on = p.displayOptions && p.displayOptions.show && p.displayOptions.show.resource && p.displayOptions.show.resource[0] === 'settlement' && (p.displayOptions.show.operation || []).includes('settle');
		if (!on) continue;
		if (p.routing && p.routing.send) sent[p.routing.send.property] = p;
		if (p.type === 'collection') for (const o of p.options) sent[o.routing.send.property] = o;
	}
	const required = ['kind', 'chainId', 'buyer', 'seller', 'price', 'evidence', 'ref.id'];
	for (const k of required) assert.ok(sent[k] && sent[k].required, `${k} is sent and required`);
	for (const k of ['ref.endpoint', 'ref.note', 'premium', 'deposit', 'deadline', 'pool', 'hook', 'token', 'tenant']) assert.ok(sent[k] && !sent[k].required, `${k} is an optional body field`);
	assert.deepStrictEqual(Object.keys(sent).sort(), [...required, 'ref.endpoint', 'ref.note', 'premium', 'deposit', 'deadline', 'pool', 'hook', 'token', 'tenant'].sort(), 'no field the route would ignore');
});

test('the three kinds are the layer’s three, and the devnet (free gas) is the default chain', () => {
	assert.deepStrictEqual(prop('kind').options.map((o) => o.value).sort(), ['agent', 'jev', 'resource']);
	assert.strictEqual(prop('kind').default, 'agent');
	const chain = d.properties.find((p) => p.name === 'chainId' && p.displayOptions.show.resource[0] === 'settlement');
	assert.strictEqual(chain.default, 36927);
	assert.deepStrictEqual(chain.options.map((o) => o.value), [8453, 5042, 36927]);
});

test('optional settle fields are omitted when empty, never sent as ""', () => {
	const coll = d.properties.find((p) => p.name === 'settleOptions');
	for (const o of coll.options) assert.match(o.routing.send.value, /\$value \|\| undefined/, `${o.name} drops its empty value`);
});

test('the relayer credential is offered on Completion, Judge, Settlement, Handshake, Job, Demand and Account, and stays optional', () => {
	assert.strictEqual(d.credentials.length, 1);
	assert.strictEqual(d.credentials[0].required, false, 'a required credential breaks every public read (found by running the node)');
	assert.deepStrictEqual(d.credentials[0].displayOptions.show.resource, ['completion', 'judge', 'settlement', 'handshake', 'job', 'demand', 'account']);
});

test('Judge → Submit Review: the owner is optional once bound, and the binding signature rides as owner_signature', () => {
	assert.notStrictEqual(prop('reviewOwner').required, true);
	assert.strictEqual(prop('reviewOwner').routing.send.property, 'owner');
	assert.strictEqual(prop('reviewOwnerSignature').routing.send.property, 'owner_signature');
	assert.deepStrictEqual(prop('reviewOwnerSignature').displayOptions.show.operation, ['submitReview']);
});

test('Judge → Compose Verdict posts /judge/compose with one subject: handshake_id or jobId + chainId', () => {
	assert.deepStrictEqual(route('judge', 'compose'), { method: 'POST', url: '/judge/compose' });
	assert.deepStrictEqual(prop('composeHandshakeId').displayOptions.show.composeSubject, ['handshake']);
	assert.strictEqual(prop('composeHandshakeId').routing.send.property, 'handshake_id');
	assert.deepStrictEqual(prop('composeJobId').displayOptions.show.composeSubject, ['job']);
	assert.strictEqual(prop('composeJobId').routing.send.property, 'jobId');
	assert.strictEqual(prop('composeChainId').routing.send.property, 'chainId');
	assert.ok(prop('key').displayOptions.show.operation.includes('compose'), 'a bring-your-own key applies to compose too');
	assert.strictEqual(ops('judge')[0].value, 'compose', 'alphabetical, as the linter demands');
});

test('Handshake → Open can address an MCP server or an A2A agent and dispatch a tool call', () => {
	assert.deepStrictEqual(prop('candidateKind').options.map((o) => o.value), ['n8n', 'onchain', 'mcp', 'a2a']);
	const opts = prop('openOptions').options;
	const by = (n) => opts.find((o) => o.name === n);
	assert.strictEqual(by('endpoint').routing.send.property, 'candidate.endpoint');
	assert.strictEqual(by('tool').routing.send.property, 'tool');
	assert.strictEqual(by('args').routing.send.property, 'args');
	assert.strictEqual(by('args').type, 'json');
	assert.deepStrictEqual(opts.map((o) => o.displayName), [...opts.map((o) => o.displayName)].sort((a, b) => a.localeCompare(b)), 'options stay alphabetical');
});

test('Compose Verdict two-step: Prepare → your TypeSafe node → Answers, on your own credential', () => {
	const mode = prop('composeMode');
	assert.deepStrictEqual(mode.options.map((o) => o.value), ['answers', 'single', 'prepare']);
	assert.strictEqual(mode.default, 'single', 'the one-call path stays the default');
	assert.strictEqual(mode.routing.send.property, 'mode');
	assert.match(mode.routing.send.value, /"single" \? undefined/, 'single sends no mode (the old body, byte for byte)');
	const answersOnly = ['composeAnswers', 'composeModel', 'composePrepareDigest', 'composeAnsweredBy', 'composeExecutionId', 'composeLatencyMs'];
	const sent = Object.fromEntries(answersOnly.map((n) => [n, prop(n).routing.send.property]));
	assert.deepStrictEqual(sent, { composeAnswers: 'answers', composeModel: 'model', composePrepareDigest: 'prepare_digest', composeAnsweredBy: 'answered_by', composeExecutionId: 'execution_id', composeLatencyMs: 'latency_ms' });
	for (const n of answersOnly) assert.deepStrictEqual(prop(n).displayOptions.show.composeMode, ['answers'], `${n} shows only in Answers mode`);
	for (const n of ['composeAnswers', 'composeModel', 'composePrepareDigest']) assert.ok(prop(n).required, `${n} is required`);
	assert.deepStrictEqual(prop('composeAnsweredBy').options.map((o) => o.value), ['n8n-typesafe']);
	assert.match(prop('composeAnswers').routing.send.value, /JSON\.parse/, 'a JSON string is sent as an object');
	assert.deepStrictEqual(prop('key').displayOptions.hide.composeMode, ['prepare', 'answers'], 'no key travels in the two-step mode');
});

test('Judge → Record Answers posts /judge/answers/record with the constants on hidden fields (_JEV_RECORD_v1_)', () => {
	assert.deepStrictEqual(route('judge', 'recordAnswers'), { method: 'POST', url: '/judge/answers/record' });
	const props = d.properties.filter((p) => p.displayOptions?.show?.operation?.includes('recordAnswers'));
	const sent = Object.fromEntries(props.map((p) => [p.routing?.send?.property, p]));
	for (const k of ['use_case', 'subject', 'input', 'questions', 'jev', 'model', 'upstream_model', 'latency_ms', 'decision_digest', 'credential_path', 'caller']) assert.ok(sent[k], `sends ${k}`);
	assert.strictEqual(sent.credential_path.type, 'hidden');
	assert.strictEqual(sent.credential_path.default, 'caller-credential');
	assert.strictEqual(sent.caller.default, 'n8n');
	assert.ok(d.credentials[0].displayOptions.show.resource.includes('judge'), 'the relayer key (X-API-Key) rides on judge ops');
});

test('Demand: Post / Get / Get Many hit /v1/demands, and each way of asking sends only its own fields', () => {
	assert.deepStrictEqual(route('demand', 'post'), { method: 'POST', url: '/demands' });
	assert.deepStrictEqual(route('demand', 'get'), { method: 'GET', url: '=/demands/{{$parameter.demandId}}' });
	assert.deepStrictEqual(route('demand', 'getAll'), { method: 'GET', url: '/demands' });
	assert.deepStrictEqual(prop('demandMode').options.map((o) => o.value).sort(), ['catalog', 'class', 'need']);
	assert.strictEqual(prop('need').routing.send.property, 'need');
	assert.deepStrictEqual(prop('need').displayOptions.show.demandMode, ['need']);
	assert.strictEqual(prop('demandCatalogId').routing.send.property, 'catalog_id');
	assert.strictEqual(prop('catalogNeed').routing.send.property, 'need');
	assert.deepStrictEqual(prop('catalogNeed').displayOptions.show.demandMode, ['catalog']);
	assert.strictEqual(prop('demandClass').routing.send.property, 'class');
	assert.strictEqual(prop('demandInput').routing.send.property, 'input');
	const opts = Object.fromEntries(prop('demandOptions').options.map((o) => [o.name, o.routing.send.property]));
	assert.deepStrictEqual(opts, { buyerLabel: 'buyer_label', classHint: 'class', dryRun: 'dry_run', priceUnits: 'price_units' });
});

test('Catalog, Explorer and Account are plain /v1 reads (and the one free-key write)', () => {
	assert.deepStrictEqual(route('catalog', 'getAll'), { method: 'GET', url: '/catalog' });
	assert.deepStrictEqual(route('catalog', 'get'), { method: 'GET', url: '=/catalog/{{$parameter.catalogId}}' });
	assert.deepStrictEqual(route('explorer', 'get'), { method: 'GET', url: '=/explorer/jobs/{{$parameter.explorerId}}' });
	assert.deepStrictEqual(route('explorer', 'getAll'), { method: 'GET', url: '/explorer/jobs' });
	assert.deepStrictEqual(route('account', 'register'), { method: 'POST', url: '/register' });
	assert.deepStrictEqual(route('account', 'me'), { method: 'GET', url: '/tenant/me' });
	assert.strictEqual(prop('walletAddress').routing.send.property, 'wallet_address');
	assert.strictEqual(prop('resource').default, 'agent', 'the default resource never changes: n8n omits defaults, so old workflows would switch resource');
	const names = prop('resource').options.map((o) => o.name);
	assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'resources stay alphabetical');
});

// ── 0.6.0: sell through Taifoon (claim → nonce in the card → verify), the listings, and the n8n attribution headers ──
const pkg = require('../package.json');
const onOp = (resource, op) =>
	d.properties.filter((p) => p.displayOptions?.show?.resource?.[0] === resource && (p.displayOptions.show.operation || []).includes(op));

test('X-Taifoon-Client rides on every request and names the package version', () => {
	assert.strictEqual(d.requestDefaults.headers['X-Taifoon-Client'], `n8n-nodes-taifoon/${pkg.version}`);
	assert.strictEqual(pkg.version, '0.6.0');
	assert.strictEqual(d.requestDefaults.baseURL, 'https://coord.taifoon.dev/v1');
});

test('Account → Register Seller posts /listings/claim with { card_url, kind: "n8n" } and nothing else', () => {
	assert.deepStrictEqual(route('account', 'registerSeller'), { method: 'POST', url: '/listings/claim' });
	const sent = Object.fromEntries(onOp('account', 'registerSeller').map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent).sort(), ['card_url', 'kind']);
	assert.strictEqual(sent.card_url.name, 'cardUrl');
	assert.strictEqual(sent.card_url.required, true);
	assert.strictEqual(sent.kind.type, 'hidden', 'kind is fixed, not a choice');
	assert.strictEqual(sent.kind.default, 'n8n');
});

test('Account → Verify Seller posts /listings/{id}/verify with no body', () => {
	assert.deepStrictEqual(route('account', 'verifySeller'), { method: 'POST', url: '=/listings/{{$parameter.sellerListingId}}/verify' });
	const props = onOp('account', 'verifySeller');
	assert.deepStrictEqual(props.map((p) => p.name), ['sellerListingId']);
	assert.strictEqual(props[0].required, true);
	assert.strictEqual(props[0].routing, undefined, 'the ID is in the path, not the body');
});

test('Register Seller and Verify Seller carry the credential (Account is in its list)', () => {
	assert.ok(d.credentials[0].displayOptions.show.resource.includes('account'));
});

test('Account → Register Free Key sends X-Taifoon-Channel: n8n (the tenant is recorded via n8n), and only on that operation', async () => {
	const withPreSend = d.properties.filter((p) => p.routing?.send?.preSend);
	assert.deepStrictEqual(withPreSend.map((p) => p.name), ['registerChannel']);
	const ch = withPreSend[0];
	assert.strictEqual(ch.type, 'hidden');
	assert.deepStrictEqual(ch.displayOptions.show, { resource: ['account'], operation: ['register'] });
	const out = await ch.routing.send.preSend[0].call({}, { url: '/register', method: 'POST', headers: { Accept: 'application/json' } });
	assert.deepStrictEqual(out.headers, { Accept: 'application/json', 'X-Taifoon-Channel': 'n8n' }, 'adds the header, keeps the others');
	const bare = await ch.routing.send.preSend[0].call({}, { url: '/register', method: 'POST' });
	assert.strictEqual(bare.headers['X-Taifoon-Channel'], 'n8n');
	const sent = onOp('account', 'register').filter((p) => p.routing?.send?.property).map((p) => p.routing.send.property).sort();
	assert.deepStrictEqual(sent, ['agent_id', 'wallet_address'], 'the body is unchanged');
});

test('Catalog → Get Listing / Get Many Listings read /listings, the filters are the route’s query', () => {
	assert.deepStrictEqual(route('catalog', 'getListing'), { method: 'GET', url: '=/listings/{{$parameter.listingId}}' });
	assert.deepStrictEqual(route('catalog', 'getManyListings'), { method: 'GET', url: '/listings' });
	assert.strictEqual(prop('listingId').required, true);
	const f = prop('listingFilters');
	assert.deepStrictEqual(f.displayOptions.show, { resource: ['catalog'], operation: ['getManyListings'] });
	const q = Object.fromEntries(f.options.map((o) => [o.name, o.routing.send]));
	for (const k of ['kind', 'state', 'class', 'whose', 'limit']) assert.strictEqual(q[k].type, 'query', `${k} is a query parameter`);
	assert.deepStrictEqual(Object.keys(q).sort(), ['class', 'kind', 'limit', 'state', 'whose']);
	const opts = (n) => f.options.find((o) => o.name === n).options.map((o) => o.value).sort();
	assert.deepStrictEqual(opts('state'), ['candidate', 'claimed', 'delisted', 'listed', 'paused']);
	assert.deepStrictEqual(opts('whose'), ['ours', 'outside']);
	assert.ok(opts('kind').includes('n8n'));
	assert.match(q.class.value, /\$value \|\| undefined/, 'an empty class is not sent');
	const names = ops('catalog').map((o) => o.name);
	assert.deepStrictEqual(names, [...names].sort((a, b) => a.localeCompare(b)), 'operations stay alphabetical');
	const acc = ops('account').map((o) => o.name);
	assert.deepStrictEqual(acc, [...acc].sort((a, b) => a.localeCompare(b)), 'operations stay alphabetical');
});
