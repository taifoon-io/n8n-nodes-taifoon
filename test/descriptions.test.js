// The node is declarative: what it does IS its description. These pin the settlement step of a hire.
const test = require('node:test');
const assert = require('node:assert');
const { Taifoon } = require('../dist/nodes/Taifoon/Taifoon.node.js');

const d = new Taifoon().description;
const ops = (resource) => d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === resource).options;
const prop = (name) => d.properties.find((p) => p.name === name);
// 1.3.0 (n8n review): an optional field lives in its op's Additional Fields / Filters collection. `flat` lists every field an op
// can send, a collection's options shown where the collection shows (`in` names the collection); `field` finds one by name.
const flat = (props) => props.flatMap((p) => (p.type === 'collection' ? p.options.map((o) => ({ ...o, displayOptions: p.displayOptions, in: p.name })) : [p]));
const field = (name) => flat(d.properties).find((p) => p.name === name);
const route = (resource, op) => ops(resource).find((o) => o.value === op).routing.request;
// coord-lang/ (coord gen row n8n-resale-node) stays in the private source; the public mirror ships without it
const RESALE = require('node:path').join(__dirname, '..', 'coord-lang', 'n8n-resale.json');
const { existsSync } = require('node:fs');

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
	assert.deepStrictEqual(prop('kind').options.map((o) => o.value).sort(), ['agent', 'resource']);
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

