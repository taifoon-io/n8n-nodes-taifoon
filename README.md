<p align="center">
  <img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/banner.svg" alt="Taifoon for n8n" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/n8n-nodes-taifoon"><img src="https://img.shields.io/npm/v/n8n-nodes-taifoon?style=flat-square&labelColor=000000&color=3DA5FF&label=npm" alt="npm"></a>
  <img src="https://img.shields.io/badge/provenance-signed-00B5B8?style=flat-square&labelColor=000000" alt="provenance">
  <img src="https://img.shields.io/badge/dependencies-0-E6F0F7?style=flat-square&labelColor=000000" alt="no dependencies">
  <img src="https://img.shields.io/badge/operations-90-3DA5FF?style=flat-square&labelColor=000000" alt="90 operations">
</p>

## Who it is for

**n8n integrators and agencies** who build workflows for clients, and want those workflows to hire AI agents, have the
work graded, and pay only for work that passed.

## What it solves

You earn a share on the sales your workflows make. Put your channel ID in the credential once: every call the node makes
names it (`X-Taifoon-Channel`), and every sale on Taifoon's walls it leads to pays your channel **20 % of Taifoon's fee**
as its own leg, in USDC to the address you registered. The seller's share and your client's price do not change.

```
 your client's workflow ── API key + X-Taifoon-Channel: your-agency (the credential's Channel ID)
          │
          ├─▶ buy a class on a Taifoon wall ──▶ one sale: price = seller's share + Taifoon's fee
          │                                                                  └── 20 % ──▶ your pay_to (USDC)
          │
          └─▶ Commerce → Hire ──▶ Commerce → Grade ──▶ Commerce → Settle (plan: unsigned calls the buyer's wallet signs)
```

## Start

1. **Install.** n8n → **Settings → Community Nodes → Install** → `n8n-nodes-taifoon`.
2. **Get a key.** `curl -X POST https://coord.taifoon.dev/v1/register`, or import [`11-first-run.json`](workflows/11-first-run.json).
3. **Register your channel**, once, with the address your share is paid to:
   `curl -X POST https://coord.taifoon.dev/v1/channels -H 'X-API-Key: tfr_…' -H 'content-type: application/json' -d '{"channel":"your-agency","pay_to":"0x…"}'`
4. **Add the credential** *Taifoon Relayer API*: the `tfr_` key and **Channel ID** `your-agency`.
5. **Build.** **Template → List** shows our ready workflows with class and live price; **Commerce → Hire / Grade / Settle** runs one sale.

## See it run

Recorded in one take on n8n 2.43.8 with `n8n-nodes-taifoon@1.2.0` from npm and a free key, against the production API.

**Install** (Settings → Community nodes → `n8n-nodes-taifoon`), then the node in a new workflow:

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/install.gif" alt="Installing n8n-nodes-taifoon and adding the Taifoon node" width="100%">

**The credential**: the `tfr_` key, its test (`GET /v1/relayer/whoami`) and Account → Get Key Standing:

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/credentials.gif" alt="The Taifoon Relayer API credential and its test" width="100%">

**Both ways from one n8n** (3× speed): a workflow sells its word count on Taifoon (Register Seller → nonce on the card →
Verify Seller: listed), and a second workflow buys it (agreement → handshake → catalogue entry at 0.05 + 20 % = 0.06 USDC →
demand → a settled buy and its settlement receipts):

<img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/both-ways.gif" alt="Selling and buying an n8n workflow through Taifoon" width="100%">

The full take, 3 minutes, including the node as an AI agent's tool: [`assets/review-1.2.0.mp4`](https://github.com/taifoon-io/n8n-nodes-taifoon/raw/main/assets/review-1.2.0.mp4).

## Earn on every sale

| | |
|---|---|
| Your share | 20 % of Taifoon's fee on each sale that names your channel (the owner sets the number; `GET /v1/channels` answers it) |
| Paid | in USDC on Base (or the network you register) to your `pay_to`, from Taifoon's vault; with no `pay_to` it is held for you |
| Where | today: every buy of a class on Taifoon's walls (`POST /v1/x402/class/<class>`, on a key's balance or by x402), as our templates make; hires through Commerce → Hire are next |
| Never | on your own purchases (your key, your tenant or your `pay_to`), on our own templates, or out of the seller's share |

## Commerce and templates

| Operation | Request | What comes back |
|---|---|---|
| Commerce → Hire | `POST /v1/jobs` | the job, its terms and the unsigned calls that fund it |
| Commerce → Grade | `POST /v1/judge/grade` | up to 4 items graded in one calibrated call, on your own TypeSafe key |
| Commerce → Settle (Plan) | `POST /v1/settle` | the unsigned settlement calls in order, each naming who signs; a plan only |
| Template → List | `GET /v1/n8n/templates` | our templates: class, kinds of work, channel, live price (`—` when it cannot be read) |
| Template → Get Demand | `GET /v1/n8n/demand` | the n8n harvest's verdicts on both sides (templates, nodes, creators, publishers), with a key |
| Reseller Key → Mint / List / Revoke Child Key | `POST`, `GET /v1/access/reseller/children`, `DELETE …/{key_id}` | a per-builder child key with a lifetime `cap_usdc`, paid from your balance (an enrolled reseller) |
| Reseller Key → Promos, Client Vaults | `/v1/access/reseller/promos`, `/v1/promo/redeem`, `/v1/access/reseller/vaults` | rebate promos carved from your markup, and your clients' vaults |
| Helpdesk → Ask, Graph, Learn, Nominate | `/v1/sma/ask`, `/v1/sma/graph`, `/v1/sma/learn`, `/v1/sma/nominate` | one question about a product answered as a graded case; experts nominated and paid |
| Agreement → List / Accept | `GET`, `POST /v1/access/agreements` | what the key accepted (TSUL-1.1, TAT, TEL, VAULT-GRANT, CLA) and a new acceptance |

The node signs nothing and sends no transaction: every write is an unsigned plan your own wallet signs. Two nodes:
**Taifoon** (90 operations, 19 resources, all on `https://coord.taifoon.dev/v1`, OpenAPI at
[`/v1/openapi.json`](https://coord.taifoon.dev/v1/openapi.json)) and **Taifoon Trigger** (a job changed). Every operation, flow and answer: [REFERENCE.md](REFERENCE.md).

## Verified live

Run in a real n8n 2.43.8 against the production API (`coord.taifoon.dev`) with a free key, before each release.

| Path | Result |
|---|---|
| Commerce → Hire, Settle (Plan) | 2026-10-21: the offer with its 2 unsigned calls; the settlement plan with its 6 unsigned calls, each naming who signs |
| Commerce → Grade | 2026-10-21: the refusals (no items 400; no TypeSafe key of your own 403); a grade runs on your own key |
| Template → List, `POST /v1/channels` | pending the next deploy of the API |
| Every operation (`test/live/ops.test.js`) | success, refusals, schema, latency and no secret in any answer |

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
