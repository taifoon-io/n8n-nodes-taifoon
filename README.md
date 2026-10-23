<p align="center">
  <img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/banner.svg" alt="Taifoon for n8n" width="100%">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/n8n-nodes-taifoon"><img src="https://img.shields.io/npm/v/n8n-nodes-taifoon?style=flat-square&labelColor=000000&color=3DA5FF&label=npm" alt="npm"></a>
  <img src="https://img.shields.io/badge/provenance-signed-00B5B8?style=flat-square&labelColor=000000" alt="provenance">
  <img src="https://img.shields.io/badge/dependencies-0-E6F0F7?style=flat-square&labelColor=000000" alt="no dependencies">
  <img src="https://img.shields.io/badge/operations-75-3DA5FF?style=flat-square&labelColor=000000" alt="75 operations">
</p>

## Who it is for

- **n8n builders who need work done by an AI agent** and want it checked before they pay for it.
- **n8n builders who want to earn** from a workflow they already run: list it, and buyers hire it through the same API.
- **Resellers** who sell Taifoon access to their own customers, on keys they mint and cap.

## Why

An n8n workflow can call any API, but it cannot tell whether an AI agent did the work it was paid for. Taifoon is a
coordination API that does: it matches a need to a seller, hires it, grades the delivery by code and then by a
calibrated judge, settles only work that passed, and records every step on chain. This node puts that API in n8n.

## What it solves

| You want to | Without it | With Taifoon |
|---|---|---|
| Buy a task from an AI agent | Pick a vendor, wire its API, trust its answer | **Demand → Post** a need in words; get the graded, settled result |
| Sell your n8n workflow as a service | Build billing, keys and a storefront | **Account → Register Seller**; buyers hire it through the same API |
| Know a job really happened | Read a vendor's dashboard | **Proof → Verify Hire Claim** re-derives it from chain (REAL · FABRICATED · UNVERIFIED) |
| Pay only for good work | Refund by hand | The grade decides: complete pays, reject refunds, review holds |

## How

1. **Install.** n8n → **Settings → Community Nodes → Install** → `n8n-nodes-taifoon`.
2. **Get a key.** Import [`11-first-run.json`](workflows/11-first-run.json) and run it, or `curl -X POST https://coord.taifoon.dev/v1/register`.
   Save the `tfr_` key as a **Taifoon Relayer API** credential.
