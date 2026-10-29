// One contract per operation the n8n node ships. ops.test.js runs each against https://coord.taifoon.dev/v1 with the
// request the node builds (node-request.js); measure.mjs measures them; coverage.test.js fails when the node ships an
// operation that has no entry here, or an entry names an operation the node no longer ships.
//
// Entry fields:
//   mode       read          a GET, or a POST that only reads (match, quote, attest): called live, every run
//              plan          answers UNSIGNED calls or a plan and persists nothing: called live
//              dry-run       a write with a dry-run path the node exposes (Demand → Post with Dry Run): called live, dry
//              idempotent    a write whose repeat changes nothing (re-registering OUR OWN card): called live
//              refusal-only  a write with no safe live path: only its refusals (and the wrong method) are called live, and
//                            the op is listed as a gap with why (docs/api-contract/N8N-OPS.md)
//   key        true: the probe key rides as X-API-Key (the op needs or uses the credential); false: keyless, with the
//              probe key in x-taifoon-probe so the layer counts the call as ours
//   params     (ids) => the node parameters a user would set; `ids` holds sample ids read live from list operations
//   ok         { status, fields: [top-level fields that must be present and not null], lists: [fields that must be
//              arrays], nonEmpty: [arrays that must hold at least one row] }
//   refusals   [{ why, params?, noKey?, badKey?, status: [allowed 4xx], code? }] — each one is called; a 5xx always fails,
//              and every refusal must be { ok:false, code, error, next_step } with a JSON Content-Type
//   budgetMs   the p95 latency this route must stay under (measured 2026-10-01, see docs/api-contract/N8N-OPS.md)
//   gap        for refusal-only ops: why there is no live success call
//   cleanup    async (json) => n: undoes what an answer created (Account → Register Free Key revokes any key it was answered)
//   extra      [{ why, params?, check(json, status) → problems[], todo? }] — what an answer must MEAN beyond its shape; a `todo`
//              names the change that owns the fix (reported by the run, not failing it, until it lands)
'use strict';

const ADDR = '0x3574999dd4c96eb73bd6e11d4177010c83e14f5b'; // the coordination vault (ours), a real seller on Base
const ZERO32 = '0x' + '00'.repeat(32);
const SAMPLE_TX = '0xcb5b7e936b815d19da46b63cd12af1ee61728037e19e106f1c3b454bb053b6cb'; // a Base tx the proof producer holds
const OUR_CARD = 'https://coord.taifoon.dev/v1/our-cards?card=proof';
const TEST_TAG = 'n8n-contract-test';

const NO_KEY = { why: 'no credential', noKey: true, status: [401] };
const BAD_KEY = { why: 'a key that does not exist', badKey: true, status: [401] };

