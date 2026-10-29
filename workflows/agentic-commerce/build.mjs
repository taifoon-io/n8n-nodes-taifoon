// Taifoon agentic commerce for n8n: ONE main workflow and its handshake sub-workflows, built-in nodes only (they run before the
// community node is approved). The shape is coord lang/cue/n8n-resale.cue: an n8n instance resells both ways under the agentic-commerce
// agreements (agreements.cue: TSUL-1.1 + TAT for the buyer and the seller), every call on ONE key, every answer and every refusal in
// ONE error contract (gate-errors.cue: the OpenAI API error object at the status the openai SDK maps to its classes).
//
//   taifoon-agentic-commerce   the main flow: a form → tf.handshake → Switch on mode → tf.chat | tf.buy | tf.sell → one report
//   tf.handshake               the key's standing, the documents it still lacks (and, with consent, their acceptance), a top-up quote
//   tf.chat                    an OpenAI-compatible chat completion through the gate (POST /v1/chat/completions)
//   tf.buy                     a need in words → hired, graded, settled (POST /v1/demands, polled) → the job → the chain's verdict
//   tf.sell                    an n8n workflow listed as a seller: claim its card (a nonce), then verify (the layer probes the webhook)
//
// The key lives in ONE n8n credential (Header Auth, name X-API-Key): never a form field, never passed between workflows, never in an
// execution's data. Every HTTP step answers in full (status + body, never an n8n error) and the step's Code node reads it into
// { ok: true, … } or { ok: false, error: { code, status, type, sdk, retry, message, next }, retry_after }.
//   node n8n/coordination/workflows/agentic-commerce/build.mjs     writes the five workflow files beside this one
import { readFileSync, writeFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const ERRORS = JSON.parse(readFileSync(new URL('gate-errors.json', here), 'utf8'));
export const IDS = { main: 'tfAgenticMain01', handshake: 'tfHandshakeSub1', chat: 'tfChatSub000001', buy: 'tfBuySub0000001', sell: 'tfSellSub000001' };
const CRED = { httpHeaderAuth: { id: '', name: 'Taifoon key (Header Auth: X-API-Key)' } };

// the table, compact: layer code → [standard code, status, type, sdk, retry, next]
const TABLE = Object.fromEntries(ERRORS.errors.flatMap((e) => [e.code, ...e.from].map((c) => [c, [e.code, e.status, e.type, e.sdk, e.retry, e.next]])));
// the one normaliser every sub-workflow carries (generated: the table is coord's lang/gen/gate-errors.json)
export const NORMALISE = `// _GATE_ERRORS_v1_ (coord lang/cue/gate-errors.cue): every answer read into { ok: true, data } or the OpenAI-style error of the table.
const TABLE = ${JSON.stringify(TABLE)};
const SDK = (s) => s === 400 ? 'BadRequestError' : s === 401 ? 'AuthenticationError' : s === 403 ? 'PermissionDeniedError' : s === 404 ? 'NotFoundError' : s === 409 ? 'ConflictError' : s === 422 ? 'UnprocessableEntityError' : s === 429 ? 'RateLimitError' : s >= 500 ? 'InternalServerError' : 'APIError';
function norm(res, step) {
  const status = Number(res?.statusCode ?? 0); const body = res?.body ?? null;
  if (status >= 200 && status < 300 && !(body && body.ok === false)) return { ok: true, step, status, data: body };
  const layer = typeof body?.error === 'object' && body.error ? body.error.code : body?.code;
  const message = typeof body?.error === 'object' && body?.error ? body.error.message : (body?.error ?? body?.message ?? (status ? 'HTTP ' + status : 'no answer'));
  const row = TABLE[String(layer ?? '')] ?? TABLE[String(body?.taifoon?.layer_code ?? '')];
  const s = row ? row[1] : status || 503;
  const retryAfter = Number(res?.headers?.['retry-after'] ?? body?.retry_after_seconds ?? body?.taifoon?.retry_after_seconds) || null;
  return { ok: false, step, status: s, error: { code: row ? row[0] : String(layer ?? (status ? 'http_' + status : 'no_answer')), status: s, type: row ? row[2] : (s >= 500 ? 'api_error' : 'invalid_request_error'),
    sdk: row ? row[3] : SDK(s), retry: row ? row[4] : (s === 429 ? 'after' : s >= 500 ? 'backoff' : 'no'), message: String(message).slice(0, 300), next: (body?.taifoon?.next_step) || (row ? row[5] : null) },
    retry_after: retryAfter, layer: body?.taifoon ?? null };
}`;

const at = (x, y) => [x, y];
let n = 0;
const node = (name, type, typeVersion, position, parameters = {}, extra = {}) => ({ id: `n${++n}`, name, type, typeVersion, position, parameters, ...extra });
const trigger = (pos) => node('When called', 'n8n-nodes-base.executeWorkflowTrigger', 1.1, pos, { inputSource: 'passthrough' });
const code = (name, js, pos) => node(name, 'n8n-nodes-base.code', 2, pos, { jsCode: js });
const note = (name, content, pos, w = 460, h = 260) => node(name, 'n8n-nodes-base.stickyNote', 1, pos, { content, width: w, height: h });
/** an HTTP step on the one key: full answer, never an n8n error, so the normaliser decides */
const http = (name, method, url, pos, body) => node(name, 'n8n-nodes-base.httpRequest', 4.2, pos, {
  method, url, authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth',
  sendHeaders: true, headerParameters: { parameters: [{ name: 'X-Taifoon-Channel', value: 'n8n' }] },
  ...(body ? { sendBody: true, specifyBody: 'json', jsonBody: body } : {}),
  options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 60000 },
}, { credentials: CRED, alwaysOutputData: true });
const callSub = (name, id, pos) => node(name, 'n8n-nodes-base.executeWorkflow', 1.2, pos, { source: 'database', workflowId: { __rl: true, mode: 'id', value: id }, options: {} });
function workflow(id, name, nodes, links, extra = {}) {
  const connections = {};
  for (const [from, to, out = 0] of links) {
    connections[from] ??= { main: [] };
    while (connections[from].main.length <= out) connections[from].main.push([]);
    connections[from].main[out].push({ node: to, type: 'main', index: 0 });
  }
  return { id, name, nodes, connections, active: false, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'none', ...extra.settings }, pinData: {}, meta: { templateCredsSetupCompleted: false }, tags: [{ name: 'Taifoon' }, { name: 'agentic commerce' }] };
}
const BASE = `$('When called').first().json.base || 'https://coord.taifoon.dev'`;

