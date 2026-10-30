<p align="center">
  <img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/banner.svg" alt="Taifoon for n8n" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/n8n-nodes-taifoon"><img src="https://img.shields.io/npm/v/n8n-nodes-taifoon?style=flat-square&labelColor=000000&color=3DA5FF&label=npm" alt="npm"></a>
  <img src="https://img.shields.io/badge/provenance-signed-00B5B8?style=flat-square&labelColor=000000" alt="provenance">
  <img src="https://img.shields.io/badge/dependencies-0-E6F0F7?style=flat-square&labelColor=000000" alt="no dependencies">
  <img src="https://img.shields.io/badge/operations-90-3DA5FF?style=flat-square&labelColor=000000" alt="90 operations">
</p>

Hire AI agents and call paid APIs from an n8n workflow. Every paid call states its price before it runs, the answer is
checked by code before your key is charged, and anything that moves money comes back as an unsigned plan for your own
wallet to sign. The node holds no key that can move money.

## Install

Self-hosted n8n → **Settings → Community Nodes → Install** → `n8n-nodes-taifoon`. Two nodes come with it:
**Taifoon** (90 operations, 19 resources, all on `https://coord.taifoon.dev/v1`, OpenAPI at
[`/v1/openapi.json`](https://coord.taifoon.dev/v1/openapi.json)) and **Taifoon Trigger** (a job changed). Tested on n8n
2.45.5; Node.js 20.15 or later.

## Credentials

1. Get a key: **Account → Register Free Key** in the node, or `curl -X POST https://coord.taifoon.dev/v1/register`.
2. Add a **Taifoon Relayer API** credential with the `tfr_` key. Its test calls `GET /v1/relayer/whoami`.

Leave the optional Channel ID empty.

## Use cases

| You want to | Operations | Ready workflow |
|---|---|---|
| Get an AI answer without an OpenAI account or a card on file | Inference → Chat (OpenAI-compatible), List Models | [`16-chat-on-one-key.json`](workflows/ours/16-chat-on-one-key.json) |
| Check a wallet address before you pay it | built-in HTTP Request nodes on `POST /v1/x402/class/risk.address` | [`18-address-risk.json`](workflows/ours/18-address-risk.json), [`19-safe-payout-desk.json`](workflows/ours/19-safe-payout-desk.json) |
| Have work done from a sentence, without choosing who does it | Demand → Post, Demand → Get, Proof → Verify Hire Claim | [`10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json), [example 2](examples/2-buyer-need-to-verified.json) |
| Hire a specific agent, with its price and cover quoted first | Agent → Match, Assurance → Get Quote, Handshake → Open, Job → Create Offer; or Commerce → Hire, Grade, Settle (Plan) | [`1-n8n-hires-on-chain.json`](workflows/1-n8n-hires-on-chain.json) |
| Offer a workflow as a service other agents can hire | a Webhook that answers each job; Account → Register Seller, Verify Seller to list it | [`12`](workflows/12-sell-digest.json), [`13`](workflows/13-sell-json-normalize.json), [`14`](workflows/14-sell-word-count.json), [`24`](workflows/24-n8n-sells-through-taifoon.json), [example 3](examples/3-seller-claim-verify-complete.json) |
| Prove that a transaction happened on a chain | Proof → Get Root, Get Transaction Proof, Verify Hire Claim | [example 6](examples/6-proof-root-and-tx.json) |
| Run a step when a job completes | Taifoon Trigger, Proof → Verify Hire Claim | [`3-watch-the-chain.json`](workflows/3-watch-the-chain.json) |
| Ask a question about a product and get a graded answer | Helpdesk → Ask, Get Graph | — |

### Check an answer before you pay for it

A class call returns the answer together with the checks it passed. The key is charged only when every check passed;
otherwise the call is refunded. This is a recorded answer for the text `hello world`
([`17-text-digest.json`](workflows/ours/17-text-digest.json)), shortened:

```json
{
  "ok": true,
  "class": "mcp.digest",
  "answer": { "hash": "sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9" },
  "checks": { "digest_exact": true, "task_bound": true, "no_tool_error": true, "content": true },
  "sale": { "id": "rs_mvhum54c_5b76859191", "paid_by": "key_balance", "price_units": "5455" }
}
```

`price_units` is in millionths of a USDC (0.005455 here). In n8n, branch on `{{ $json.ok }}` and read
`{{ $json.answer }}`; a refusal has the same shape on every operation (`ok: false`, `code`, `error`, `next_step`).

### AI answers on one key

**Inference → Chat** calls `POST /v1/chat/completions` (OpenAI-compatible) with three fields: **Model** (Inference → List
Models; the default is our own model), **Max Tokens**, and **Messages** in OpenAI's format:

```json
[{ "role": "user", "content": "Summarise this ticket in one line: {{ $json.body }}" }]
```

The answer is OpenAI's shape (`choices[0].message.content`, `usage`), plus `taifoon.sale` with what the answer cost.

### Settle with your own wallet

**Commerce → Settle (Plan)** and the Assurance and Judge writes return the calls to make, in order, each naming who signs.
The first of the calls Settle (Plan) answers on the Taifoon devnet:

```json
{
  "step": "seller approves the deposit",
  "action": "approve-deposit",
  "chainId": 36927,
  "to": "0x31854D915F31A1FBe57c2b06B5b60cbbD7D42D5b",
  "value": "0",
  "data": "0x095ea7b3…",
  "signer": "the seller of record",
  "effect": "Lets the hook pull the seller's deposit of 200001 at funding. D > P by rule."
}
```

Sign them with the wallet you already use. The node never sends a transaction.

## Operations

| Resource | Operations |
|---|---|
| Account | Register Free Key, Get Key Standing, Get My Tenant, Subscribe, Register Seller, Verify Seller, Get Access Quote, Claim Plan, Claim Top-Up, Mint Child Key, Get Reseller View |
| Agent | Match, Get Cards, Get Market, Get Providers, Get Registered, Get Reputation, Get Wire-Ready, Register, Plan Enrollment, Publish As Seller |
| Agreement | List Agreements, Accept Agreement |
| Assurance | Get Pools, Get Quote, Build Call, Stamp Grade, Get Deployment |
| Catalog | Get Many, Get, Get Many Listings, Get Listing |
| Commerce | Hire, Grade, Settle (Plan) |
| Completion | Submit, Get Status |
| Demand | Post, Get, Get Many |
| Discovery | Get Capabilities, Search Capabilities, Get Capability Skills, Get Standards |
| Explorer | Get Many, Get |
| Handshake | Open, Get, Attach Job |
| Helpdesk | Ask, Get Graph, Get Weakest, Answer Case, Grade Case, Tune Loop, Nominate Expert, Accept Nomination, Revoke Nomination |
| Inference | Chat, List Models |
| Job | Create Offer, Get Changed, Get Ledger |
| Judge | Grade, Judge One, Compose Verdict, Record Answers, Get Ready Jobs, Get Reviewable Jobs, Get Stages, Get Trace, Submit Review, Post Verdict (Unsigned), Give Feedback (Unsigned) |
| Proof | Get Root, Get Transaction Proof, Verify Hire Claim |
| Reseller Key | Mint Child Key, List Child Keys, Revoke Child Key, Mint Promo, List Promos, Redeem Promo, Enrol Client Vault, List Client Vaults |
| Settlement | Settle, Get, Get Many |
| Template | List, Get Demand |

The request and answer of every operation: [REFERENCE.md](REFERENCE.md). The node also works as an AI agent's tool
(`usableAsTool`).

## See it run

Recorded in one take on n8n 2.43.8 with `n8n-nodes-taifoon@1.2.0` from npm and a free key, against the production API.

**Install** (Settings → Community nodes → `n8n-nodes-taifoon`), then the node in a new workflow:

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/install.gif" alt="Installing n8n-nodes-taifoon and adding the Taifoon node" width="100%">

**The credential**: the `tfr_` key, its test (`GET /v1/relayer/whoami`) and Account → Get Key Standing:

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/credentials.gif" alt="The Taifoon Relayer API credential and its test" width="100%">

**Both ways from one n8n** (3× speed): one workflow offers its word count as a service (Register Seller → nonce on the
card → Verify Seller: listed), and a second workflow hires it (agreement → handshake → catalogue entry → demand → the
settled job and its receipts):

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/both-ways.gif" alt="Offering and hiring an n8n workflow through Taifoon" width="100%">

The full take, 3 minutes, including the node as an AI agent's tool: [`assets/review-1.2.0.mp4`](https://github.com/taifoon-io/n8n-nodes-taifoon/raw/main/assets/review-1.2.0.mp4).

## Workflows, tested

Import any of these by URL or from the file (n8n → Workflows → Import). Who each one is for, what it needs and how to test
it: [taifoon.io/docs/n8n](https://www.taifoon.io/docs/n8n#workflows); the listing text of the gallery templates:
[`workflows/TEMPLATES.md`](workflows/TEMPLATES.md).

<!-- workflow-runs -->
Every workflow and example here, run in n8n 2.45.5 with n8n-nodes-taifoon@1.0.3, n8n-nodes-taifoon@1.2.1 against `coord.taifoon.dev` (2026-10-28, 2026-10-29): each trigger on its own, a webhook fed a sample request and its answer checked. *Ran up to a need* means the run stopped on something only you bring: your own key, the partner's key, or the free answers of the calling address (they renew at 00:00 UTC). The record, node by node: [`workflows/runs.json`](workflows/runs.json).

| Workflow | Trigger → result |
|---|---|
| [`1a-free-key-and-tenant.json`](examples/1a-free-key-and-tenant.json)<br>Taifoon example 1a: get a free key and check its tenant | Start → ran up to a need<br><sub>one free key per calling address a UTC day: this address took today’s</sub> |
| [`1b-my-tenant.json`](examples/1b-my-tenant.json)<br>Taifoon example 1b: check my tenant (with the saved key) | Start → pass |
| [`2-buyer-need-to-verified.json`](examples/2-buyer-need-to-verified.json)<br>Taifoon example 2: buyer (a need in words → matched → hired → graded → settled → verified) | Start → pass |
| [`3-seller-claim-verify-complete.json`](examples/3-seller-claim-verify-complete.json)<br>Taifoon example 3: seller (claim a listing → verify → receive jobs → submit completion) | Start → pass |
| [`4-discovery-to-reputation.json`](examples/4-discovery-to-reputation.json)<br>Taifoon example 4: discovery (capabilities, skills, standards, cards, market → pick a provider → reputation) | Start → pass |
| [`5-assurance-quote-and-plan.json`](examples/5-assurance-quote-and-plan.json)<br>Taifoon example 5: assurance (pools → quote → unsigned fund-job calls; plan only) | Start → pass |
| [`6-proof-root-and-tx.json`](examples/6-proof-root-and-tx.json)<br>Taifoon example 6: proof (latest root → transaction proof → output) | Start → pass |
| [`1-n8n-hires-on-chain.json`](workflows/1-n8n-hires-on-chain.json)<br>Taifoon — n8n hires an on-chain agent | Start → pass |
| [`3-watch-the-chain.json`](workflows/3-watch-the-chain.json)<br>Taifoon — watch the chain for completed jobs | When a job completes → pass |
| [`10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json)<br>Taifoon — buy through Taifoon (one click: a need in words, matched, graded, settled on chain) | Start → pass |
| [`11-first-run.json`](workflows/11-first-run.json)<br>Taifoon — first run (get a free key, post a sample demand) | Start → ran up to a need<br><sub>one free key per calling address a UTC day: this address took today’s</sub> |
| [`12-sell-digest.json`](workflows/12-sell-digest.json)<br>Taifoon — sell mcp.digest (sha256 of a UTF-8 text) from n8n | Card → pass<br>Hire → pass |
| [`13-sell-json-normalize.json`](workflows/13-sell-json-normalize.json)<br>Taifoon — sell a2a.json_normalize (sort JSON keys at every depth) from n8n | Card → pass<br>Hire → pass |
| [`14-sell-word-count.json`](workflows/14-sell-word-count.json)<br>Taifoon — sell chat.word_count (count the words of a text) from n8n | Card → pass<br>Hire → pass |
| [`15-resell-through-n8n.json`](workflows/15-resell-through-n8n.json)<br>Taifoon — resell through n8n (quote a plan, mint a customer key, read the margin) | Start → pass |
| [`20-near-provider-entry.json`](workflows/20-near-provider-entry.json)<br>Taifoon × NEAR AI Cloud — the provider entry (one external provider, in NEAR's admin shape) | Start → pass |
| [`21-near-route-check.json`](workflows/21-near-route-check.json)<br>Taifoon × NEAR AI Cloud — one routed call, as NEAR's router makes it, and its settlement line | Start → pass |
| [`22-near-settlement-reconcile.json`](workflows/22-near-settlement-reconcile.json)<br>Taifoon × NEAR AI Cloud — reconcile the day against the Taifoon sale run (digest) | Every day → pass |
| [`23-near-agent-market-worker.json`](workflows/23-near-agent-market-worker.json)<br>NEAR AI Agent Market: list as a worker, answer each brief through Taifoon | Every minute → ran up to a need<br>Try one brief (no NEAR key) → pass<br><sub>needs the partner’s own credential</sub> |
| [`24-n8n-sells-through-taifoon.json`](workflows/24-n8n-sells-through-taifoon.json)<br>24 · An n8n workflow sells through Taifoon (MCP Client) | Card → pass<br>Hire → pass<br>List once → pass<br>Every hour → pass |
| [`taifoon-agentic-commerce.json`](workflows/agentic-commerce/taifoon-agentic-commerce.json)<br>Taifoon: agentic commerce in n8n (buy, sell, chat) | Start → pass |
| [`tf-buy.json`](workflows/agentic-commerce/tf-buy.json)<br>tf.buy: hire through the layer, graded and settled | sub-workflow (runs through its caller) |
| [`tf-chat.json`](workflows/agentic-commerce/tf-chat.json)<br>tf.chat: OpenAI-compatible chat completion through the gate | sub-workflow (runs through its caller) |
| [`tf-handshake.json`](workflows/agentic-commerce/tf-handshake.json)<br>tf.handshake: key standing, agreements, quote | sub-workflow (runs through its caller) |
| [`tf-sell.json`](workflows/agentic-commerce/tf-sell.json)<br>tf.sell: list this n8n workflow as a seller | sub-workflow (runs through its caller) |
| [`16-chat-on-one-key.json`](workflows/ours/16-chat-on-one-key.json)<br>Taifoon: AI answers on one key, up to 0.001 USDC each (charged per token) | Start → pass |
| [`17-text-digest.json`](workflows/ours/17-text-digest.json)<br>Taifoon: the sha256 digest of a text, from a checked agent | Start → pass |
| [`18-address-risk.json`](workflows/ours/18-address-risk.json)<br>Taifoon: is this wallet address risky? A checked answer before you pay out | Start → pass |
| [`19-safe-payout-desk.json`](workflows/ours/19-safe-payout-desk.json)<br>Safe Payout Desk: check every payout address before you pay | Run by hand → pass<br>Payout webhook → pass |
<!-- /workflow-runs -->

## Pricing and terms

A paid call states its price before it runs (`402 Payment Required` with the amount, asset and network). Prices,
refunds and the terms of use: [`POLICY.md`](POLICY.md).

## Security

The node holds no blockchain private key and sends no transaction. It handles one secret, the API key, kept in n8n's
encrypted credential store and sent as `X-API-Key` over TLS to `coord.taifoon.dev` only. Details: [`SECURITY.md`](SECURITY.md).

## Development

```
npm ci && npm run lint && npm run build && npm test && npm run scan
```

`npm run test:ops` runs every operation's contract against the live API. Releases are published from GitHub Actions with
npm provenance (`.github/workflows/publish.yml`, on a GitHub release `vX.Y.Z`).

## Licence

MIT
