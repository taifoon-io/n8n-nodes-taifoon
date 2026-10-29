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

test('the relayer credential is offered on every resource (1.1.0: it carries the channel on every call), and stays optional', () => {
	assert.strictEqual(d.credentials.length, 1);
	assert.strictEqual(d.credentials[0].required, false, 'a required credential breaks every public read (found by running the node)');
	assert.strictEqual(d.credentials[0].displayOptions, undefined, 'no resource hides it: the Channel ID rides on every call');
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
	assert.strictEqual(d.credentials[0].displayOptions, undefined, 'the relayer key (X-API-Key) rides on judge ops');
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
	assert.strictEqual(pkg.version, '1.2.1');
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

test('Register Seller and Verify Seller carry the credential (shown on every resource)', () => {
	assert.strictEqual(d.credentials[0].displayOptions, undefined);
});

test('Account → Register Free Key sends X-Taifoon-Channel: n8n (the tenant is recorded via n8n), and only the mint operations and Helpdesk → Ask do', async () => {
	const withPreSend = d.properties.filter((p) => p.routing?.send?.preSend);
	assert.deepStrictEqual(withPreSend.map((p) => p.name), ['registerChannel', 'smaChannel']); // 1.1.0: Helpdesk → Ask names its outlet the same way
	const ch = withPreSend[0];
	assert.strictEqual(ch.type, 'hidden');
	assert.deepStrictEqual(ch.displayOptions.show, { resource: ['account'], operation: ['register', 'subscribe', 'mintChildKey'] }); // 0.8.0: every mint call says it came via n8n
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

// ── 0.8.0: the key path (the reseller path through n8n) ──
test('Account carries the key path: subscribe, quote, the two claims, the standing, the reseller view and a child key, on the routes the layer serves', () => {
	assert.deepStrictEqual(route('account', 'subscribe'), { method: 'POST', url: '/access/subscribe' });
	assert.deepStrictEqual(route('account', 'accessQuote'), { method: 'GET', url: '/access/quote' });
	assert.deepStrictEqual(route('account', 'claimPlan'), { method: 'POST', url: '/access/plan' });
	assert.deepStrictEqual(route('account', 'claimTopUp'), { method: 'POST', url: '/access/topup' });
	assert.deepStrictEqual(route('account', 'keyStanding'), { method: 'GET', url: '/access/key' });
	assert.deepStrictEqual(route('account', 'resellerView'), { method: 'GET', url: '/access/reseller' });
	assert.deepStrictEqual(route('account', 'mintChildKey'), { method: 'POST', url: '/tenant/keys' });
});

test('a claim sends exactly what POST /v1/access/plan and /topup read; a child key is action "child" with label and markup_bps; the mint calls carry the n8n channel', () => {
	const sent = (op) => Object.fromEntries(d.properties.filter((p) => p.displayOptions && p.displayOptions.show && p.displayOptions.show.resource && p.displayOptions.show.resource[0] === 'account' && (p.displayOptions.show.operation || []).includes(op) && p.routing && p.routing.send && p.routing.send.property).map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent('claimPlan')).sort(), ['chainId', 'plan', 'signature', 'tx']);
	assert.deepStrictEqual(Object.keys(sent('claimTopUp')).sort(), ['chainId', 'signature', 'tx']);
	for (const k of ['tx', 'signature']) assert.ok(sent('claimPlan')[k].required, `${k} is required`);
	const child = sent('mintChildKey');
	assert.deepStrictEqual(Object.keys(child).sort(), ['action', 'label', 'markup_bps']);
	assert.strictEqual(child.action.type, 'hidden'); assert.strictEqual(child.action.default, 'child');
	assert.deepStrictEqual(prop('registerChannel').displayOptions.show.operation, ['register', 'subscribe', 'mintChildKey']);
	assert.strictEqual(prop('subscribeCreateKey').default, true);
	const q = sent('accessQuote');
	assert.deepStrictEqual(Object.keys(q).sort(), ['chainId', 'plan', 'usdc']);
	assert.strictEqual(q.plan.routing.send.type, 'query');
	assert.deepStrictEqual(prop('quoteProduct').options.map((o) => o.value), ['balance', 'builder-99', 'team-199', 'protocol-299']);
});

test('no Account operation reads a key back: every GET of the key path answers a standing, never api_key', () => {
	for (const op of ['keyStanding', 'resellerView', 'me']) assert.strictEqual(route('account', op).method, 'GET');
	for (const o of ops('account')) assert.doesNotMatch(o.description, /returns the key|reads the key back/i);
});

// ── 1.0.1: inference ──
test('Inference → Chat posts the OpenAI-compatible gate on coord (POST /v1/chat/completions, the one host and the one error contract): model, messages and the hold in the body; List Models reads /v1/models', () => {
	assert.deepStrictEqual(route('inference', 'chat'), { method: 'POST', url: '/chat/completions' });
	assert.deepStrictEqual(route('inference', 'listModels'), { method: 'GET', url: '/models' });
	const sent = Object.fromEntries(d.properties.filter((p) => p.displayOptions && p.displayOptions.show && p.displayOptions.show.resource && p.displayOptions.show.resource[0] === 'inference' && (p.displayOptions.show.operation || []).includes('chat') && p.routing && p.routing.send && p.routing.send.property).map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model']);
	for (const p of Object.values(sent)) assert.strictEqual(p.routing.send.type, 'body');
	// a model GET /v1/models lists; the 1.0.0 default (llama-3.1-8b) still routes, so saved workflows keep working
	assert.strictEqual(prop('model').default, 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16');
	assert.doesNotMatch(JSON.stringify(d), /api\.taifoon\.dev/);
});

// ── the README states what the node ships (the 57-operation badge outlived three releases) ──
test('README: the operation and resource counts are the built node’s', () => {
	const readme = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'README.md'), 'utf8');
	const opsProps = d.properties.filter((p) => p.name === 'operation');
	const ops = opsProps.reduce((n, p) => n + p.options.length, 0);
	const resources = new Set(opsProps.map((p) => p.displayOptions.show.resource[0])).size;
	assert.match(readme, new RegExp(`badge/operations-${ops}-`), `the badge says ${ops} operations`);
	assert.match(readme, new RegExp(`\\*\\*Taifoon\\*\\* \\(${ops}\\s+operations, ${resources} resources`), `Install says ${ops} operations, ${resources} resources`);
	assert.doesNotMatch(readme, /Every read works without a key/, 'Chat and the key reads need the credential');
});

// ── 1.1.0: Commerce (hire, grade, settle as a plan), Template → List, and the channel on every call (_CHANNEL_SHARE_v1_) ──
const { buildRequest } = require('./live/node-request');
const { TaifoonRelayerApi } = require('../dist/credentials/TaifoonRelayerApi.credentials.js');

test('Commerce: Hire, Grade and Settle are the same requests as Job → Create Offer, Judge → Grade and Settlement → Settle (the MCP tools taifoon_hire, taifoon_grade, taifoon_settle_plan)', async () => {
	assert.deepStrictEqual(ops('commerce').map((o) => o.value), ['grade', 'hire', 'settle'], 'alphabetical, as the linter demands');
	assert.deepStrictEqual(route('commerce', 'hire'), route('job', 'createOffer'));
	assert.deepStrictEqual(route('commerce', 'grade'), route('judge', 'grade'));
	assert.deepStrictEqual(route('commerce', 'settle'), route('settlement', 'settle'));
	const same = async (a, b, params) => {
		const x = await buildRequest(a[0], a[1], params); const y = await buildRequest(b[0], b[1], params);
		assert.deepStrictEqual({ ...x, headers: undefined }, { ...y, headers: undefined }, `${a.join('.')} sends what ${b.join('.')} sends`);
	};
	await same(['commerce', 'hire'], ['job', 'createOffer'], { chainId: 8453, seller: '0x' + '11'.repeat(20), price: '100000', offerOptions: { deadline_hours: 48 } });
	await same(['commerce', 'grade'], ['judge', 'grade'], { items: '[{"id":"1","state":"delivered"}]', question: 'Was it delivered?', key: 'ts_x' });
	await same(['commerce', 'settle'], ['settlement', 'settle'], { kind: 'agent', chainId: 36927, buyer: '0x' + '11'.repeat(20), seller: '0x' + '22'.repeat(20), price: '100000', evidence: '0x' + 'ab'.repeat(32), refId: 'r1' });
});

test('Settle is a plan only: its description says nothing is signed or sent, and no Commerce field takes a signature or a private key', () => {
	assert.match(ops('commerce').find((o) => o.value === 'settle').description, /plan only: nothing is signed or sent/i);
	const fields = d.properties.filter((p) => p.displayOptions?.show?.resource?.[0] === 'commerce' && p.name !== 'operation');
	assert.ok(fields.length >= 8);
	for (const p of fields) assert.doesNotMatch(`${p.name} ${p.displayName}`, /signature|private|secret|mnemonic/i, p.name);
});

test('Template → List reads GET /v1/n8n/templates; Class narrows it and is not sent when empty', async () => {
	assert.deepStrictEqual(route('template', 'list'), { method: 'GET', url: '/n8n/templates' });
	assert.deepStrictEqual((await buildRequest('template', 'list', {})).qs, {});
	assert.deepStrictEqual((await buildRequest('template', 'list', { templateClass: 'mcp.digest' })).qs, { class: 'mcp.digest' });
});

test('the credential’s Channel ID rides on every call as X-Taifoon-Channel (empty: n8n, which earns nobody a share)', async () => {
	const c = new TaifoonRelayerApi();
	const f = c.properties.find((p) => p.name === 'channelId');
	assert.ok(f && f.displayName === 'Channel ID' && f.required !== true && f.default === '');
	assert.strictEqual(c.authenticate.properties.headers['X-Taifoon-Channel'], '={{$credentials.channelId || "n8n"}}');
	for (const [r, o] of [['commerce', 'hire'], ['template', 'list'], ['agent', 'search'], ['demand', 'post']]) {
		if (!ops(r).some((x) => x.value === o)) continue;
		assert.strictEqual((await buildRequest(r, o, {}, { apiKey: 'tfr_x', channel: 'acme-agency' })).headers['X-Taifoon-Channel'], 'acme-agency', `${r}.${o}`);
	}
	assert.strictEqual((await buildRequest('commerce', 'hire', {}, { apiKey: 'tfr_x' })).headers['X-Taifoon-Channel'], 'n8n');
});