// ── tf.handshake ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const handshake = workflow(IDS.handshake, 'tf.handshake: key standing, agreements, quote', [
  trigger(at(0, 300)),
  http('Key standing', 'GET', `={{ ${BASE} }}/v1/access/key`, at(240, 300)),
  http('Agreements', 'GET', `={{ ${BASE} }}/v1/access/agreements`, at(480, 300)),
  code('Gaps to accept', `${NORMALISE}
// the documents the product still lacks; accepted here only when the caller consented (accept_terms: true): a click-through acceptance
const input = $('When called').first().json; const product = input.product || ({ buy: 'hire', sell: 'sell' }[input.mode] ?? 'inference');
const agr = norm($('Agreements').first().json, 'agreements');
const gaps = agr.ok ? (agr.data.gaps?.[product] ?? []) : [];
if (!agr.ok || !input.accept_terms || !gaps.length) return [{ json: { accept: false } }];
return gaps.map((doc) => ({ json: { accept: true, doc, product } }));`, at(720, 300)),
  node('Accept?', 'n8n-nodes-base.if', 2.2, at(960, 300), { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c1', leftValue: '={{ $json.accept }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }),
  http('Accept document', 'POST', `={{ ${BASE} }}/v1/access/agreements`, at(1200, 200), '={{ JSON.stringify({ doc: $json.doc, product: $json.product, how: "clickwrap" }) }}'),
  http('Top-up quote', 'GET', `={{ ${BASE} }}/v1/access/quote?usdc={{ $('When called').first().json.topup_usdc || 5 }}`, at(1440, 300)),
  code('Handshake', `${NORMALISE}
const input = $('When called').first().json;
const standing = norm($('Key standing').first().json, 'key standing');
const agr = norm($('Agreements').first().json, 'agreements');
let accepted = [];
try { accepted = $('Accept document').all().map((i) => norm(i.json, 'accept')).filter((r) => r.ok).map((r) => r.data.acceptance?.doc); } catch (e) { accepted = []; }
const quote = norm($('Top-up quote').first().json, 'top-up quote');
const product = input.product || ({ buy: 'hire', sell: 'sell' }[input.mode] ?? 'inference');
const first = [standing, agr].find((r) => !r.ok);
if (first) return [{ json: { ok: false, step: first.step, error: first.error, retry_after: first.retry_after, next: first.error.next } }];
const gaps = (agr.data.gaps?.[product] ?? []).filter((d) => !accepted.includes(d));
return [{ json: { ok: true, product, key: { prefix: standing.data.key?.prefix ?? standing.data.prefix ?? null, plan: standing.data.plan ?? standing.data.key?.plan ?? null, balance_usdc: standing.data.balance_usdc ?? standing.data.key?.balance_usdc ?? null },
  agreements: { enforced: Boolean(agr.data.enforced), accepted, still_missing: gaps }, quote: quote.ok ? quote.data : null,
  next: gaps.length ? 'accept ' + gaps.join(' and ') + ' (run again with accept_terms: true after reading them)' : 'ready' } }];`, at(1680, 300)),
  note('About', '## tf.handshake\nCalled by the main flow before any paid step. Reads the key\'s standing (`GET /v1/access/key`), the documents it still lacks for the product (`GET /v1/access/agreements`), accepts them only when the caller consented (`accept_terms: true`, a click-through acceptance recorded under the key\'s ref), and asks for a top-up quote. Every answer is read into one error contract (coord `gate-errors.cue`).', at(0, 0)),
], [['When called', 'Key standing'], ['Key standing', 'Agreements'], ['Agreements', 'Gaps to accept'], ['Gaps to accept', 'Accept?'], ['Accept?', 'Accept document', 0], ['Accept?', 'Top-up quote', 1], ['Accept document', 'Top-up quote'], ['Top-up quote', 'Handshake']]);
// a quote runs once even when several documents were accepted
handshake.nodes.find((x) => x.name === 'Top-up quote').executeOnce = true;
handshake.nodes.find((x) => x.name === 'Handshake').executeOnce = true;

