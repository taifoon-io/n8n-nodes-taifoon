# n8n-nodes-taifoon

Hire on-chain agents from n8n, and let them hire your workflows. Match by skill, price the guarantee,
fund a job, hand in the work, and check every claim against the chain before you believe it.

Two nodes: **Taifoon** (60 operations across 13 resources) and **Taifoon Trigger** (starts a workflow
when an on-chain job changes).

Everything talks to one API, `https://coord.taifoon.dev/v1` — the coordination layer's public host — described
by an OpenAPI 3.1 document at [`/v1/openapi.json`](https://coord.taifoon.dev/v1/openapi.json). The same deployment
also answers at `https://www.taifoon.io/v1` (earlier versions of this node call that host; both keep working).

## The Taifoon family (no name clashes)

This package is designed to run **on the same n8n instance** as Taifoon's typed-decision node. They share
nothing that would collide:

| Package | Node types | Credential |
|---|---|---|
| `n8n-nodes-taifoon` (this one) | `taifoon`, `taifoonTrigger` | `taifoonRelayerApi` (a relayer `tfr_` key) |
| `@taifoon/n8n-nodes-typesafe` | `taifoonTypeSafe` | `taifoonGatewayApi` (a deck `tfn_` principal key) + `typeSafeApi` |

n8n node-type and credential-type names are global to an instance, so this separation is deliberate: nothing
here is named `taifoonApi`, `taifoonGatewayApi`, `typeSafeApi`, or `taifoonTypeSafe`. Both packages are
verified together on `n8n.taifoon.dev`.

## What this node will never do

**It never signs a transaction and never holds a key.** Operations that lead to an on-chain write return
*unsigned* calldata, each call carrying its effect in plain words and who must sign it. Your wallet, your
enclave or your signer sends it. A relayer holding your key would be the trusted party this protocol
exists to remove.

## Install

Settings → Community Nodes → Install → `n8n-nodes-taifoon`.

## Credentials

**Completion** and **Account → Get My Tenant** need one. **Demand → Post** uses it when attached: the demand then
counts on the key's own budget and tenant instead of the per-IP visitor budget. Every other operation is a public read and
works with no credential. Get a free key once with **Account → Register Free Key** (or `npx @taifoon/cli login --free`); it is
shown once, so save it straight into the credential.

| Field | Value |
|---|---|
| API Key | A relayer key starting `tfr_`. Sent as `X-API-Key`. |

The credential test calls `GET /v1/relayer/whoami`, which has no side effects and does not count against
the key's rate limit.

## Operations

| Resource | Operation | Request |
|---|---|---|
| Account | Get My Tenant | `GET /v1/tenant/me` |
| Account | Register Free Key | `POST /v1/register` |
| Account | Register Seller | `POST /v1/listings/claim` |
| Account | Verify Seller | `POST /v1/listings/{id}/verify` |
| Agent | Get Cards | `GET /v1/agents/cards` |
| Agent | Get Market | `GET /v1/agents/market` |
| Agent | Get Providers | `GET /v1/agents/providers` |
| Agent | Get Registered | `GET /v1/agents/registered` |
| Agent | Get Reputation | `GET /v1/agents/who/{address}` |
| Agent | Match | `POST /v1/match` |
| Agent | Register | `POST /v1/agents/register` |
| Assurance | Build Call | `POST /v1/assurance/call` |
| Assurance | Get Deployment | `GET /v1/assurance` |
| Assurance | Get Pools | `GET /v1/pools` |
| Assurance | Get Quote | `POST /v1/assurance/quote` |
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
| Explorer | Get | `GET /v1/explorer/jobs/{id}` |
| Explorer | Get Many | `GET /v1/explorer/jobs` |
| Handshake | Attach Job | `POST /v1/handshake/{handshakeId}` |
| Handshake | Get | `GET /v1/handshake/{handshakeId}` |
| Handshake | Open | `POST /v1/handshake` |
| Job | Create Offer | `POST /v1/jobs` |
| Job | Get Changed | `GET /v1/jobs` |
| Job | Get Ledger | `GET /v1/agents/ledger` |
| Proof | Get Root | `GET /v1/root/latest` |
| Proof | Get Transaction Proof | `GET /v1/proof/tx/{chainId}/{txHash}` |
| Proof | Verify Hire Claim | `POST /v1/attest/hire` |

This table is generated from the built node, and `npm run test:live` checks every row against the live
OpenAPI document.

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

In [`workflows/`](workflows). Import from the n8n editor, or `n8n import:workflow --input=<file>`.

| File | What it does |
|---|---|
| `10-buy-through-taifoon.json` | **The one-click buy** (see *Buy through Taifoon*). |
| `11-first-run.json` | No credential yet: mint a free key, post a sample demand, and read the next steps. |
| `12-sell-digest.json`, `13-sell-json-normalize.json`, `14-sell-word-count.json` | Class sellers (see *Sell through Taifoon*). |
| `9-buy-by-demand.json` | **The one-call buy.** A need in words → Demand → Post → poll Demand → Get until it ends → Explorer → Get → Proof → Verify Hire Claim on the settle transaction → a receipt. The layer matches the seller, hires it, grades the reply by code and settles on the devnet 36927. Attach your Taifoon Relayer API credential to the two Demand nodes. |
| `1-n8n-hires-on-chain.json` | Match by skill → quote → create offer → open handshake → the exact calls to sign. |
| `2-on-chain-hires-n8n.json` | Webhook → reputation gate → *your agent* → prove → hand in to the relayer. |
| `3-watch-the-chain.json` | Trigger on completed jobs → verify against the chain → report only what is corroborated. |
| `4-enroll-this-workflow.json` | Make your n8n hireable: serve your agent card from a webhook, plan the enrollment and its deposit, register the card URL. Pair with workflow 2. |
| `7-grid-reviewer.json` | The reviewers' 20%: paid deliveries (the Virtuals ACP contract on Base) → read each job's whole trail from chain through **your** RPC (Code node) → optional Jev grade (disabled until you enable it) → Submit Review as your Grid node's owner wallet. The gateway reads the job itself and credits only an exact match (tx, log index, block, block hash); at most 3 reviewers a job. Set `RPC` and `OWNER` at the top of the Code node, attach your Taifoon Relayer API credential to Submit Review (the reviewer is the key), and for the first run paste `OWNER_SIGNATURE` — OWNER's signature binding it to that key. |

Workflows 1–3 were imported into n8n 2.39.8 and executed against the production API. Templates 10–14 are checked offline by `test/workflows.test.js`, which runs their Code nodes against sample offers.

## Security

This node holds no blockchain private key and sends no transaction. Writes come back as *unsigned*
calldata that your own signer sends. The only secret it handles is one relayer API key, stored in n8n's
encrypted credential store and sent as `X-API-Key` over TLS to `coord.taifoon.dev` — and to no other host. It is
required by Completion, Handshake → Attach Job, Job → Create Offer with a handshake id and Judge → Submit Review;
Handshake → Open and the judge calls use it when attached (without it they run on a small per-IP visitor budget).
The reads need no key; /v1/openapi.json marks each operation's `security`. Full
details, including what leaves your instance and the rules for hosting a hireable agent, are in
[`SECURITY.md`](SECURITY.md).

## Development


```
npm run verify     # build, lint, n8n's submission scanner, unit tests, live conformance
```

| Script | What it checks |
|---|---|
| `npm run lint` | `eslint-plugin-n8n-nodes-base`: the `community`, `credentials` and `nodes` rule sets. |
| `npm run scan` | **n8n's own submission scanner**, run against this checkout and the packed tarball. The published CLI only accepts a package already on npm, which is too late to learn that it fails. |
| `npm test` | The trigger's cursor and dedupe logic, every operation's request, and the templates' Code nodes run against sample offers. |
| `npm run test:live` | Every operation exists in the live OpenAPI document with the same method (a route new in this version is skipped, with a message, while the layer answers it 404), and the credential test refuses a bad key. |

Requires Node 20.15 or newer to build; n8n 2.x itself requires Node 24.

## Licence

MIT

## The judge, on chain (0.3.0, private)

`Judge → Grade` asks the calibrated judge one closed question over up to four items in ONE call and returns, per
item, the full distribution, the confidence, the ending, the **grade digest** and the **subject** (the job on its
chain). `Assurance → Stamp Grade` turns that into the unsigned call that appends the digest to the immutable grade
registry; `Judge → Give Feedback (Unsigned)` turns it into an ERC-8004 `giveFeedback`; `Judge → Post Verdict (Unsigned)`
drives a devnet job's ending through the adapter. None of those sign.

The **Taifoon Devnet Signer** node does — with a devnet key (free gas, public dev accounts; `faucet.taifoon.dev`
funds any address). It refuses every chain but 36927 unless the credential's guard is switched off, so a workflow
that closes the loop for a grade cannot spend real gas by accident. `workflows/6-jev-on-chain-grader.json` is the
whole loop: ready jobs → one grade call → stamp → sent → receipts with explorer links.

`Judge → Get Stages` returns the stages of a hire as the whitepaper defines them (`GET /v1/hiring/stages`); every
operation's description names its stage.
