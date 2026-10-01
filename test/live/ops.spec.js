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
		budgetMs: 4000,
	},
	'account.registerSeller': {
		mode: 'refusal-only', key: true, params: () => ({ cardUrl: 'https://n8n.taifoon.dev/webhook/tfn-digest-card' }),
		ok: { status: 201, fields: ['listing', 'nonce'] },
		refusals: [NO_KEY, BAD_KEY, { why: 'not a URL', params: { cardUrl: 'not a url' }, status: [400, 422] }],
		gap: 'a claim writes a listing row (20 a day per key); no recorded success body exists, so only the refusals are called',
		budgetMs: 6000,
	},
	'account.verifySeller': {
		mode: 'refusal-only', key: true, params: () => ({ sellerListingId: 'ls_0000000000000000' }),
		ok: { status: 200, fields: ['listing'] },
		refusals: [NO_KEY, { why: 'unknown listing', params: { sellerListingId: 'ls_0000000000000000' }, status: [404] }],
		gap: 'only the key that claimed a listing may verify it, and verifying probes the seller; only the refusals are called',
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
		extra: [{ why: 'fund-job with its terms missing is a 400 naming them (not an encoder error)', todo: 'hotfix agent (2026-10-01): assurance/call missing fields', params: { chainId: 8453, action: JSON.stringify({ kind: 'fund-job', jobId: ZERO32 }) },
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
	'completion.submit': {
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
		extra: [{ why: 'the hosted counts are named in English (measured, customers)', todo: 'hotfix agent (2026-10-01): capabilities hosted keys',
			check: (j) => (j?.hosted?.workflows == null ? [] : [typeof j.hosted.measured === 'number' ? null : 'hosted.measured', typeof j.hosted.customers === 'number' ? null : 'hosted.customers'].filter(Boolean)) }],
	},
	'discovery.getCapabilitySkills': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: [] }, refusals: [], budgetMs: 6000 },
	'discovery.getStandards': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['deployments'] }, refusals: [], budgetMs: 6000 },
	'discovery.searchCapabilities': { mode: 'read', key: false, params: () => ({ q: 'telegram', capabilityFilters: { limit: 5 } }), ok: { status: 200, fields: [] }, refusals: [{ why: 'a negative offset', params: { q: 'x', capabilityFilters: { offset: -1 } }, status: [400] }], budgetMs: 8000 },

	// ── Explorer ──
	'explorer.get': { mode: 'read', key: false, params: (ids) => ({ explorerId: ids.demand }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { explorerId: 'dm_000000000000000000000000' }, status: [404] }], budgetMs: 10000 },
	'explorer.getAll': { mode: 'read', key: false, params: () => ({ explorerFilters: { limit: 5 } }), ok: { status: 200, fields: ['rows'], lists: ['rows'], nonEmpty: ['rows'] }, refusals: [{ why: 'an unknown buyer class', params: { explorerFilters: { buyer: 'nope' } }, status: [400] }], budgetMs: 10000 },

	// ── Handshake ──
	'handshake.attachJob': { mode: 'refusal-only', key: true, params: () => ({ handshakeId: 'hs_000000000000000000000000', jobId: '1' }), ok: { status: 200, fields: [] }, refusals: [NO_KEY, { why: 'unknown handshake', params: { handshakeId: 'hs_000000000000000000000000', jobId: '1' }, status: [404] }], gap: 'attaching advances a real handshake; only the refusals are called', budgetMs: 8000 },
	'handshake.get': { mode: 'read', key: false, params: (ids) => ({ handshakeId: ids.handshake }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { handshakeId: 'hs_000000000000000000000000' }, status: [404] }], budgetMs: 8000 },
	'handshake.open': {
		mode: 'refusal-only', key: true, params: () => ({ candidateAddress: ADDR, candidateKind: 'onchain', task: TEST_TAG }),
		ok: { status: 201, fields: [] },
		refusals: [BAD_KEY, { why: 'a shortened candidate', params: { candidateAddress: '0x3574…4f5b', candidateKind: 'onchain', task: TEST_TAG }, status: [400, 422] }, { why: 'no task', params: { candidateAddress: ADDR, candidateKind: 'onchain', task: '' }, status: [400, 422] }],
		gap: 'opening records a handshake the explorer lists (a public record); only the refusals are called', budgetMs: 10000,
	},

	// ── Job ──
	'job.createOffer': { mode: 'plan', key: false, params: () => ({ chainId: 8453, seller: ADDR, price: '100000' }), ok: { status: 200, fields: [] }, refusals: [{ why: 'not an integer price', params: { chainId: 8453, seller: ADDR, price: 'abc' }, status: [400, 422] }], budgetMs: 10000 },
	'job.getChanged': {
		mode: 'read', key: false, params: () => ({ since: '0', changedFilters: { limit: 5 } }), ok: { status: 200, fields: ['jobs', 'cursor'], lists: ['jobs'] },
		refusals: [{ why: 'a cursor that is not one', params: { since: 'yesterday' }, status: [400] }], budgetMs: 8000,
		extra: [
			{ why: 'each party names its address and protocol (not under agentId, never null)', todo: 'hotfix agent (2026-10-01): /v1/jobs row fields',
				check: (j) => (j?.jobs ?? []).flatMap((r) => [r.seller?.address ? null : `${r.id}: seller.address`, r.seller?.protocol ? null : `${r.id}: seller.protocol`, r.buyer?.protocol ? null : `${r.id}: buyer.protocol`, 'genome' in r && r.genome === null ? `${r.id}: genome null` : null, 'skill' in r && r.skill === null ? `${r.id}: skill null` : null]).filter(Boolean).slice(0, 5) },
			{ why: 'chain 36927 lists the devnet hires a seller follows', todo: 'hotfix agent (2026-10-01): /v1/jobs devnet', params: { since: '0', changedFilters: { chain: 36927, limit: 5 } },
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
	'judge.recordAnswers': {
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
		mode: 'read', key: false, params: () => ({ chainId: 8453, txHash: SAMPLE_TX }), ok: { status: [200, 404, 409], fields: [] },
		// 409 PROVABLE_GAP: the sample's block (50555567) is older than the headers the producer retains — a permanent answer (_PROOF_HONEST_v1_)
		refusals: [{ why: 'a shortened hash', params: { chainId: 8453, txHash: '0xcb5b…b6cb' }, status: [400] }], budgetMs: 30000,
		// a pending proof says where its block sits against the verifiable range (never a null range) and when to ask again
		extra: [{ why: 'a pending proof names its range and state', todo: 'hotfix agent (2026-10-01): /v1/proof/tx pending state',
			check: (j) => (!j?.pending_proof ? [] : [typeof j.checks?.within_verifiable_range === 'boolean' ? null : 'checks.within_verifiable_range is not a boolean', typeof j.retry_after_seconds === 'number' ? null : 'no retry_after_seconds', j.proof_state ? null : 'no proof_state'].filter(Boolean)) }],
	},
	'proof.attestHire': { mode: 'read', key: false, params: () => ({ claim: { txHash: SAMPLE_TX, chainId: 8453 } }), ok: { status: 200, fields: [] }, refusals: [{ why: 'no claim', params: { claim: {} }, status: [400] }], budgetMs: 20000 },

	// ── Settlement ──
	'settlement.get': { mode: 'read', key: false, params: (ids) => ({ settlementId: ids.settlement }), ok: { status: 200, fields: [] }, refusals: [{ why: 'unknown id', params: { settlementId: ZERO32 }, status: [404] }], budgetMs: 8000 },
	'settlement.getAll': { mode: 'read', key: false, params: () => ({}), ok: { status: 200, fields: ['settlements'], lists: ['settlements'] }, refusals: [], budgetMs: 8000 },
	'settlement.settle': {
		mode: 'plan', key: false, params: () => ({ kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0x' + 'ab'.repeat(32), refId: TEST_TAG }),
		ok: { status: 200, fields: [] }, refusals: [{ why: 'an evidence that is not bytes32', params: { kind: 'agent', chainId: 36927, buyer: '0x1111111111111111111111111111111111111111', seller: ADDR, price: '100000', evidence: '0xab', refId: TEST_TAG }, status: [400] }], budgetMs: 10000,
	},
};

/** The operations removed in 0.6.1 (GET /v1/harvest is ours only): the coverage test asserts the node no longer ships them. */
const REMOVED = ['discovery.getCandidates', 'discovery.getCoverage', 'discovery.getScan'];

module.exports = { SPEC, REMOVED, ADDR, TEST_TAG };