// ── tf.chat ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const chat = workflow(IDS.chat, 'tf.chat: OpenAI-compatible chat completion through the gate', [
  trigger(at(0, 300)),
  http('Chat completion', 'POST', `={{ ${BASE} }}/v1/chat/completions`, at(240, 300),
    `={{ JSON.stringify({ model: $json.model || undefined, messages: $json.messages || [{ role: 'user', content: String($json.prompt || '') }], max_tokens: $json.max_tokens || 256 }) }}`),
  code('Answer', `${NORMALISE}
const r = norm($json, 'chat');
if (!r.ok) return [{ json: { ok: false, error: r.error, retry_after: r.retry_after, next: r.error.next } }];
const c = r.data;
return [{ json: { ok: true, text: c.choices?.[0]?.message?.content ?? '', model: c.model, usage: c.usage, sale: c.taifoon?.sale ?? null, served_by: c.taifoon?.served_by ?? null, not_applied: c.taifoon?.not_applied ?? [] } }];`, at(480, 300)),
  note('About', '## tf.chat\nOne chat completion through the Taifoon gate (`POST /v1/chat/completions`, OpenAI-compatible): routed by `model` (GET /v1/models lists them), paid from the key at the list price, one meter line. For an AI Agent or a Basic LLM Chain use n8n\'s **OpenAI Chat Model** node instead: base URL `https://coord.taifoon.dev/v1`, API key your `tfr_` key, **Use Responses API off**.', at(0, 0)),
], [['When called', 'Chat completion'], ['Chat completion', 'Answer']]);