/** @type {Record<string, any>} */
const SPEC = {
	// ── Account ──
	'account.me': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: ['tenant', 'keys', 'next_step'] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 4000 },
	'account.register': {
		mode: 'refusal-only', key: false, params: () => ({ walletAddress: ADDR }),
		ok: { status: 201, fields: ['api_key', 'key_prefix', 'tier'] },
		// never an empty wallet here: since 2026-10-01 (_REGISTER_ONE_CALL_v1_) no wallet mints a key too
		refusals: [{ why: 'not an address', params: { walletAddress: 'not-an-address' }, status: [400], code: 'bad_wallet' }],
		gap: 'mints a real free key (3 a day per IP) and a tenant; no recorded success body exists, so only the refusal is called',
		// should a refusal ever mint (a regression), the keys it answered are revoked at once (each revokes itself)
		cleanup: async (json) => {
			const keys = [json?.api_key, json?.keys?.live, json?.keys?.sandbox].filter((k) => typeof k === 'string' && k.startsWith('tfr_'));
			for (const k of [...new Set(keys)]) await fetch('https://coord.taifoon.dev/v1/relayer/keys/revoke', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': k }, body: JSON.stringify({ self: true }) }).catch(() => null);
			return keys.length;
		},
		budgetMs: 4000,
	},
	// ── the key path: subscribe → quote → (pay and sign: the holder's wallet) → claim → children (n8n-nodes-taifoon 0.8.0) ──
	'account.subscribe': {
		mode: 'refusal-only', key: false, params: () => ({ subscribeUsdc: 1, subscribeChainId: 8453 }),
		ok: { status: 201, fields: ['api_key', 'key_prefix', 'offer', 'pay'] },
		refusals: [BAD_KEY],
		budgetMs: 6000,
		gap: 'with create_key it mints a free key (the same visitor budget as register), so only a refusal the layer answers before the mint is called (a key that does not exist → 401)',
	},
	'account.accessQuote': {
		mode: 'read', key: false, params: () => ({ quoteProduct: 'builder-99', quoteChainId: 8453 }),
		ok: { status: 200, fields: ['product', 'plan', 'pay', 'sign', 'steps', 'for_a_person'] },
		refusals: [{ why: 'a plan that is not one', params: { quoteProduct: 'gold-1' }, status: [400], code: 'bad_param' }, { why: 'a chain that does not pay', params: { quoteChainId: 1 }, status: [400], code: 'bad_param' }],
		budgetMs: 6000,
		extra: [{ why: 'without a key there is nothing to sign, and the first step says to register', check: (j) => (j.sign && j.sign.message === null && /register/.test(String((j.steps || [])[0])) ? [] : ['a keyless quote must carry sign.message null and name POST /v1/register as its first step']) }],
	},
	'account.claimPlan': {
		mode: 'refusal-only', key: true, params: () => ({ claimPlan: 'builder-99', claimTx: ZERO32, claimSignature: '0x' + '00'.repeat(65), claimChainId: 8453 }),
		ok: { status: 200, fields: ['period', 'plan'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a transaction the chain does not hold', params: { claimTx: ZERO32 }, status: [400, 403, 404, 429] }],
		budgetMs: 6000,
		gap: 'a claim credits a plan period from a real transfer; only the refusals are called',
	},
	'account.claimTopUp': {
		mode: 'refusal-only', key: true, params: () => ({ claimTx: ZERO32, claimSignature: '0x' + '00'.repeat(65), claimChainId: 8453 }),
		ok: { status: 200, fields: ['credited'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a transaction the chain does not hold', params: { claimTx: ZERO32 }, status: [400, 403, 404, 429] }],
		budgetMs: 6000,
		gap: 'a top-up credits a balance from a real transfer; only the refusals are called',
	},
	'account.keyStanding': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 4000 },
	'account.resellerView': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 4000, gap: 'the probe tenant is a reseller by default; a child key would answer 403' },
	'account.mintChildKey': {
		mode: 'refusal-only', key: true, params: () => ({ childLabel: TEST_TAG, childMarkupBps: '{ "*": 1000 }' }),
		ok: { status: 201, fields: ['child', 'keys', 'shown_once'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a markup that is not an object of bps', params: { childMarkupBps: '[1]' }, status: [400], code: 'bad_param' }],
		budgetMs: 6000,
		gap: 'mints a child tenant (10 a day per reseller) whose keys are shown once; only the refusals are called',
	},
	// ── Inference (1.0.1): the resold models and one chat through the OpenAI-compatible gate on coord ──
	'inference.listModels': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['data'], lists: ['data'], nonEmpty: ['data'] }, refusals: [], budgetMs: 6000 },
	'inference.chat': {
		// one short answer on our own GPU, metered on the probe key's free agreement (a few hundred-thousandths of a dollar)
		openai: true,
		mode: 'read', key: true, params: () => ({ model: 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16', messages: '[{"role":"user","content":"Say hello in five words."}]', maxTokens: 16 }),
		ok: { status: 200, fields: ['id', 'choices', 'usage'], lists: ['choices'], nonEmpty: ['choices'] },
		// _PROBE_402_v1_ (web 2026-10-22): the chat door is also an x402 door, so a call with no key is offered the price (402), never 401
		refusals: [{ ...NO_KEY, why: 'no credential: the x402 door answers 402 with the price', status: [402] }, BAD_KEY, { why: 'no messages', params: { model: 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16', messages: '[]', maxTokens: 16 }, status: [400] }],
		budgetMs: 20000,
	},
	'account.registerSeller': {
		mode: 'refusal-only', key: true, params: () => ({ cardUrl: 'https://n8n.taifoon.dev/webhook/tfn-digest-card' }),
		ok: { status: 201, fields: ['listing', 'nonce'] },
		// _KEYLESS_CLAIM_SPEC_v1_ (2026-10-28): since _PAY_IN_v1_ (coord pay-in.cue s-claim-key) a claim needs no key, so "no credential"
		// with a real card URL WROTE a listing row every hour until 116's address hit its 20 a day (then 429). The keyless case now
		// sends a body the card check refuses before any write; 429 is the same refusal once the address's day is spent.
		refusals: [{ why: 'no credential, not a URL: a keyless claim reaches the card check and writes nothing', noKey: true, params: { cardUrl: 'not a url' }, status: [400, 422, 429] }, BAD_KEY, { why: 'not a URL', params: { cardUrl: 'not a url' }, status: [400, 422] }],
		gap: 'a claim writes a listing row (20 a day per key or, keyless, per address); no recorded success body exists, so only the refusals are called',
		budgetMs: 6000,
	},
	'account.verifySeller': {
		mode: 'refusal-only', key: true, params: () => ({ sellerListingId: 'ls_0000000000000000' }),
		ok: { status: 200, fields: ['listing'] },
		refusals: [{ why: 'no credential: a keyless verify reaches the listing lookup (the served nonce proves the seller)', noKey: true, params: { sellerListingId: 'ls_0000000000000000' }, status: [404] }, { why: 'unknown listing', params: { sellerListingId: 'ls_0000000000000000' }, status: [404] }],
		gap: 'the claimant (its key, or keyless its address) verifies by serving the nonce, and verifying probes the seller; only the refusals are called',
		budgetMs: 8000,
	},

	// ── Agent ──
	'agent.getCards': { mode: 'read', key: false, params: () => ({ cardFilters: { limit: 5 } }), ok: { status: 200, fields: ['cards', 'skills_seen'], lists: ['cards'], nonEmpty: ['cards'] }, refusals: [{ why: 'a negative limit', params: { cardFilters: { limit: -1 } }, status: [400] }], budgetMs: 6000 },
	'agent.getMarket': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'agent.getProviders': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'agent.getRegistered': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'agent.getReputation': { mode: 'read', key: false, params: () => ({ address: ADDR }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a shortened address', params: { address: '0x3574…4f5b' }, status: [400] }], budgetMs: 8000 },
	'agent.getWireReady': { mode: 'read', key: false, params: () => ({ wireChain: 8453, wireLimit: 5 }), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'agent.match': { mode: 'read', key: false, params: () => ({ required_skills: 'summarization' }), ok: { status: 200, fields: [] }, refusals: [{ why: 'no skills', params: { required_skills: '' }, status: [400] }], budgetMs: 10000 },
	'agent.planEnrollment': {
		mode: 'plan', key: false, params: () => ({ operator: ADDR, endpoint: 'https://n8n.taifoon.dev/webhook/taifoon-hire', priceMin: 0.01, priceMax: 0.05, enrollOptions: { skills: 'typed-decisions' } }),
		ok: { status: 200, fields: [] }, refusals: [{ why: 'a shortened operator', params: { operator: '0x3574…4f5b', endpoint: 'https://n8n.taifoon.dev/webhook/taifoon-hire', priceMin: 0.01, priceMax: 0.05, enrollOptions: { skills: 'typed-decisions' } }, status: [400, 422] }], budgetMs: 8000,
	},
	'agent.publishAsSeller': {
		mode: 'plan', key: false, params: () => ({ operator: ADDR, endpoint: 'https://n8n.taifoon.dev/webhook/taifoon-hire', priceMin: 0.01, priceMax: 0.05, enrollOptions: { skills: 'typed-decisions' } }),
		ok: { status: 200, fields: [] }, refusals: [{ why: 'not https', params: { operator: ADDR, endpoint: 'ftp://x', priceMin: 0.01, priceMax: 0.05 }, status: [400, 422] }], budgetMs: 8000,
	},
	'agent.register': {
		mode: 'idempotent', key: true, params: () => ({ card_url: OUR_CARD }),
		ok: { status: 200, fields: [] }, refusals: [BAD_KEY, { why: 'not a URL', params: { card_url: 'not a url' }, status: [400, 422] }], budgetMs: 10000,
	},

	// ── Assurance ──
	'assurance.buildCall': {
		mode: 'plan', key: false, params: () => ({ chainId: 8453, action: JSON.stringify({ kind: 'expire', jobId: ZERO32 }) }), ok: { status: 200, fields: [] },
		refusals: [{ why: 'an unknown action', params: { chainId: 8453, action: '{"kind":"nope"}' }, status: [400] }], budgetMs: 8000,
		extra: [{ why: 'fund-job with its terms missing is a 400 naming them (not an encoder error)', params: { chainId: 8453, action: JSON.stringify({ kind: 'fund-job', jobId: ZERO32 }) },
			check: (j, st) => [st === 400 ? null : `status ${st}`, /BigInt/.test(String(j?.error)) ? 'the error is the encoder\'s' : null, /seller|price|deposit/.test(String(j?.error) + JSON.stringify(j?.missing ?? '')) ? null : 'the missing fields are not named'].filter(Boolean) }],
	},
	'assurance.getDeployment': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 4000 },
	'assurance.getPools': { mode: 'read', key: false, params: () => ({ limit: 5 }), ok: { status: 200, fields: ['pools'], lists: ['pools'] }, refusals: [], budgetMs: 10000 },
	'assurance.getQuote': { mode: 'read', key: false, params: () => ({ chainId: 8453, seller: ADDR, price: '100000' }), ok: { status: 200, fields: [] }, refusals: [{ why: 'not an integer price', params: { chainId: 8453, seller: ADDR, price: '1.5' }, status: [400] }], budgetMs: 10000 },
	'assurance.stampGrade': { mode: 'plan', key: false, params: () => ({ chainId: 36927, stampSubject: '0x' + '11'.repeat(32), stampDigest: '0x' + '22'.repeat(32) }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a subject that is not bytes32', params: { chainId: 36927, stampSubject: '0x11', stampDigest: '0x' + '22'.repeat(32) }, status: [400] }], budgetMs: 8000 },

	// ── Catalog ──
	'catalog.get': { mode: 'read', key: false, params: (ids) => ({ catalogId: ids.catalog }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { catalogId: 'cat_0000000000000000' }, status: [404] }], budgetMs: 8000 },
	'catalog.getListing': { mode: 'read', key: false, params: (ids) => ({ listingId: ids.listing }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { listingId: 'ls_0000000000000000' }, status: [404] }], budgetMs: 6000 },
	'catalog.getAll': { mode: 'read', key: false, params: () => ({ catalogFilters: { limit: 5 } }), ok: { status: 200, fields: ['rows'], lists: ['rows'], nonEmpty: ['rows'] }, refusals: [], budgetMs: 8000 },
	'catalog.getManyListings': { mode: 'read', key: false, params: () => ({ listingFilters: { limit: 5 } }), ok: { status: 200, fields: ['rows'], lists: ['rows'] }, refusals: [{ why: 'an unknown state', params: { listingFilters: { state: 'nope' } }, status: [400] }], budgetMs: 6000 },

	// ── Completion ──
	'completion.getStatus': { mode: 'read', key: true, params: (ids) => ({ jobId: ids.completionJob, statusNonce: 'n8n-contract-test' }), ok: { status: [200, 404], fields: [] }, refusals: [NO_KEY, { why: 'not a job id', params: { jobId: 'not-a-job', statusNonce: 'x' }, status: [400] }], budgetMs: 6000 },
	'completion.submit': { operatorKey: true,
		mode: 'refusal-only', key: true, params: () => ({ jobId: '1', nonce: TEST_TAG, provider: ADDR, proofTx: SAMPLE_TX, result: 'x' }),
		ok: { status: 200, fields: [] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a shortened proof hash', params: { jobId: '1', nonce: TEST_TAG, provider: ADDR, proofTx: '0xd59d…8b47', result: 'x' }, status: [400, 422] }],
		gap: 'a completion is re-verified and may send a transaction; only the refusals are called',
		budgetMs: 15000,
	},

	// ── Demand ──
	'demand.get': { mode: 'read', key: false, params: (ids) => ({ demandId: ids.demand }), ok: { status: 200, fields: ['demand'] }, refusals: [{ why: 'unknown id', params: { demandId: 'dm_000000000000000000000000' }, status: [404] }], budgetMs: 6000 },
	'demand.getAll': { mode: 'read', key: false, params: () => ({ limit: 5 }), ok: { status: 200, fields: ['demands'], lists: ['demands'] }, refusals: [{ why: 'an unknown state', params: { demandState: 'nope' }, status: [400] }], budgetMs: 6000 },
	'demand.post': {
		mode: 'dry-run', key: true, params: () => ({ need: 'the sha256 digest of the text "hello"', demandOptions: { dryRun: true, buyerLabel: TEST_TAG } }),
		ok: { status: 200, fields: [] }, refusals: [BAD_KEY, { why: 'no words', params: { need: '', demandOptions: { dryRun: true } }, status: [400, 422] }], budgetMs: 8000,
	},

	// ── Discovery (the harvest operations were removed in 0.6.1) ──
	'discovery.getCapabilities': {
		mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000,
		extra: [{ why: 'the hosted counts are named in English (measured, customers)',
			check: (j) => (j?.hosted?.workflows == null ? [] : [typeof j.hosted.measured === 'number' ? null : 'hosted.measured', typeof j.hosted.customers === 'number' ? null : 'hosted.customers'].filter(Boolean)) }],
	},
	'discovery.getCapabilitySkills': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'discovery.getStandards': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['deployments'] }, refusals: [], budgetMs: 6000 },
	'discovery.searchCapabilities': { mode: 'read', key: false, params: () => ({ q: 'telegram', capabilityFilters: { limit: 5 } }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a negative offset', params: { q: 'x', capabilityFilters: { offset: -1 } }, status: [400] }], budgetMs: 8000 },

	// ── Explorer ──
	'explorer.get': { mode: 'read', key: false, params: (ids) => ({ explorerId: ids.demand }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { explorerId: 'dm_000000000000000000000000' }, status: [404] }], budgetMs: 10000 },
	'explorer.getAll': { mode: 'read', key: false, params: () => ({ explorerFilters: { limit: 5 } }), ok: { status: 200, fields: ['rows'], lists: ['rows'], nonEmpty: ['rows'] }, refusals: [{ why: 'an unknown buyer class', params: { explorerFilters: { buyer: 'nope' } }, status: [400] }], budgetMs: 10000 },

	// ── Handshake ──
	'handshake.attachJob': { operatorKey: true, mode: 'refusal-only', key: true, params: () => ({ handshakeId: 'hs_000000000000000000000000', jobId: '1' }), ok: { status: 200, fields: [] }, refusals: [NO_KEY, { why: 'unknown handshake', params: { handshakeId: 'hs_000000000000000000000000', jobId: '1' }, status: [404] }], gap: 'attaching advances a real handshake; only the refusals are called', budgetMs: 8000 },
	'handshake.get': { mode: 'read', key: false, params: (ids) => ({ handshakeId: ids.handshake }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { handshakeId: 'hs_000000000000000000000000' }, status: [404] }], budgetMs: 8000 },
	'handshake.open': {
		mode: 'refusal-only', key: true, params: () => ({ candidateAddress: ADDR, candidateKind: 'onchain', task: TEST_TAG }),
		ok: { status: 201, fields: [] },
		refusals: [BAD_KEY, { why: 'a shortened candidate', params: { candidateAddress: '0x3574…4f5b', candidateKind: 'onchain', task: TEST_TAG }, status: [400, 422] }, { why: 'no task', params: { candidateAddress: ADDR, candidateKind: 'onchain', task: '' }, status: [400, 422] }],
		gap: 'opening records a handshake the explorer lists (a public record); only the refusals are called', budgetMs: 10000,
	},

	// ── Helpdesk (1.1.0): Show Me Around ++ (_SMA_HELPDESK_v1_) — the graph reads are live; every write is refusal-only (a case,
	// an answer, a grade or a nomination is a row of a real tenant, and a case past the free allowance is metered) ──
	'helpdesk.getGraph': { mode: 'read', key: false, params: () => ({ smaGraphProduct: 'taifoon', smaGraphScope: 'public' }), ok: { status: 200, fields: ['product', 'scope', 'nodes', 'edges', 'count'], lists: ['nodes', 'edges'] }, refusals: [{ why: 'no product', params: { smaGraphProduct: '' }, status: [400] }, { why: 'the tenant scope without a key', params: { smaGraphProduct: 'taifoon', smaGraphScope: 'tenant' }, status: [401, 403] }], budgetMs: 8000 },
	'helpdesk.getWeakest': { mode: 'read', key: false, params: () => ({ smaGraphProduct: 'taifoon', smaGraphScope: 'public' }), ok: { status: 200, fields: ['product', 'scope', 'weakest', 'count'], lists: ['weakest'] }, refusals: [{ why: 'no product', params: { smaGraphProduct: '' }, status: [400] }], budgetMs: 8000 },
	'helpdesk.ask': {
		mode: 'refusal-only', key: true, params: () => ({ smaProduct: 'taifoon', smaQuestion: `${TEST_TAG}: where is the key my workflow sends?` }),
		ok: { status: [200, 201], fields: ['case', 'next'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a question too short', params: { smaProduct: 'taifoon', smaQuestion: 'x' }, status: [400, 422] }, { why: 'not a product id', params: { smaProduct: 'Not A Product', smaQuestion: 'where is the key my workflow sends?' }, status: [400, 404, 422] }],
		gap: 'opens a real case on the key’s tenant and, past the free allowance of 20 a day, meters 0.10 USDC; only the refusals are called',
		budgetMs: 15000,
	},
	'helpdesk.answer': { mode: 'refusal-only', key: true, params: () => ({ smaCase: 'case_0000000000000000', smaAnswerWords: TEST_TAG }), ok: { status: 200, fields: ['case'] }, refusals: [NO_KEY, { why: 'unknown case', params: { smaCase: 'case_0000000000000000', smaAnswerWords: TEST_TAG }, status: [403, 404] }, { why: 'not a case id', params: { smaCase: 'nope', smaAnswerWords: TEST_TAG }, status: [400, 422] }], gap: 'an answer is written on a real open case of the key’s tenant; only the refusals are called', budgetMs: 8000 },
	'helpdesk.grade': { mode: 'refusal-only', key: true, params: () => ({ smaCase: 'case_0000000000000000', smaGradeScore: 1, smaGradeBy: 'buyer' }), ok: { status: 200, fields: ['case'] }, refusals: [NO_KEY, { why: 'unknown case', params: { smaCase: 'case_0000000000000000', smaGradeScore: 1, smaGradeBy: 'buyer' }, status: [403, 404] }, { why: 'a score above 1', params: { smaCase: 'case_0000000000000000', smaGradeScore: 2, smaGradeBy: 'buyer' }, status: [400, 422] }], gap: 'a grade settles a real case (the grade-gate loop); only the refusals are called', budgetMs: 8000 },
	'helpdesk.tune': { mode: 'refusal-only', key: true, params: () => ({ smaCase: 'case_0000000000000000', smaTuneLoop: 'grade-gate', smaTuneValue: 0.5 }), ok: { status: 200, fields: ['tuning'] }, refusals: [NO_KEY, { why: 'a free key is no admin, and the case is unknown', params: { smaCase: 'case_0000000000000000', smaTuneLoop: 'grade-gate', smaTuneValue: 0.5 }, status: [403, 404] }], gap: 'tuning changes a loop of a real tenant (admin only); only the refusals are called', budgetMs: 8000 },
	'helpdesk.nominate': {
		mode: 'refusal-only', key: true, params: () => ({ smaProduct: 'taifoon', smaExpert: 'key:000000000000000000000000', smaPayee: ADDR, smaChains: 'eip155:36927', smaShareBps: 7000, smaCapMicroPerPeriod: 100000000, smaPeriod: 'month', smaClasses: 'sma.case' }),
		ok: { status: [200, 201], fields: ['id', 'state'] },
		refusals: [NO_KEY, { why: 'a share above 7000 bps', params: { smaProduct: 'taifoon', smaExpert: 'key:000000000000000000000000', smaPayee: ADDR, smaChains: 'eip155:36927', smaShareBps: 9000, smaCapMicroPerPeriod: 1, smaPeriod: 'month', smaClasses: 'sma.case' }, status: [400, 422] }, { why: 'a free key is no admin of the product', params: { smaProduct: 'taifoon', smaExpert: 'key:000000000000000000000000', smaPayee: ADDR, smaChains: 'eip155:36927', smaShareBps: 7000, smaCapMicroPerPeriod: 1, smaPeriod: 'month', smaClasses: 'sma.case' }, status: [403, 404] }],
		gap: 'a nomination is a signed claim the payee resolver reads, written for a real product by its admin key; only the refusals are called',
		budgetMs: 8000,
	},
	'helpdesk.acceptNomination': { mode: 'refusal-only', key: true, params: () => ({ smaNominationId: 'nom_0000000000000000' }), ok: { status: 200, fields: ['id', 'state'] }, refusals: [NO_KEY, { why: 'unknown nomination', params: { smaNominationId: 'nom_0000000000000000' }, status: [403, 404] }, { why: 'not a nomination id', params: { smaNominationId: 'nope' }, status: [400, 422] }], gap: 'only the nominated expert’s key may accept; only the refusals are called', budgetMs: 8000 },
	'helpdesk.revokeNomination': { mode: 'refusal-only', key: true, params: () => ({ smaNominationId: 'nom_0000000000000000' }), ok: { status: 200, fields: ['id', 'state'] }, refusals: [NO_KEY, { why: 'unknown nomination', params: { smaNominationId: 'nom_0000000000000000' }, status: [403, 404] }], gap: 'only the admin key that proposed a nomination may revoke it; only the refusals are called', budgetMs: 8000 },

	// ── Job ──
	'job.createOffer': { mode: 'plan', key: false, params: () => ({ chainId: 8453, seller: ADDR, price: '100000' }), ok: { status: 200, fields: [] }, refusals: [{ why: 'not an integer price', params: { chainId: 8453, seller: ADDR, price: 'abc' }, status: [400, 422] }], budgetMs: 10000 },
	'job.getChanged': {
		mode: 'read', key: false, params: () => ({ since: '0', changedFilters: { limit: 5 } }), ok: { status: 200, fields: ['jobs', 'cursor'], lists: ['jobs'] },
		refusals: [{ why: 'a cursor that is not one', params: { since: 'yesterday' }, status: [400] }], budgetMs: 8000,
		extra: [
			{ why: 'each party names its address and protocol (not under agentId, never null)',
				check: (j) => (j?.jobs ?? []).flatMap((r) => [r.seller?.address ? null : `${r.id}: seller.address`, r.seller?.protocol ? null : `${r.id}: seller.protocol`, r.buyer?.protocol ? null : `${r.id}: buyer.protocol`, 'genome' in r && r.genome === null ? `${r.id}: genome null` : null, 'skill' in r && r.skill === null ? `${r.id}: skill null` : null]).filter(Boolean).slice(0, 5) },
			{ why: 'chain 36927 lists the devnet hires a seller follows', params: { since: '0', changedFilters: { chain: 36927, limit: 5 } },
				check: (j) => ((j?.jobs ?? []).length > 0 ? [] : ['no devnet jobs']) },
		],
	},
	'job.getLedger': { mode: 'read', key: false, params: () => ({ ledgerFilters: { limit: 5 } }), ok: { status: 200, fields: ['jobs'], lists: ['jobs'] }, refusals: [{ why: 'a shortened participant', params: { ledgerFilters: { participant: '0x3574…4f5b' } }, status: [400] }], budgetMs: 8000 },

	// ── Judge ──
	// Prepare (the two-step's first half): the facts and the questions, no Jev call, nothing recorded. One call and Answers are
	// a Jev grade and a recorded decision: not called live (a gap, listed in docs/api-contract/N8N-OPS.md).
	'judge.compose': {
		mode: 'plan', key: false, params: (ids) => ({ composeHandshakeId: ids.handshake, composeMode: 'prepare' }),
		ok: { status: 200, fields: ['facts', 'jev', 'prepare_digest'] },
		refusals: [{ why: 'no subject', params: { composeHandshakeId: '', composeMode: 'prepare' }, status: [400], code: 'no_subject' }, { why: 'unknown handshake', params: { composeHandshakeId: 'hs_000000000000000000000000', composeMode: 'prepare' }, status: [404] }],
		budgetMs: 15000,
	},
	'judge.getReady': { mode: 'read', key: false, params: () => ({ readyLimit: 5 }), ok: { status: 200, fields: ['jobs'], lists: ['jobs'] }, refusals: [], budgetMs: 15000 },
	'judge.getReviewable': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['jobs'], lists: ['jobs'] }, refusals: [], budgetMs: 10000 },
	'judge.getStages': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 4000 },
	'judge.getTrace': { mode: 'read', key: false, params: (ids) => ({ traceChain: 8453, traceJobId: ids.traceJob }), ok: { status: 200, fields: [] }, refusals: [{ why: 'not a job id', params: { traceChain: 8453, traceJobId: 'abc' }, status: [400] }], budgetMs: 15000 },
	'judge.giveFeedback': { mode: 'plan', key: false, params: () => ({ chainId: 36927, agentId: '1', digest: '0x' + '22'.repeat(32) }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a digest that is not bytes32', params: { chainId: 36927, agentId: '1', digest: '0x22' }, status: [400] }], budgetMs: 8000 },
	'judge.grade': {
		mode: 'refusal-only', key: true, params: () => ({ items: '[{"id":"1","state":"delivered"}]' }), ok: { status: 200, fields: [] },
		refusals: [{ why: 'no items', params: { items: '[]' }, status: [400] }],
		gap: 'a grade is a Jev call (free quota or paid); only the refusal is called', budgetMs: 30000,
	},
	'judge.judgeRef': {
		mode: 'refusal-only', key: true, params: () => ({ state: 'delivered' }), ok: { status: 200, fields: [] },
		refusals: [{ why: 'no state', params: { state: '' }, status: [400] }],
		gap: 'a Jev call; only the refusal is called', budgetMs: 30000,
	},
	'judge.postVerdict': { mode: 'plan', key: false, params: () => ({ chainId: 36927, jobId: ZERO32, digest: '0x' + '22'.repeat(32) }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a digest that is not bytes32', params: { chainId: 36927, jobId: ZERO32, digest: '0x22' }, status: [400] }], budgetMs: 8000 },
	'judge.recordAnswers': { operatorKey: true,
		mode: 'refusal-only', key: true, params: () => ({ recordSubject: TEST_TAG, recordReply: '{"answers":[]}' }), ok: { status: 201, fields: ['digest'] },
		refusals: [NO_KEY, { why: 'a record with no answers', params: { recordSubject: TEST_TAG, recordReply: '{"answers":[]}' }, status: [400] }],
		gap: 'a record is stored and served publicly; only the refusals are called', budgetMs: 10000,
	},
	'judge.submitReview': {
		mode: 'refusal-only', key: true, params: () => ({ reviewJobId: '1', reviewEvidence: '[]' }), ok: { status: 200, fields: [] },
		refusals: [NO_KEY, { why: 'no evidence', params: { reviewJobId: '1', reviewEvidence: '[]' }, status: [400, 403] }],
		gap: 'a review credits GRID points; only the refusals are called', budgetMs: 15000,
	},

	// ── Proof ──
	'proof.getRoot': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['root', 'anchoredAt', 'chainsCovered'] }, refusals: [], budgetMs: 6000 },
	'proof.getTxProof': {
		mode: 'read', key: false, params: (ids) => ({ chainId: 8453, txHash: ids.baseTx ?? SAMPLE_TX }), ok: { status: [200, 409], fields: [] },
		// a recent tx (the newest ledger job's): its proof is served or pending; 409 PROVABLE_GAP only if the producer skipped that
		// very block — a permanent, documented answer (_PROOF_HONEST_v1_), never a wait
		refusals: [{ why: 'a shortened hash', params: { chainId: 8453, txHash: '0xcb5b…b6cb' }, status: [400] }], budgetMs: 30000,
		// a pending proof says where its block sits against the verifiable range (never a null range) and when to ask again
		extra: [{ why: 'a pending proof names its range and state',
			check: (j) => (!j?.pending_proof ? [] : [typeof j.checks?.within_verifiable_range === 'boolean' ? null : 'checks.within_verifiable_range is not a boolean', typeof j.retry_after_seconds === 'number' ? null : 'no retry_after_seconds', j.proof_state ? null : 'no proof_state'].filter(Boolean)) }],
	},
	'proof.attestHire': { mode: 'read', key: false, params: (ids) => ({ claim: { txHash: ids.baseTx ?? SAMPLE_TX, chainId: 8453 } }), ok: { status: 200, fields: [] }, refusals: [{ why: 'no claim', params: { claim: {} }, status: [400] }], budgetMs: 20000 },

	// ── Settlement ──
	'settlement.get': { mode: 'read', key: false, params: (ids) => ({ settlementId: ids.settlement }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { settlementId: ZERO32 }, status: [404] }], budgetMs: 8000 },
	'settlement.getAll': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['settlements'], lists: ['settlements'] }, refusals: [], budgetMs: 8000 },
	'settlement.settle': {
		mode: 'plan', key: false, params: () => ({ kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0x' + 'ab'.repeat(32), refId: TEST_TAG }),
		ok: { status: 200, fields: [] }, refusals: [{ why: 'an evidence that is not bytes32', params: { kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0xab', refId: TEST_TAG }, status: [400] }], budgetMs: 10000,
	},

	// ── Commerce (1.1.0): hire, grade, settle as one resource, the same requests as Job → Create Offer, Judge → Grade, Settlement →
	// Settle (and the MCP tools taifoon_hire, taifoon_grade, taifoon_settle_plan). Settle is a plan only. `key: true`: the probe
	// key rides with its channel (X-Taifoon-Channel), as an integrator's credential would.
	'commerce.hire': { mode: 'plan', key: true, params: () => ({ chainId: 8453, seller: ADDR, price: '100000' }), ok: { status: 200, fields: ['calls'], lists: ['calls'] },
		refusals: [{ why: 'not an integer price', params: { chainId: 8453, seller: ADDR, price: 'abc' }, status: [400, 422] }], budgetMs: 10000,
		extra: [{ why: 'an offer is unsigned: no call carries a signature and nothing was sent', check: (j) => (JSON.stringify(j ?? {}).match(/"(signature|signedTx|raw_tx)"\s*:\s*"0x[0-9a-f]{20,}/i) ? ['a signed call'] : []) }] },
	'commerce.grade': {
		mode: 'refusal-only', key: true, params: () => ({ items: '[{"id":"1","state":"delivered"}]' }), ok: { status: 200, fields: [] },
		refusals: [{ why: 'no items', params: { items: '[]' }, status: [400] }, { why: 'no TypeSafe key of your own', params: { items: '[{"id":"1","state":"delivered"}]' }, status: [402, 403] }],
		gap: 'a grade is a Jev call on the caller\'s own TypeSafe key; only the refusals are called', budgetMs: 30000,
	},
	'commerce.settle': {
		mode: 'plan', key: true, params: () => ({ kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0x' + 'ab'.repeat(32), refId: TEST_TAG }),
		ok: { status: 200, fields: ['calls'], lists: ['calls'] },
		refusals: [{ why: 'an evidence that is not bytes32', params: { kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0xab', refId: TEST_TAG }, status: [400] }], budgetMs: 10000,
		extra: [{ why: 'a plan only: every call is unsigned and names who signs it', check: (j) => (Array.isArray(j?.calls) ? j.calls.filter((c) => c && (c.signed === true || c.signature)).map((c) => `signed: ${c.to ?? c.step ?? '?'}`) : ['no calls[]']) }],
	},

	// ── Template (1.1.0) ──
	// ── 1.2.0, generated from coord lang/cue/n8n-resale.cue node_ops (scripts/gen-descriptions.mjs): the reseller's child keys, promos and
	// client vaults, the agreements, the n8n demand. The probe key is a self-serve tenant: the partner-only writes answer their refusal. ──
	'resellerKey.mintChildKey': {
		mode: 'refusal-only', key: true, params: () => ({ childLabel: TEST_TAG, capUsdc: 1 }),
		ok: { status: 201, fields: ['key_id', 'prefix', 'cap_usdc', 'shown_once'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a self-serve reseller has no child keys', status: [403], code: 'child_keys_off' }],
		budgetMs: 6000,
		gap: 'mints a real child key (shown once) for an enrolled partner only; the probe tenant is self-serve, so only the refusals are called',
	},
	'resellerKey.listChildKeys': { mode: 'read', key: true, params: () => ({ usageWindow: '1d' }), ok: { status: 200, fields: ['children', 'count', 'program'], lists: ['children', 'by_key', 'by_channel'] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 6000 },
	'resellerKey.revokeChildKey': {
		mode: 'refusal-only', key: true, params: () => ({ childKeyId: 'ck_000000000000000000000000' }),
		ok: { status: 200, fields: ['key_id', 'revoked'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a key id that is no child of this reseller', status: [404], code: 'not_found' }],
		budgetMs: 6000,
		gap: 'revokes a real child key; with no child of ours only the refusals are called',
	},
	'resellerKey.mintPromo': {
		mode: 'refusal-only', key: true, params: () => ({ promoKind: 'rebate', rebateBps: 100, maxRedemptions: 1, expiresInDays: 1 }),
		ok: { status: 201, fields: ['promo'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a self-serve reseller may not mint a promo', status: [403] }],
		budgetMs: 6000,
		gap: 'mints a code (shown once) for an enrolled partner only; only the refusals are called',
	},
	'resellerKey.listPromos': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: ['promos', 'may_mint'], lists: ['promos'] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 6000 },
	'resellerKey.redeemPromo': {
		mode: 'refusal-only', key: true, params: () => ({ promoCode: 'NOT-A-REAL-CODE' }),
		ok: { status: 200, fields: ['promo', 'kind'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a code that does not exist', params: { promoCode: 'NOT-A-REAL-CODE' }, status: [400, 404, 422] }],
		budgetMs: 6000,
		gap: 'a redemption binds a promo to the key; with no real code only the refusals are called',
	},
	'resellerKey.enrolClientVault': {
		mode: 'refusal-only', key: true, params: () => ({ clientLabel: TEST_TAG }),
		ok: { status: 201, fields: ['vault_id', 'client_tenant'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'a self-serve reseller may not enrol a vault', status: [403] }],
		budgetMs: 6000,
		gap: 'enrols a client tenant and its vault record for an enrolled partner only; only the refusals are called',
	},
	'resellerKey.listClientVaults': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: ['vaults', 'may_enrol'], lists: ['vaults'] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 6000 },
	'agreement.listAgreements': { mode: 'read', key: true, params: () => ({}), ok: { status: 200, fields: ['acceptances', 'gaps', 'documents'], lists: ['acceptances', 'documents'], nonEmpty: ['documents'] }, refusals: [NO_KEY, BAD_KEY], budgetMs: 6000 },
	'agreement.acceptAgreement': {
		mode: 'refusal-only', key: true, params: () => ({ agreementDoc: 'TAT', agreementProduct: 'api-access', agreementHow: 'clickwrap' }),
		ok: { status: 201, fields: ['acceptance'] },
		refusals: [NO_KEY, BAD_KEY],
		budgetMs: 6000,
		gap: 'records an acceptance for the probe key (an envelope on the stream); the acceptance is the key holder\'s act, so only the refusals are called',
	},
	// _N8N_DEMAND_PAID_v1_: the harvest rows answer paid keys only; a free probe key is told the price and the top-up (402)
	'template.demand': { mode: 'read', key: true, params: () => ({ demandKind: 'template', demandLimit: 1 }), ok: { status: [200, 402], fields: ['rows', 'count', 'total'], lists: ['rows'] }, refusals: [NO_KEY], budgetMs: 8000,
		extra: [{ why: 'a paid key reads the rows; a free key gets 402 paid_key_required with the price and a top-up step', check: (j, status) => (status === 200
			? (Array.isArray(j?.rows) ? [] : ['rows is not a list'])
			: [j?.code === 'paid_key_required' ? null : `code ${j?.code}`, j?.price?.per_call_usdc ? null : 'no price', j?.next_step?.action === 'top_up' ? null : 'no top_up step'].filter(Boolean)) }] },
	'template.list': {
		mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['templates', 'count'], lists: ['templates'], nonEmpty: ['templates'] },
		refusals: [{ why: 'a class no template sells', params: { templateClass: 'video.edit' }, status: [404], code: 'not_found' }], budgetMs: 8000,
		pending: 'GET /v1/n8n/templates ships with the channel-share release of the API; live after the owner\'s deploy',
		extra: [{ why: 'each template names its class, its channel and a price (the live one, or — with why)', check: (j) => (j?.templates ?? []).flatMap((t) => [t.class ? null : `${t.id}: class`, /^n8n-template:/.test(t.channel) ? null : `${t.id}: channel`, t.price?.usdc ? null : `${t.id}: price`]).filter(Boolean) }],
	},
};

/** The operations removed in 0.6.1 (GET /v1/harvest is ours only): the coverage test asserts the node no longer ships them. */
const REMOVED = ['discovery.getCandidates', 'discovery.getCoverage', 'discovery.getScan'];

module.exports = { SPEC, REMOVED, ADDR, TEST_TAG };