test('Job Review → Submit Review: the owner is optional once bound, and the binding signature rides as owner_signature', () => {
	for (const n of ['reviewOwner', 'reviewOwnerSignature']) assert.strictEqual(field(n).in, 'reviewOptions', `${n} is an Additional Field`);
	assert.strictEqual(prop('reviewOwner'), undefined, 'not top-level');
	assert.strictEqual(field('reviewOwner').routing.send.property, 'owner');
	assert.strictEqual(field('reviewOwnerSignature').routing.send.property, 'owner_signature');
	assert.deepStrictEqual(field('reviewOwnerSignature').displayOptions.show.operation, ['submitReview']);
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

test('Demand: Post / Get / Get Many hit /v1/demands, and each way of asking sends only its own fields', () => {
	assert.deepStrictEqual(route('demand', 'post'), { method: 'POST', url: '/demands' });
	assert.deepStrictEqual(route('demand', 'get'), { method: 'GET', url: '=/demands/{{$parameter.demandId}}' });
	assert.deepStrictEqual(route('demand', 'getAll'), { method: 'GET', url: '/demands' });
	assert.deepStrictEqual(prop('demandMode').options.map((o) => o.value).sort(), ['catalog', 'class', 'need']);
	assert.strictEqual(prop('need').routing.send.property, 'need');
	assert.deepStrictEqual(prop('need').displayOptions.show.demandMode, ['need']);
	assert.strictEqual(prop('demandCatalogId').routing.send.property, 'catalog_id');
	assert.strictEqual(field('catalogNeed').routing.send.property, 'need');
	assert.strictEqual(field('catalogNeed').in, 'catalogOptions');
	assert.deepStrictEqual(field('catalogNeed').displayOptions.show.demandMode, ['catalog']);
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
	flat(d.properties).filter((p) => p.displayOptions?.show?.resource?.[0] === resource && (p.displayOptions.show.operation || []).includes(op));

test('X-Taifoon-Client rides on every request and names the package version', () => {
	assert.strictEqual(d.requestDefaults.headers['X-Taifoon-Client'], `n8n-nodes-taifoon/${pkg.version}`);
	assert.strictEqual(pkg.version, '2.2.0');
	assert.strictEqual(d.requestDefaults.baseURL, 'https://coord.taifoon.dev/v1');
});

test('Account → Register Seller posts /listings/claim with { card_url, kind: "n8n" } and, optionally, the author channel', () => {
	assert.deepStrictEqual(route('account', 'registerSeller'), { method: 'POST', url: '/listings/claim' });
	const props = onOp('account', 'registerSeller');
	// _N8N_AUTHOR_MAINNET_v1_: one optional field (Additional Fields), the author channel, sent only when set
	const extra = props.filter((p) => p.in === 'sellerOptions');
	assert.deepStrictEqual(extra.map((o) => [o.name, o.routing.send.property, o.routing.send.value]), [['sellerChannel', 'channel', '={{ $value || undefined }}']]);
	const sent = Object.fromEntries(props.filter((p) => !p.in).map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent).sort(), ['card_url', 'kind']);
	assert.strictEqual(sent.card_url.name, 'cardUrl');
	assert.strictEqual(sent.card_url.required, true);
	assert.strictEqual(sent.kind.type, 'hidden', 'kind is fixed, not a choice');
	assert.strictEqual(sent.kind.default, 'n8n');
});

test('Account → Register Author Channel posts /channels with { channel, pay_to? } and nothing else', () => {
	assert.deepStrictEqual(route('account', 'registerAuthorChannel'), { method: 'POST', url: '/channels' });
	const sent = Object.fromEntries(onOp('account', 'registerAuthorChannel').map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent).sort(), ['channel', 'pay_to']);
	assert.strictEqual(sent.channel.required, true); assert.strictEqual(sent.pay_to.in, 'authorChannelOptions', 'pay_to is an additional field');
	assert.strictEqual(sent.pay_to.routing.send.value, '={{ $value || undefined }}', 'an empty pay_to keeps the one registered');
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
	for (const k of ['kind', 'state', 'class', 'whose']) assert.strictEqual(q[k].type, 'query', `${k} is a query parameter`);
	assert.deepStrictEqual(Object.keys(q).sort(), ['class', 'kind', 'state', 'whose']);
	const lim = onOp('catalog', 'getManyListings').find((p) => p.name === 'limit');
	assert.deepStrictEqual([lim.routing.send.type, lim.routing.send.property, lim.displayOptions.show.returnAll], ['query', 'limit', [false]], 'Limit shows only without Return All');
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
	const sent = (op) => Object.fromEntries(flat(d.properties).filter((p) => p.displayOptions && p.displayOptions.show && p.displayOptions.show.resource && p.displayOptions.show.resource[0] === 'account' && (p.displayOptions.show.operation || []).includes(op) && p.routing && p.routing.send && p.routing.send.property).map((p) => [p.routing.send.property, p]));
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
	const sent = Object.fromEntries(flat(d.properties).filter((p) => p.displayOptions && p.displayOptions.show && p.displayOptions.show.resource && p.displayOptions.show.resource[0] === 'inference' && (p.displayOptions.show.operation || []).includes('chat') && p.routing && p.routing.send && p.routing.send.property).map((p) => [p.routing.send.property, p]));
	assert.deepStrictEqual(Object.keys(sent).sort(), ['max_tokens', 'messages', 'model']);
	for (const p of Object.values(sent)) assert.strictEqual(p.routing.send.type, 'body');
	assert.strictEqual(sent.max_tokens.in, 'chatOptions', 'Max Tokens is an Additional Field (the gate holds for 256 without it)');
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

// ── 1.1.0: Commerce (hire, settle as a plan), Template → List, and the channel on every call (_CHANNEL_SHARE_v1_) ──
const { buildRequest } = require('./live/node-request');
const { TaifoonRelayerApi } = require('../dist/credentials/TaifoonRelayerApi.credentials.js');

test('Commerce: Hire and Settle are the same requests as Job → Create Offer and Settlement → Settle (the MCP tools taifoon_hire, taifoon_settle_plan)', async () => {
	assert.deepStrictEqual(ops('commerce').map((o) => o.value), ['hire', 'settle'], 'alphabetical, as the linter demands');
	assert.deepStrictEqual(route('commerce', 'hire'), route('job', 'createOffer'));
	assert.deepStrictEqual(route('commerce', 'settle'), route('settlement', 'settle'));
	const same = async (a, b, params) => {
		const x = await buildRequest(a[0], a[1], params); const y = await buildRequest(b[0], b[1], params);
		assert.deepStrictEqual({ ...x, headers: undefined }, { ...y, headers: undefined }, `${a.join('.')} sends what ${b.join('.')} sends`);
	};
	await same(['commerce', 'hire'], ['job', 'createOffer'], { chainId: 8453, seller: '0x' + '11'.repeat(20), price: '100000', offerOptions: { deadline_hours: 48 } });
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
	assert.deepStrictEqual((await buildRequest('template', 'list', { templateListFilters: { templateClass: 'mcp.digest' } })).qs, { class: 'mcp.digest' });
	assert.deepStrictEqual((await buildRequest('template', 'list', { templateListFilters: { templateClass: '' } })).qs, {});
});

test('the credential’s Channel ID rides on every call as X-Taifoon-Channel (empty: n8n, no partner)', async () => {
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

// ── 2.0.0: n8n review of 1.3.0: grading stays with the grader's own verified node; this node covers Taifoon's own services ──
test('no operation or field calls a grading model, takes its key, or depends on another node\'s answers', () => {
	assert.deepStrictEqual(ops('judge').map((o) => o.value), ['getReady', 'getReviewable', 'getStages', 'getTrace', 'giveFeedback', 'postVerdict', 'submitReview']);
	assert.deepStrictEqual(ops('commerce').map((o) => o.value), ['hire', 'settle']);
	for (const url of ['/judge/grade', '/judge/ref', '/judge/compose', '/judge/answers/record']) assert.ok(!JSON.stringify(d.properties).includes(`"${url}"`), `${url} is gone`);
	for (const name of ['composeMode', 'composeAnsweredBy', 'recordReply', 'items', 'question', 'state', 'reviewJev', 'key']) assert.ok(!flat(d.properties).some((p) => p.name === name && ['judge', 'commerce'].includes(p.displayOptions?.show?.resource?.[0])), `${name} is gone`);
	assert.doesNotMatch(JSON.stringify(d), /typesafe|\bjev\b/i);
	assert.strictEqual(d.credentials[0].displayOptions, undefined, 'the relayer key (X-API-Key) rides on every resource');
});

// ── the seller path of "List my workflow on Taifoon": the inbox, the agent listing and the payee ──
test('Handshake → List Offers reads the seller\'s inbox: GET /v1/handshake?provider=, the state only when set, Return All reads 200', async () => {
	const a = '0x' + 'ab'.repeat(20);
	const r = await buildRequest('handshake', 'listOffers', { offersProvider: a });
	assert.deepStrictEqual([r.method, r.url, r.qs, r.body], ['GET', '/handshake', { provider: a, limit: 50 }, undefined]);
	assert.deepStrictEqual((await buildRequest('handshake', 'listOffers', { offersProvider: a, offersFilters: { state: 'DELIVERED' }, limit: 5 })).qs, { provider: a, limit: 5, state: 'DELIVERED' });
	const all = await buildRequest('handshake', 'listOffers', { offersProvider: a, returnAll: true });
	assert.deepStrictEqual([all.qs, all.paginate], [{ provider: a }, true]);
	assert.match(ops('handshake').find((o) => o.value === 'listOffers').description, /taifoon_offers/);
});

test('Seller Listing → Create posts /v1/agent-listings: identity, a self-hosted door and the pricing, nothing else', async () => {
	const p = { listingName: 'Word counter', listingHandle: 'word-counter', listingCategory: 'data', listingTagline: 'Counts words', listingWebhookUrl: 'https://n8n.example.com/webhook/wc', listingClasses: 'chat.word_count, mcp.digest', listingPrice: ' 0.05 ', listingPayout: '0x' + 'ab'.repeat(20) };
	const r = await buildRequest('sellerListing', 'create', p);
	assert.deepStrictEqual([r.method, r.url], ['POST', '/agent-listings']);
	assert.deepStrictEqual(r.body, { identity: { name: 'Word counter', handle: 'word-counter', category: 'data', tagline: 'Counts words' }, hosting: { door: { endpoint: 'https://n8n.example.com/webhook/wc', kind: 'n8n' }, mode: 'self_hosted' }, pricing: { classes: ['chat.word_count', 'mcp.digest'], seller_price_usd: '0.05', payout: '0x' + 'ab'.repeat(20) } });
	const more = await buildRequest('sellerListing', 'create', { ...p, listingDoorKind: 'mcp', listingOptions: { description: 'longer', slaSeconds: 600 } });
	assert.deepStrictEqual([more.body.hosting.door.kind, more.body.identity.description, more.body.pricing.sla_seconds], ['mcp', 'longer', 600]);
	assert.strictEqual((await buildRequest('sellerListing', 'create', { ...p, listingOptions: { description: '' } })).body.identity.description, undefined, 'an empty description is not sent');
	assert.match(ops('sellerListing').find((o) => o.value === 'create').description, /shows an agent token and a signing secret ONCE/);
});

test('Seller Listing → Get, Publish and Get Payee Registration address the listing by its ID; the payTo basis sends basis=payto, the owner basis agent_id', async () => {
	const id = { agentListingId: 'al_0123456789abcdef' };
	assert.deepStrictEqual((({ method, url, body }) => [method, url, body])(await buildRequest('sellerListing', 'get', id)), ['GET', '/agent-listings/al_0123456789abcdef', undefined]);
	assert.deepStrictEqual((({ method, url, body }) => [method, url, body])(await buildRequest('sellerListing', 'publish', id)), ['POST', '/agent-listings/al_0123456789abcdef/publish', undefined]);
	const payto = await buildRequest('sellerListing', 'payeeToSign', id);
	assert.deepStrictEqual([payto.method, payto.url, payto.qs], ['GET', '/agent-listings/al_0123456789abcdef/payee', { basis: 'payto' }], 'the payTo is the default signer');
	assert.deepStrictEqual((await buildRequest('sellerListing', 'payeeToSign', { ...id, payeeBasis: 'agent_owner', payeeAgentId: '1234' })).qs, { agent_id: '1234' });
});

test('Seller Listing → Register Payee posts the registration with the wallet\'s signature as sig, and takes the whole answer pasted', async () => {
	const reg = { agent_id: '0', basis: 'payto', payee: '0x' + 'ab'.repeat(20), nonce: '3', valid_until: '1795000000' };
	const sig = '0x' + '1c'.repeat(65);
	const r = await buildRequest('sellerListing', 'registerPayee', { agentListingId: 'al_0123456789abcdef', payeeRegistration: JSON.stringify(reg), payeeSignature: sig });
	assert.deepStrictEqual([r.method, r.url, r.body], ['POST', '/agent-listings/al_0123456789abcdef/payee', { registration: { ...reg, sig } }]);
	const whole = await buildRequest('sellerListing', 'registerPayee', { agentListingId: 'al_0123456789abcdef', payeeRegistration: { ok: true, registration: reg, typed_data: {}, digest: '0x' }, payeeSignature: sig });
	assert.deepStrictEqual(whole.body, { registration: { ...reg, sig } });
});

test('Seller Listing signs nothing: no field takes a private key or a mnemonic, and every payee text says your own wallet signs', () => {
	const fields = flat(d.properties).filter((p) => p.displayOptions?.show?.resource?.includes('sellerListing'));
	assert.deepStrictEqual(fields.filter((p) => /private|mnemonic|secret|seed/i.test(`${p.name} ${p.displayName}`)).map((p) => p.name), []);
	for (const v of ['payeeToSign', 'registerPayee']) assert.match(ops('sellerListing').find((o) => o.value === v).description, /your (own )?wallet/i);
	assert.match(ops('sellerListing').find((o) => o.value === 'payeeToSign').description, /Nothing is signed, sent or spent here/);
});

test('Taifoon Trigger: the offer event watches one seller address, hides Watch, and takes the credential (optional)', () => {
	const { TaifoonTrigger } = require('../dist/nodes/TaifoonTrigger/TaifoonTrigger.node.js');
	const t = new TaifoonTrigger().description;
	assert.deepStrictEqual(t.credentials, [{ name: 'taifoonRelayerApi', required: false }]);
	assert.ok(t.properties.find((p) => p.name === 'event').options.some((o) => o.value === 'offer'));
	const addresses = t.properties.filter((p) => p.name === 'address');
	assert.deepStrictEqual(addresses.map((p) => p.displayOptions), [{ show: { event: ['offer'] } }, { hide: { watch: ['all'], event: ['offer'] } }]);
	assert.deepStrictEqual(t.properties.find((p) => p.name === 'watch').displayOptions, { hide: { event: ['offer'] } });
	assert.ok(addresses.every((p) => p.required));
});

// ── 2.2.0: routes coord already served that the node had no operation for (_N8N_MARKET_OPS_v1_) ──
const req3 = (r) => [r.method, r.url, r.qs, r.body];

test('Market is a resource generated from coord, between Job Review and Proof, its four reads public', () => {
	const names = prop('resource').options.map((o) => o.value);
	assert.ok(names.includes('market'));
	assert.deepStrictEqual(ops('market').map((o) => o.value), ['compareVenues', 'getFeeScheme', 'getPrices', 'quoteFee']);
	assert.strictEqual(d.properties.find((p) => p.name === 'operation' && p.displayOptions.show.resource[0] === 'market').default, 'getPrices');
	// the route check reads coord-lang/, which the public mirror does not ship (test/generated.test.js skips the same way)
	if (!existsSync(RESALE)) return;
	const resale = require(RESALE);
	for (const o of resale.node_ops.filter((x) => x.resource === 'market')) {
		assert.ok(!o.hand, `${o.operation} is generated, not hand-typed`);
		assert.deepStrictEqual(route('market', o.operation), { method: o.method, url: o.url });
	}
});

test('Market → Get Prices sends class and venue only when set (no window: the route reads a fixed one)', async () => {
	assert.deepStrictEqual(req3(await buildRequest('market', 'getPrices', {})), ['GET', '/prices', {}, undefined]);
	const r = await buildRequest('market', 'getPrices', { marketGetPricesFilters: { pricesClass: 'inference.chat', pricesVenue: 'x402-base' } });
	assert.deepStrictEqual(r.qs, { class: 'inference.chat', venue: 'x402-base' });
	assert.deepStrictEqual((await buildRequest('market', 'getPrices', { marketGetPricesFilters: { pricesClass: '' } })).qs, {}, 'an empty class is not sent');
	assert.ok(!flat(d.properties).some((p) => p.displayOptions?.show?.resource?.[0] === 'market' && p.routing?.send?.property === 'window'));
});

test('Market → Compare Venues requires the class; Get Fee Scheme takes nothing', async () => {
	assert.strictEqual(prop('compareClass').required, true);
	assert.deepStrictEqual(req3(await buildRequest('market', 'compareVenues', { compareClass: 'inference.chat' })), ['GET', '/venues/compare', { class: 'inference.chat' }, undefined]);
	assert.deepStrictEqual(req3(await buildRequest('market', 'getFeeScheme', {})), ['GET', '/fees/scheme', {}, undefined]);
});

test('Market → Quote Job Fee sends the price, and the chain and profile only when set', async () => {
	assert.strictEqual(prop('quotePrice').required, true);
	assert.deepStrictEqual(req3(await buildRequest('market', 'quoteFee', { quotePrice: '1.5' })), ['GET', '/fees/quote', { price: '1.5' }, undefined]);
	const r = await buildRequest('market', 'quoteFee', { quotePrice: '2', marketQuoteFeeFilters: { quoteChainId: 8453, quoteProfile: 'direct' } });
	assert.deepStrictEqual(r.qs, { price: '2', chain: 8453, profile: 'direct' });
	assert.deepStrictEqual((await buildRequest('market', 'quoteFee', { quotePrice: '2', marketQuoteFeeFilters: { quoteChainId: 0 } })).qs, { price: '2' }, 'chain 0 is the route default, not sent');
	assert.deepStrictEqual(field('quoteProfile').options.map((o) => o.value).sort(), ['direct', 'relayed', 'stand-in']);
});

test('Account → Get Usage reads GET /v1/access/usage with the window as a filter', async () => {
	assert.deepStrictEqual(route('account', 'getUsage'), { method: 'GET', url: '/access/usage' });
	assert.deepStrictEqual(req3(await buildRequest('account', 'getUsage', {})), ['GET', '/access/usage', {}, undefined]);
	assert.deepStrictEqual((await buildRequest('account', 'getUsage', { usageFilters: { usageWindow: '7d' } })).qs, { window: '7d' });
	assert.deepStrictEqual(field('usageWindow').options.map((o) => o.value).sort(), ['1d', '30d', '7d', 'month']);
	assert.match(ops('account').find((o) => o.value === 'getUsage').description, /needs the credential/);
});

test('Agent → Get Registered sends chain, venue, class and words as filters, each only when set', async () => {
	assert.deepStrictEqual(req3(await buildRequest('agent', 'getRegistered', {})), ['GET', '/agents/registered', {}, undefined]);
	const r = await buildRequest('agent', 'getRegistered', { registeredFilters: { chain: ' 8453,base ', venue: 'mcp', class: 'inference.chat', q: 'translate' } });
	assert.deepStrictEqual(r.qs, { chain: '8453,base', venue: 'mcp', class: 'inference.chat', q: 'translate' });
	assert.deepStrictEqual((await buildRequest('agent', 'getRegistered', { registeredFilters: { chain: '', q: '' } })).qs, {});
	const fields = d.properties.find((p) => p.name === 'registeredFilters');
	assert.deepStrictEqual(fields.options.map((o) => o.displayName), [...fields.options.map((o) => o.displayName)].sort((a, b) => a.localeCompare(b)), 'filters stay alphabetical');
	for (const o of fields.options) assert.strictEqual(o.type, 'string', `${o.name} is free text: no chain, venue or class list is typed into the node`);
});

test('Seller Listing → Get Venues and Set Venue address the ls_ listing; Set Venue sends the venue and only the fields set', async () => {
	const id = { venueListingId: 'ls_0123456789abcdef' };
	assert.deepStrictEqual(req3(await buildRequest('sellerListing', 'getVenues', id)), ['GET', '/listings/ls_0123456789abcdef/venues', {}, undefined]);
	assert.deepStrictEqual(req3(await buildRequest('sellerListing', 'setVenue', { ...id, venueId: 'x402-base' })), ['POST', '/listings/ls_0123456789abcdef/venues', {}, { venue: 'x402-base' }]);
	const all = await buildRequest('sellerListing', 'setVenue', { ...id, venueId: 'x402-base', venueOptions: { on: false, priceUsdc: ' 0.07 ', title: 'T', description: 'D', category: 'data', dryRun: true } });
	assert.deepStrictEqual(all.body, { venue: 'x402-base', on: false, price_usdc: '0.07', title: 'T', description: 'D', category: 'data', dry_run: true });
	assert.deepStrictEqual((await buildRequest('sellerListing', 'setVenue', { ...id, venueId: 'x402-base', venueOptions: { priceUsdc: 'one' } })).body, { venue: 'x402-base', price_usdc: null }, '"one" goes back to the one price');
	assert.deepStrictEqual((await buildRequest('sellerListing', 'setVenue', { ...id, venueId: 'x402-base', venueOptions: { priceUsdc: '', title: '' } })).body, { venue: 'x402-base' }, 'empty fields are not sent');
	assert.deepStrictEqual(prop('venueListingId').displayOptions.show.operation, ['getVenues', 'setVenue']);
	assert.strictEqual(prop('agentListingId').displayOptions.show.operation.includes('getVenues'), false, 'the venues take the ls_ listing, not the al_ agent listing');
	for (const v of ['getVenues', 'setVenue']) assert.match(ops('sellerListing').find((o) => o.value === v).description, /needs the key that holds the listing/);
	assert.match(ops('sellerListing').find((o) => o.value === 'setVenue').description, /Nothing is listed, signed or paid here/);
});

test('2.2.0 hand-typed operations are held to their coord gate routes (gen-descriptions --check)', { skip: !existsSync(RESALE) && 'no coord-lang/ here' }, async () => {
	const { handDrift } = await import('../scripts/gen-descriptions.mjs');
	const resale = require(RESALE);
	const rows = resale.node_ops.filter((o) => ['account.getUsage', 'agent.getRegistered', 'sellerListing.getVenues', 'sellerListing.setVenue'].includes(`${o.resource}.${o.operation}`));
	assert.strictEqual(rows.length, 4);
	assert.ok(rows.every((o) => o.hand));
	assert.deepStrictEqual(handDrift(resale), []);
});