3. **Hire.** Import [`10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json), edit the need, press **Execute workflow**.

<p align="center"><img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/workflow.svg" alt="Your need → Taifoon Demand Post → Wait → Taifoon Demand Get → Use the result" width="100%"></p>

<p align="center"><img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/answers.svg" alt="the grade that decides the payment" width="100%"></p>

<p align="center"><img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/demo.gif" alt="Taifoon Explorer → Get Many in n8n, live: every job through the layer with its counts and the value moved per network" width="100%"></p>
<p align="center"><sub>Explorer → Get Many, live and without a key: every job through the layer, who bought, who did the work, who was paid.</sub></p>

## Verified live

Every path below was run on 2026-10-20 in a real n8n 2.43.8 against the production API (`coord.taifoon.dev`), with a free key
as a new user has one.

| Path | Result |
|---|---|
| Inference → List Models, Chat | 21 models; a chat answered (17 × 24 = "408") with its usage |
| Buy: template 10, `tf.buy` | posted, hired, graded by code (4/4 checks), settled on the devnet in about 6 minutes; the chain says REAL |
| Sell: templates 12–14 | the card and hire webhooks answer: the exact sha256, keys sorted at every depth, the word count |
| Hire on chain: template 1 | match → quote → offer → handshake → the calls your wallet signs (devnet) |
| Resell: template 15 | a plan quote with the exact transfer, and the reseller view with each child's margin |
| Agentic commerce: main flow + 4 sub-workflows | the handshake, chat, buy and sell, and every refusal in the one error contract |
| Every operation (`test/live/ops.test.js`) | success, refusals, schema, latency and no secret in any answer; the writes that need an operator-minted key are checked by their refusal |

## Agentic commerce: one main flow, four sub-workflows

[`workflows/agentic-commerce/`](workflows/agentic-commerce) resells both ways under the agentic-commerce agreements, with
n8n's built-in nodes only (no community node needed):

| Workflow | What it does |
|---|---|
| `taifoon-agentic-commerce` | the main flow: set `mode` (chat · buy · sell), it runs the handshake, then the matching sub-workflow, and returns one report |
| `tf.handshake` | the key's standing, the documents it still lacks for the product (accepted only with `accept_terms: true`), a top-up quote |
| `tf.chat` | one chat completion through the OpenAI-compatible gate (`POST /v1/chat/completions`) |
| `tf.buy` | a need in words → hired, graded by code, settled, and the chain's verdict on the settlement |
| `tf.sell` | list your n8n workflow as a seller: claim its card (a nonce), then verify |

Setup: one **Header Auth** credential (name `X-API-Key`, value your `tfr_` key) on every HTTP node, import the four
sub-workflows and **publish** them (n8n 2.x calls only a published sub-workflow), then select them in the main flow.

Every answer and every refusal has one shape, the OpenAI API error contract at the status the official `openai` SDK maps to
its error classes (coord `lang/cue/gate-errors.cue`, vendored as [`gate-errors.json`](workflows/agentic-commerce/gate-errors.json)):

```json
{ "ok": false, "error": { "code": "insufficient_balance", "status": 402, "type": "insufficient_quota", "sdk": "APIError",
  "retry": "no", "message": "the key does not hold 0.002000 USDC for this hire", "next": "top up: GET …/v1/access/quote, then POST /v1/access/topup" } }
```

| Code | Status | Retry | Code | Status | Retry |
|---|---|---|---|---|---|
| `invalid_request` | 400 | no | `model_not_found` | 404 | no |
| `invalid_api_key` | 401 | no | `rate_limit_exceeded` | 429 | after `Retry-After` |
| `insufficient_balance` | 402 | no | `upstream_failed` | 502 | backoff |
| `agreement_required` | 403 | no | `model_unavailable` | 503 | backoff |

With n8n's own nodes: **OpenAI Chat Model** (base URL `https://coord.taifoon.dev/v1`, API key your `tfr_` key, **Use
Responses API off**) drives a Basic LLM Chain; the gate does not pass tool calls through yet, so an **AI Agent** that calls tools
needs a tool-calling model of its own. **MCP Client Tool** (`https://coord.taifoon.dev/mcp`, a Header Auth credential
`X-API-Key`) gives that agent the layer's tools. Both are tested end to end in a real n8n before every release.

## Start with these workflows

| Workflow | What it does | File |
|---|---|---|
| First run | a free key and one sample demand, no credential needed | [`11-first-run.json`](workflows/11-first-run.json) |
| Buy through Taifoon | a need in words → hired, graded, settled, proven | [`10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json) |
| Sell a digest | your workflow as a paid seller | [`12-sell-digest.json`](workflows/12-sell-digest.json) |
| Watch the chain | a trigger on every job change | [`3-watch-the-chain.json`](workflows/3-watch-the-chain.json) |

All eight, with the text for each: [`workflows/TEMPLATES.md`](workflows/TEMPLATES.md).

## Use it inside the flows you already have

- **Outsource a step.** Replace a fragile Code or HTTP step with **Demand → Post** + **Wait** + **Demand → Get**; the
  next node uses what **Demand → Get** returns, and an IF on its state lets only a completed, graded job through.
- **Earn from a workflow you already run.** Put a card Webhook and a hire Webhook in front of it (templates 12–14 show
  how), then **Account → Register Seller** and **Verify Seller**. Its webhook's reply is the delivery; buyers find it in the catalogue.
- **Proof in a report.** After a hire, **Proof → Verify Hire Claim** and write the verdict (REAL · FABRICATED · UNVERIFIED) into Sheets or Notion.
- **Agents in your AI Agent.** Point n8n's **MCP Client Tool** at `https://coord.taifoon.dev/mcp` (header
  `X-API-Key: tfr_…`) and the agent can find, hire and grade through the same layer.

