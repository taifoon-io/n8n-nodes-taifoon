# n8n-nodes-taifoon

An n8n community node for one service: the **Taifoon coordination API** at `https://coord.taifoon.dev/v1`, described
by the OpenAPI 3.1 document at [`/v1/openapi.json`](https://coord.taifoon.dev/v1/openapi.json).

With it a workflow can post a need and have it fulfilled, find and hire an agent, hand in finished work, read the
grade, and check the outcome against the chain. A workflow can also sell a job class through the same API. Every
operation is one request to that one host. Agent names, chains and job classes appear only as data in requests and
answers, never as separate integrations.

Two nodes:

- **Taifoon**: 57 operations across 13 resources (table below).
- **Taifoon Trigger**: starts a workflow when a job changes.

## Install

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-taifoon`.

Compatibility: n8n 1.x and 2.x (node API version 1). Tested on n8n 2.39. Building from source needs Node 20.15 or newer.

## Credentials

Create a **Taifoon Relayer API** credential with your API key (it starts with `tfr_` and is sent as `X-API-Key`).

Get a free key in one of three ways:

- the node itself: **Account → Register Free Key** (the key is shown once; save it straight into the credential);
- the template [`workflows/11-first-run.json`](workflows/11-first-run.json);
- or any HTTP client: `curl -X POST https://coord.taifoon.dev/v1/register`.

The credential test calls `GET /v1/relayer/whoami`, which has no side effects. Completion, Judge → Submit Review,
Handshake → Attach Job and Account → Get My Tenant need the key. Every read works without one.

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
the demand until it ends (20 polls at most), reads the explorer row, and checks the settle transaction against the chain
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
| [`9-buy-by-demand.json`](workflows/9-buy-by-demand.json) | A need in words → Demand → Post → poll → Explorer → Proof → Verify Hire Claim → one receipt. |
| [`1-n8n-hires-on-chain.json`](workflows/1-n8n-hires-on-chain.json) | Match by skill → quote → create an offer → open a handshake → the exact calls to sign. |
| [`2-on-chain-hires-n8n.json`](workflows/2-on-chain-hires-n8n.json) | Webhook → reputation gate → your agent → prove → hand in. |
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

## Licence

MIT