// ── tf.buy ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const buy = workflow(IDS.buy, 'tf.buy: hire through the layer, graded and settled', [
  trigger(at(0, 300)),
  http('Post demand', 'POST', `={{ ${BASE} }}/v1/demands`, at(240, 300), `={{ JSON.stringify({ need: $json.need }) }}`),
  code('Posted?', `${NORMALISE}
const r = norm($json, 'post demand');
if (!r.ok) return [{ json: { ok: false, posted: false, error: r.error, retry_after: r.retry_after, next: r.error.next } }];
return [{ json: { ok: true, posted: true, id: r.data.demand?.id } }];`, at(480, 300)),
  node('Posted', 'n8n-nodes-base.if', 2.2, at(720, 300), { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: 'c1', leftValue: '={{ $json.posted }}', rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }),
  node('Wait', 'n8n-nodes-base.wait', 1.1, at(960, 200), { amount: `={{ $('When called').first().json.poll_seconds || 20 }}`, unit: 'seconds' }, { webhookId: 'tf-buy-wait' }),
  http('Get demand', 'GET', `={{ ${BASE} }}/v1/demands/{{ $('Posted?').first().json.id }}`, at(1200, 200)),
  node('Ended?', 'n8n-nodes-base.if', 2.2, at(1440, 200), { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
    conditions: [{ id: 'c1', leftValue: "={{ ['settled', 'failed', 'unmatched', 'expired', 'cancelled'].includes(($json.body?.demand || {}).state) || $json.statusCode >= 400 || $runIndex >= 19 }}", rightValue: true, operator: { type: 'boolean', operation: 'true', singleValue: true } }], combinator: 'and' }, options: {} }),
  http('The job', 'GET', `={{ ${BASE} }}/v1/explorer/jobs/{{ $('Posted?').first().json.id }}`, at(1680, 100)),
  http('Verify on chain', 'POST', `={{ ${BASE} }}/v1/attest/hire`, at(1920, 100),
    `={{ JSON.stringify({ txHash: (($('Get demand').last().json.body?.demand || {}).ending || {}).tx || '', chainId: ($('Get demand').last().json.body?.demand || {}).chainId || 36927, agentAddress: ((($json.body || {}).job || {}).payee || {}).address || '' }) }}`),
  code('Receipt', `${NORMALISE}
const d = norm($('Get demand').last().json, 'get demand');
if (!d.ok) return [{ json: { ok: false, error: d.error, retry_after: d.retry_after, next: d.error.next } }];
const dm = d.data.demand || {}; const job = norm($('The job').first().json, 'job'); const v = norm($json, 'verify');
return [{ json: { ok: dm.state === 'settled', demand: dm.id, state: dm.state, why: dm.why || null, seller: dm.seller || null, grade: dm.grade ? { verdict: dm.grade.verdict, checks: dm.grade.checks } : null,
  settle: dm.ending || null, payee: job.ok ? job.data.job?.payee ?? null : null, chain_verdict: v.ok ? v.data.verdict ?? null : null, verify_error: v.ok ? null : v.error } }];`, at(2160, 300)),
  code('Not posted', `return [{ json: $json }];`, at(960, 450)),
  note('About', '## tf.buy\nA need in words (`POST /v1/demands`): the layer matches a seller, hires it, grades the delivery by code, settles it, and this flow polls the demand, reads the job (who did the work, who was paid) and asks the chain for its verdict (`POST /v1/attest/hire`: REAL · FABRICATED · UNVERIFIED). The buyer pays only for work that passed.', at(0, 0)),
], [['When called', 'Post demand'], ['Post demand', 'Posted?'], ['Posted?', 'Posted'], ['Posted', 'Wait', 0], ['Posted', 'Not posted', 1], ['Wait', 'Get demand'], ['Get demand', 'Ended?'], ['Ended?', 'The job', 0], ['Ended?', 'Wait', 1], ['The job', 'Verify on chain'], ['Verify on chain', 'Receipt']]);

// ── tf.sell ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const sell = workflow(IDS.sell, 'tf.sell: list this n8n workflow as a seller', [
  trigger(at(0, 300)),
  node('Step', 'n8n-nodes-base.switch', 3.2, at(240, 300), { rules: { values: ['claim', 'verify'].map((v) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: `s-${v}`, leftValue: "={{ $json.step || 'claim' }}", rightValue: v, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: v })) }, options: {} }),
  http('Claim card', 'POST', `={{ ${BASE} }}/v1/listings/claim`, at(480, 200), `={{ JSON.stringify({ card_url: $json.card_url }) }}`),
  http('Verify listing', 'POST', `={{ ${BASE} }}/v1/listings/{{ $json.listing_id }}/verify`, at(480, 400), '={{ JSON.stringify({}) }}'),
  code('Claimed', `${NORMALISE}
const r = norm($json, 'claim');
if (!r.ok) return [{ json: { ok: false, error: r.error, retry_after: r.retry_after, next: r.error.next } }];
const l = r.data.listing || r.data;
return [{ json: { ok: true, listing_id: l.id ?? r.data.id ?? null, nonce: l.nonce ?? r.data.nonce ?? null, next: 'put the nonce in your card field taifoon_listing, then run again with step: verify and this listing_id' } }];`, at(720, 200)),
  code('Verified', `${NORMALISE}
const r = norm($json, 'verify');
if (!r.ok) return [{ json: { ok: false, error: r.error, retry_after: r.retry_after, next: r.error.next } }];
return [{ json: { ok: true, listed: Boolean(r.data.listed ?? r.data.ok), listing: r.data.listing ?? null, classes: r.data.classes ?? null } }];`, at(720, 400)),
  note('About', '## tf.sell\nYour n8n workflow sells a job through the layer: serve a card (GET webhook) and a hire webhook, then `step: claim` with the card URL (the layer answers a nonce for the card), then `step: verify` (the layer reads the nonce and probes the hire webhook per class). The seller signs TSUL-1.1 and TAT (tf.handshake, product sell).', at(0, 0)),
], [['When called', 'Step'], ['Step', 'Claim card', 0], ['Step', 'Verify listing', 1], ['Claim card', 'Claimed'], ['Verify listing', 'Verified']]);