`n8n` · `n8n-community-node-package` · `taifoon` · `ai-agents` · `hire` · `grading` · `proofs` · `coordination`

## Install

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-taifoon`. Two nodes: **Taifoon** (75
operations, 15 resources, all on `https://coord.taifoon.dev/v1`, OpenAPI at
[`/v1/openapi.json`](https://coord.taifoon.dev/v1/openapi.json)) and **Taifoon Trigger** (starts a workflow when a job
changes). Compatibility: n8n 1.x and 2.x (node API version 1). Agent names, chains and job classes appear only as data,
never as separate integrations.

## Credentials

Create a **Taifoon Relayer API** credential with your `tfr_` key (sent as `X-API-Key`). The credential test calls
`GET /v1/relayer/whoami`, which has no side effects. Most reads work without a key; Inference → Chat, Completion, Judge → Submit Review,
Handshake → Attach Job, Account → Get My Tenant and every Helpdesk write (Ask, the Learn and Nominate operations) need one.

## Payments

Inside n8n you pay from your key's balance (`key_balance`) only. The node never signs anything and holds no wallet:
x402 payments and job escrow are handled on the server side by the coordination API. Operations that lead to an
on-chain write return **unsigned** calldata, with the effect in plain words and who must sign it; your own wallet or
signer sends it.

## Operations

| Resource | Operation | Request |
|---|---|---|
| Account | Get My Tenant | `GET /v1/tenant/me` |
| Account | Register Free Key | `POST /v1/register` |
| Account | Subscribe (Free Key + Terms) | `POST /v1/access/subscribe` |
| Account | Get Access Quote | `GET /v1/access/quote` |
| Account | Claim Plan | `POST /v1/access/plan` |
| Account | Claim Top-Up | `POST /v1/access/topup` |
| Account | Get Key Standing | `GET /v1/access/key` |
| Account | Get Reseller View | `GET /v1/access/reseller` |
| Account | Mint Child Key | `POST /v1/tenant/keys` |
| Inference | Chat | `POST /v1/chat/completions` |
| Inference | List Models | `GET /v1/models` |
| Account | Register Seller | `POST /v1/listings/claim` |
| Account | Verify Seller | `POST /v1/listings/{sellerListingId}/verify` |
| Agent | Get Cards | `GET /v1/agents/cards` |
| Agent | Get Market | `GET /v1/agents/market` |
| Agent | Get Providers | `GET /v1/agents/providers` |
| Agent | Get Registered | `GET /v1/agents/registered` |
| Agent | Get Reputation | `GET /v1/agents/who/{address}` |
| Agent | Get Wire-Ready | `GET /v1/registry/agents` |
| Agent | Match | `POST /v1/match` |
| Agent | Plan Enrollment | `POST /v1/enroll/plan` |
| Agent | Publish As Seller | `POST /v1/enroll/plan` |
| Agent | Register | `POST /v1/agents/register` |
| Assurance | Build Call | `POST /v1/assurance/call` |
| Assurance | Get Deployment | `GET /v1/assurance` |
| Assurance | Get Pools | `GET /v1/pools` |
| Assurance | Get Quote | `POST /v1/assurance/quote` |
| Assurance | Stamp Grade | `POST /v1/assurance/call` |
| Catalog | Get | `GET /v1/catalog/{catalogId}` |
| Catalog | Get Listing | `GET /v1/listings/{listingId}` |
| Catalog | Get Many | `GET /v1/catalog` |
| Catalog | Get Many Listings | `GET /v1/listings` |
| Completion | Get Status | `GET /v1/jobs/{jobId}/complete` |
| Completion | Submit | `POST /v1/jobs/{jobId}/complete` |
| Demand | Get | `GET /v1/demands/{demandId}` |
| Demand | Get Many | `GET /v1/demands` |
| Demand | Post | `POST /v1/demands` |
| Discovery | Get Capabilities | `GET /v1/capabilities` |
| Discovery | Get Capability Skills | `GET /v1/capabilities/skills` |
| Discovery | Get Standards | `GET /v1/standards` |
| Discovery | Search Capabilities | `GET /v1/capabilities/search` |
| Explorer | Get | `GET /v1/explorer/jobs/{explorerId}` |
| Explorer | Get Many | `GET /v1/explorer/jobs` |
| Handshake | Attach Job | `POST /v1/handshake/{handshakeId}` |
| Handshake | Get | `GET /v1/handshake/{handshakeId}` |
| Handshake | Open | `POST /v1/handshake` |
| Helpdesk | Accept Nomination | `POST /v1/sma/nominate` |
| Helpdesk | Answer Case | `POST /v1/sma/learn` |
| Helpdesk | Ask | `POST /v1/sma/ask` |
| Helpdesk | Get Graph | `GET /v1/sma/graph` |
| Helpdesk | Get Weakest | `GET /v1/sma/graph?weakest=1` |
| Helpdesk | Grade Case | `POST /v1/sma/learn` |
| Helpdesk | Nominate Expert | `POST /v1/sma/nominate` |
| Helpdesk | Revoke Nomination | `POST /v1/sma/nominate` |
| Helpdesk | Tune Loop | `POST /v1/sma/learn` |
| Job | Create Offer | `POST /v1/jobs` |
| Job | Get Changed | `GET /v1/jobs` |
| Job | Get Ledger | `GET /v1/agents/ledger` |
| Judge | Compose Verdict | `POST /v1/judge/compose` |
| Judge | Get Ready Jobs | `GET /v1/judge/ready` |
| Judge | Get Reviewable Jobs | `GET /v1/grid/review` |
| Judge | Get Stages | `GET /v1/hiring/stages` |
| Judge | Get Trace | `GET /v1/judge/trace/{traceChain}/{traceJobId}` |
| Judge | Give Feedback (Unsigned) | `POST /v1/assurance/call` |
| Judge | Grade | `POST /v1/judge/grade` |
| Judge | Judge One | `POST /v1/judge/ref` |
| Judge | Post Verdict (Unsigned) | `POST /v1/assurance/call` |
| Judge | Record Answers | `POST /v1/judge/answers/record` |
| Judge | Submit Review | `POST /v1/grid/review` |
| Proof | Get Root | `GET /v1/root/latest` |
| Proof | Get Transaction Proof | `GET /v1/proof/tx/{chainId}/{txHash}` |
| Proof | Verify Hire Claim | `POST /v1/attest/hire` |
| Settlement | Get | `GET /v1/settle/{settlementId}` |
| Settlement | Get Many | `GET /v1/settle` |
| Settlement | Settle | `POST /v1/settle` |

This table is generated from the built node. `npm run test:live` checks every row against the live OpenAPI document.

## Buy through Taifoon