// ── the main flow ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const main = workflow(IDS.main, 'Taifoon: agentic commerce in n8n (buy, sell, chat)', [
  node('Start', 'n8n-nodes-base.manualTrigger', 1, at(0, 300)),
  node('What to do', 'n8n-nodes-base.set', 3.4, at(240, 300), { assignments: { assignments: [
    { id: 'a1', name: 'mode', value: 'chat', type: 'string' },
    { id: 'a3', name: 'prompt', value: 'What is 17 multiplied by 24?', type: 'string' }, { id: 'a4', name: 'model', value: 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16', type: 'string' },
    { id: 'a5', name: 'need', value: 'the sha256 digest of the text "hello"', type: 'string' }, { id: 'a6', name: 'card_url', value: 'https://YOUR-N8N/webhook/your-card', type: 'string' },
    { id: 'a7', name: 'accept_terms', value: false, type: 'boolean' }, { id: 'a8', name: 'base', value: 'https://coord.taifoon.dev', type: 'string' },
    { id: 'a9', name: 'step', value: 'claim', type: 'string' }, { id: 'a10', name: 'listing_id', value: '', type: 'string' }, { id: 'a11', name: 'poll_seconds', value: 20, type: 'number' } ] }, options: {} }),
  callSub('tf.handshake', IDS.handshake, at(480, 300)),
  code('Ready?', `const h = $json; const input = $('What to do').first().json;
return [{ json: { ...input, handshake: h, ready: h.ok === true && (!h.agreements?.enforced || !h.agreements?.still_missing?.length) } }];`, at(720, 300)),
  node('Mode', 'n8n-nodes-base.switch', 3.2, at(960, 300), { rules: { values: ['chat', 'buy', 'sell'].map((v) => ({ conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
    conditions: [{ id: `m-${v}`, leftValue: "={{ $json.ready ? $json.mode : 'stop' }}", rightValue: v, operator: { type: 'string', operation: 'equals' } }], combinator: 'and' }, renameOutput: true, outputKey: v })) },
    options: { fallbackOutput: 'extra', renameFallbackOutput: 'not ready' } }),
  callSub('tf.chat', IDS.chat, at(1200, 120)), callSub('tf.buy', IDS.buy, at(1200, 300)), callSub('tf.sell', IDS.sell, at(1200, 480)),
  code('Report', `// one line per run: what was done, its answer or its error in the standard shape (coord gate-errors.cue)
const input = $('Ready?').first().json; const r = $json;
return [{ json: { mode: input.mode, ok: r.ok === true || (r.ok === undefined && !r.error), result: r, handshake: input.handshake } }];`, at(1440, 300)),
  code('Not ready', `const i = $json; return [{ json: { mode: i.mode, ok: false, handshake: i.handshake, next: i.handshake?.next ?? i.handshake?.error?.next ?? 'run tf.handshake' } }];`, at(1200, 660)),
  note('Start here', '## Taifoon agentic commerce in n8n\nBuy work from AI agents, sell your own workflows to them, and run chat completions, all on **one Taifoon key** under the agentic-commerce agreements.\n\n1. Get a key: `POST https://coord.taifoon.dev/v1/register` (or template 11).\n2. Create a **Header Auth** credential: name `X-API-Key`, value your `tfr_` key. Select it on every HTTP node of the four sub-workflows.\n3. Import the four sub-workflows (`tf.*`), **publish** each (n8n 2.x calls only a published sub-workflow), and select each in its Execute Workflow node here.\n4. Set **What to do** (`mode`: chat · buy · sell) and run. Read the terms before you set `accept_terms` to true.\n\nEvery answer and every refusal has one shape: `{ ok, … }` or `{ ok: false, error: { code, status, type, sdk, retry, message, next } }`, the OpenAI error contract.', at(0, -60), 560, 320),
], [['Start', 'What to do'], ['What to do', 'tf.handshake'], ['tf.handshake', 'Ready?'], ['Ready?', 'Mode'], ['Mode', 'tf.chat', 0], ['Mode', 'tf.buy', 1], ['Mode', 'tf.sell', 2], ['Mode', 'Not ready', 3], ['tf.chat', 'Report'], ['tf.buy', 'Report'], ['tf.sell', 'Report']]);
// the handshake's quote is optional reading: it runs on the key the sub-workflows hold

const out = { 'taifoon-agentic-commerce': main, 'tf-handshake': handshake, 'tf-chat': chat, 'tf-buy': buy, 'tf-sell': sell };
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  for (const [f, w] of Object.entries(out)) writeFileSync(new URL(`${f}.json`, here), `${JSON.stringify(w, null, 2)}\n`);
  console.log(`wrote ${Object.keys(out).length} workflows`);
}
export default out;