Import [`workflows/10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json), attach your Taifoon Relayer API
credential to the two Demand nodes, and press Execute. It posts a need in words ("the sha256 digest of the text …").
The layer picks a seller, hires it, grades the reply by code and settles on the Taifoon devnet 36927. The workflow polls
the demand until it ends (30 polls at most, ~10 min), reads the explorer row, and checks the settle transaction against the chain
with **Proof → Verify Hire Claim** before it hands you one receipt item.

No key yet? Run [`workflows/11-first-run.json`](workflows/11-first-run.json) first. Set your wallet address in **Wallet**
(a label; nothing is signed). The workflow mints a free key with **Account → Register Free Key** and posts a sample demand
on the key's sandbox side. Its last node tells you what to do next: copy `api_key` from the Register Free Key output
into a Taifoon Relayer API credential, then use template 10.

## Resell through Taifoon (the key is the product)

Every tenant is a reseller by default. The path is one key, then children, and n8n never signs or sends a payment:

1. **Account → Register Free Key** (template 11) mints your tenant's keys, shown once; save the live key as the credential.
   (**Account → Subscribe** does the same in one call and also answers the payment terms of a balance top-up.)
2. **Account → Get Access Quote** with the credential: a plan (`builder-99`, `team-199`, `protocol-299`) or a balance of
   1–500 USDC on a pay chain (Base, Arbitrum One, Arc, Monad; USDG on Robinhood Chain). The answer carries `pay` (the exact
   transfer to the vault) and `sign` (the exact message, naming your key). Without the credential there is nothing to sign.
3. **You** send the transfer from one wallet (an EOA) and `personal_sign` the message with it, the transaction hash filled in.
4. **Account → Claim Plan** or **Claim Top-Up** with the transaction hash and the signature credits your key. A 404 means
   the transfer is not deep enough yet: run it again in a few seconds. **Get Key Standing** shows what the key holds.
5. **Account → Mint Child Key** mints a customer of yours: its own tenant and keys, shown once, with your markup in basis
   points per product (`{ "*": 1000 }` is 10 % on everything). The child pays from your balance at the wholesale price and
   owes you list + markup; **Get Reseller View** shows the children, their usage, what they owe and the margin (ledger
   rows only: nothing is invoiced or paid out by the layer).

Template [`workflows/15-resell-through-n8n.json`](workflows/15-resell-through-n8n.json) runs step 2 and the view, and
its last node says what to pay, sign and claim; its **Mint Child Key** node is disabled until you enable it, because a run of it
mints a real customer tenant (10 a day). No operation reads a key back: `GET /v1/tenant/me` and `GET /v1/access/key`
list prefixes.

## Inference through Taifoon

**Inference → List Models** reads the models the gate serves (`GET /v1/models`, OpenAI-shaped). **Inference → Chat** runs one
chat completion through the OpenAI-compatible gate (`POST /v1/chat/completions` with your key), metered on the key at the list
price. A free key is served within its **free agreement**; a reseller's child key is paid by the reseller. Every refusal is the
OpenAI API error object. For a Basic LLM Chain, use n8n's own **OpenAI Chat Model** node: base URL
`https://coord.taifoon.dev/v1`, API key your `tfr_` key, **Use Responses API** off. The gate does not pass tool calls through yet
(`tools` is named back in `taifoon.not_applied`), so an AI Agent that calls tools needs a tool-calling model.

## Sell through Taifoon

Any n8n instance can sell a job class through the layer. Buyers pay the seller's price plus 49 bps.

1. **Import a seller template** and activate it: `12-sell-digest.json` (class `mcp.digest`), `13-sell-json-normalize.json`
   (`a2a.json_normalize`) or `14-sell-word-count.json` (`chat.word_count`). Each has two webhooks:
   - **Card** (GET `<slug>-card`) serves your card: ERC-8004 registration-v1 shaped, `kind: "n8n"`, the class, the price
     (`price_usdc: 0.05`), the Hire webhook as `endpoint`, and `taifoon_listing`.
   - **Hire** (POST `<slug>`) receives the offer and always answers 200 with
     `{ nonce, provider, status: "delivered" | "refused", result }`. It echoes the offer's nonce, and a task it cannot
     parse is refused with `result: { error }`.

   In the Card's Code node, set `ADDRESS` to your payout address and the endpoint to your own instance's webhook URL.
   Set the same `ADDRESS` in the Hire Code node.
2. **Claim it:** **Account → Register Seller** with the Card URL. The answer is a listing (`ls_…`, state `claimed`) and a
   challenge `nonce`.
3. **Put the nonce in the card:** paste it into `TAIFOON_LISTING` at the top of the Card's Code node, and save.
4. **Verify:** **Account → Verify Seller** with the listing ID. The layer reads the nonce from your card and sends your
   Hire webhook a probe for each class. When the probes pass, the listing is `listed`. **Catalog → Get Listing** shows
   its state and, when it is not listed, why.

When a listed seller is bought, the demand settles on the devnet 36927. It is sold at your price + 49 bps and paid to
the **seller of record** that the layer names in the explorer row (`payee`). Paying the doer, meaning your payout address
directly, is not switched on. The explorer shows `doer_is_payee` on every job.

## Helpdesk through Taifoon (Show Me Around ++)

**Helpdesk → Ask** puts one question about one product to the layer's helpdesk (`POST /v1/sma/ask`, channel `n8n`) and
answers a case: the product's knowledge graph answers first, free and measured; what the graph does not know is routed to a
nominated expert, the tenant's agent or a person, and the case stays open on the product's weakest list until it is answered
and graded. Every answer is graded before it is settled as one `sma.case` line (0.10 USDC above the free allowance of 20 a day
per key; legs provider 70 · graders 20 · ecosystem 10). The words are sealed under your tenant's topic; only their digest
travels on the case.

| Step | Operation | What it does |
|---|---|---|
| Ask | **Helpdesk → Ask** | `{ product, question, channel: "n8n", hint?, route? }` → the case, and `words` when the graph or an agent answered now, `unknown` when it did not, `handoff` when a specialist's booking page is the answer |
| Read | **Helpdesk → Get Graph**, **Get Weakest** | the product's nodes and edges (`scope` public · product · tenant; a key widens it), and the ranked unknowns an expert works down |
| Learn | **Helpdesk → Answer Case**, **Grade Case**, **Tune Loop** | `POST /v1/sma/learn` with exactly one of `answer { words, fix? }`, `grade { score, by }`, `tuning { loop, value }` (admin only) |
| Nominate | **Helpdesk → Nominate Expert**, **Accept Nomination**, **Revoke Nomination** | the admin key enlists an expert key with its payee, chains, share (≤ 7000 bps), cap per period and classes; the expert accepts; the admin revokes |

A workflow that answers its own product's cases: **Taifoon Trigger** is not needed; poll **Get Weakest** on a schedule, let your
expert (a person, or an AI Agent with the graph as context) write the answer, send it with **Answer Case**, and the buyer's
**Grade Case** settles it to the expert's nominated payee.

## Taifoon Trigger

Polls `GET /v1/jobs` and emits jobs that changed. Filter by event (any change, completed, expired,
rejected, cheat finding, still open) and by address (buying, selling, or either).

Two behaviours worth knowing, both of which exist because the simpler version was wrong:

- **The cursor is `<updatedAt>.<jobId>`, passed back verbatim.** A bare timestamp cannot page through jobs
  that share a second: comparing `>=` re-delivers them forever, comparing `>` silently skips all but the
  first.
- **A job is emitted once per (job, status), not once per job.** Funded, submitted and completed are three
  different facts about one job. Keying on the job alone drops the completion, which is the fact most
  workflows exist to catch.

The cursor advances only after a batch arrives, so a failed poll re-reads the same window. That is
at-least-once delivery. On first activation it starts one hour back, so switching a workflow on does not
fire it dozens of times; set **Backfill on First Run** to change that. A manual test shows what would be
emitted without consuming it.

## A job ends in exactly one of four ways

| Status | Meaning |
|---|---|
| `done` | Completed. Seller paid, deposit returned, premium to the pool that covered it. |
| `expired` | Past the deadline. Everything unwinds, nobody penalised. Anyone may trigger it. |
| `rejected` | Graded bad. Everything walks back. The pool pays nothing. |
| `cheat` | An adjudicated finding. Paid from the seller's deposit first; the pool covers only the rest. |
| `open` | Still in flight. **Not an ending.** |

## Completion → Submit, and what `write` means

The relayer re-verifies the proof against the chain itself (it never reads the caller's copy), and the
call is idempotent on Job ID + Nonce. `accepted: true` means the completion was verified and recorded.
It does **not** mean a transaction exists. `write` says which of three things happened:

| `write` | What happened |
|---|---|
| `signed-by-hosted-vault` | The provider is a vault the layer hosts and is the seller on chain, so the vault signed `submit`. Poll until `status: settled`. |
| `unsigned-call-returned` | The provider holds its own key. No relayer can sign for a key it does not hold; `unsigned_call` is the exact call to send. |
| `none` | The job lives in a contract this relayer does not operate. The completion and its proof were recorded; no transaction was sent. |

Errors follow one contract: `401` bad or missing key, `409` the proof is not final or the job is not
awaiting a submission, `422` the body is invalid (every problem listed at once), `429` rate limited,
`5xx` transient — retry with backoff.

## Capabilities are not agents

**Discovery → Get Capabilities** lists what n8n workflow templates and community nodes can do. None of it
can be hired: a template has no live webhook. Something becomes hireable when someone deploys it and
registers its card with **Agent → Register**. **Agent → Match** never returns a capability as a candidate;
on a miss it may say that a skill exists on the n8n side, undeployed.

## Example workflows

In [`workflows/`](workflows). Import them from the n8n editor, or run `n8n import:workflow --input=<file>`.

| File | What it does |
|---|---|
| [`11-first-run.json`](workflows/11-first-run.json) | No credential yet: mint a free key, post a sample demand, and read the next steps. |
| [`15-resell-through-n8n.json`](workflows/15-resell-through-n8n.json) | **The reseller path**: quote a plan for your key (pay and sign with your wallet, then claim), read the margin; enable its Mint Child Key node to mint a customer. |
| [`10-buy-through-taifoon.json`](workflows/10-buy-through-taifoon.json) | Buy in one click: post a need, poll the demand until it ends, read the explorer row, and verify the settle transaction against the chain. |
| [`12-sell-digest.json`](workflows/12-sell-digest.json), [`13-sell-json-normalize.json`](workflows/13-sell-json-normalize.json), [`14-sell-word-count.json`](workflows/14-sell-word-count.json) | Sell a job class: a card webhook and a hire webhook (see *Sell through Taifoon*). |
| [`1-n8n-hires-on-chain.json`](workflows/1-n8n-hires-on-chain.json) | Match by skill → quote → create an offer → open a handshake → the exact calls to sign. |
| [`3-watch-the-chain.json`](workflows/3-watch-the-chain.json) | Trigger on completed jobs → verify against the chain → report only what is corroborated. |

[`workflows/TEMPLATES.md`](workflows/TEMPLATES.md) describes the rest. Templates 10–14 are checked offline by
`test/workflows.test.js`, which runs their Code nodes against sample offers.

## Security

The node holds no blockchain private key and sends no transaction. The only secret it handles is one API key, kept in
n8n's encrypted credential store and sent as `X-API-Key` over TLS to `coord.taifoon.dev` and to no other host. The
base URL is fixed in the node. The node reads no environment variables and no files. Details: [`SECURITY.md`](SECURITY.md).

## Development

```
npm ci
npm run lint       # n8n's community-node rules (@n8n/node-cli, strict mode)
npm run build
npm test           # offline: every operation's request, the trigger's cursor, the templates' Code nodes
npm run scan       # n8n's submission scanner on this checkout and on the packed tarball
```

`npm run test:live` checks the operations against the live OpenAPI document. Releases are published from GitHub
Actions with npm provenance (`.github/workflows/publish.yml`, on a GitHub release `vX.Y.Z`).

---

<p align="center"><a href="https://taifoon.io"><img src="https://raw.githubusercontent.com/taifoon-io/n8n-nodes-taifoon/main/assets/taifoon.svg" alt="Taifoon" height="22"></a></p>

## Licence

MIT
