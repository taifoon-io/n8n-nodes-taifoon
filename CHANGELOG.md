# Changelog

## 1.2.1 (2026-10-29)

- **README: See it run.** Three recordings from one take of 1.2.0 in n8n 2.43.8 against the production API: the install, the
  credential and its test, and an n8n workflow selling on Taifoon while a second one buys it (`assets/*.gif`, shown on npm through
  their GitHub URLs), plus the full take (`assets/review-1.2.0.mp4`). No change to the node.

## 1.2.0 (2026-10-29)

- **Helpdesk** (new resource; Show Me Around ++, `_SMA_HELPDESK_v1_`; first in the public repo as an unpublished 1.1.0 on 2026-10-23): a resource on the four `/v1/sma` routes. **Ask** (`POST /v1/sma/ask`, channel
  `n8n`, `X-Taifoon-Channel: n8n`) puts one question about one product and answers a case; **Get Graph** and **Get Weakest** read the
  product's knowledge graph and its ranked unknowns (`GET /v1/sma/graph`); **Answer Case**, **Grade Case** and **Tune Loop** close the
  loop (`POST /v1/sma/learn`); **Nominate Expert**, **Accept Nomination** and **Revoke Nomination** enlist the expert a case's provider leg
  pays (`POST /v1/sma/nominate`). The request each one builds is pinned in `test/helpdesk.test.js`; the live
  suite skips the `/sma` routes until the layer serves them.
- **Generated from coord's language** (`scripts/gen-descriptions.mjs`, `npm run gen` / `npm run gen:check`): the operations coord
  `lang/cue/n8n-resale.cue node_ops` names are emitted from `coord-lang/n8n-resale.json` (`coord gen` row `n8n-resale-node`);
  every hand-typed op it names (Inference → Chat, List Models; Account → Register, Key Standing, Reseller View, Mint Child Key,
  Register / Verify Seller) is checked against its gate route. A drift fails `npm test`.
- **Reseller Key** (new resource): **Mint Child Key** (`label`, `cap_usdc`), **List Child Keys** (usage by key and channel,
  `window`), **Revoke Child Key** (`key_id`), **Mint Promo**, **List Promos**, **Redeem Promo**, **Enrol Client Vault**,
  **List Client Vaults**. Child keys, promos and client vaults are for an enrolled partner; a self-serve tenant is answered
  `403 child_keys_off` (child tenants stay Account → Mint Child Key).
- **Agreement** (new resource): **List Agreements** and **Accept Agreement** (`doc`, `product`, `how`).
- **Template → Get Demand**: `GET /v1/n8n/demand`. Template → List is unchanged (now generated).
- Template 24 *n8n sells through Taifoon* (`workflows/24-n8n-sells-through-taifoon.json`): the MCP Client node lists a workflow as a
  seller and reads its offers; nothing in it moves money.
- No operation renamed; saved workflows keep working. Published to npm from the public repo with provenance.

## 1.1.0 (2026-10-21)

- **Commerce** (new resource): **Hire**, **Grade** and **Settle (Plan)**, the same requests as Job → Create Offer, Judge → Grade
  and Settlement → Settle (and the MCP tools `taifoon_hire`, `taifoon_grade`, `taifoon_settle_plan`). Settle answers the unsigned
  calls only; nothing is signed or sent by the node.
- **Template → List** (new resource): our own n8n templates with class, kinds of work, channel and live price (`GET /v1/n8n/templates`).
- **Channel ID** on the credential: sent on every call as `X-Taifoon-Channel` (empty: `n8n`). A sale on Taifoon's walls that names a
  channel registered with `POST /v1/channels` pays it 20 % of Taifoon's fee as its own leg. The credential is now offered on every resource.
- **README** short, for n8n integrators and agencies; the long form moved to `REFERENCE.md`.
- No operation renamed; saved workflows keep working.

## 1.0.3 (2026-10-20)

- **README:** the Taifoon OpenAI Chat Model drives a Basic LLM Chain; an AI Agent that calls tools needs a tool-calling model
  of its own (the gate does not pass tool calls through yet).
- The live suite checks operator-only writes by their `free_scope` refusal when it runs with a free key.

## 1.0.2 (2026-10-20)

Every shipped workflow was run in a real n8n 2.43.8 against the production API with a free key (README → *Verified live*).

- **Templates:** only the ones a self-serve user can run ship (1, 3, 10, 11, 12–14, 15). Template 1 defaults to a skill live sellers
  publish, on the devnet. Template 10 polls up to ~10 minutes (a live demand settled in about 6). The sellers 12–14 ship a payout
  address placeholder and name their own webhook host (they shipped ours).
- **Agentic commerce:** the error table follows coord (`card_unreadable` carries its next step).
- **README:** who it is for, what was verified live, the real counts (66 operations, 14 resources).
- No operation renamed; saved workflows keep working.

## 1.0.1 (2026-10-20)

- **Inference → Chat** now goes through the OpenAI-compatible gate on coord (`POST /v1/chat/completions`), the same door n8n's
  OpenAI Chat Model node uses. 1.0.0 called `api.taifoon.dev/gpu/{model}/chat`, which refused a free key (403) although the
  description promised the free agreement. Model is now an optional body field (default: our own GPU); `llama-3.1-8b` from a saved
  1.0.0 workflow still routes. The lane option is gone: the gate prices by model.
- The live suite calls Chat for real (one short answer) and checks every refusal is the OpenAI error object.

## 1.0.0 (2026-10-20)

- **Agentic commerce workflows** (`workflows/agentic-commerce/`): one main flow and four sub-workflows (`tf.handshake`,
  `tf.chat`, `tf.buy`, `tf.sell`), built-in n8n nodes only, reselling both ways under the agentic-commerce agreements. One key
  in one Header Auth credential; every answer and refusal in one error contract (the OpenAI API error object at the status the
  `openai` SDK maps to its classes; coord `lang/cue/gate-errors.cue`). Tested end to end in a real n8n 2.43: 11/11.
- Includes 0.8.0 (the key path and the reseller path) and 0.9.0 (Inference → Chat and List Models), not published separately.
- No operation renamed; saved workflows keep working.

## 0.9.0 (2026-10-19)

- **Inference → Chat, List Models**: one chat completion on the GPU gate (`POST api.taifoon.dev/gpu/{model}/chat` with the key, spot
  or reserved lane, metered on the key; a key with nothing is served within its free agreement; a child key is paid by its reseller)
  and the resold models (`GET /v1/models`). The n8n reseller report of 2026-10-19 asked for both.
- `X-Taifoon-Client: n8n-nodes-taifoon/0.9.0`.

## 0.8.0 (2026-10-19)

- **Account → Subscribe (Free Key + Terms), Get Access Quote, Claim Plan, Claim Top-Up, Get Key Standing, Get Reseller View,
  Mint Child Key**: the key path (quote → the payment is sent and signed by YOUR wallet → claim) and the reseller path (every
  tenant resells by default; a child key is a customer of yours, debited at wholesale from your balance, owing list + markup).
  Nothing in the node signs or sends a payment, and no operation reads a key back.
- Template `15-resell-through-n8n.json` (its Mint Child Key node is disabled until you enable it; error executions are not saved); README "Resell through Taifoon".
- `X-Taifoon-Client: n8n-nodes-taifoon/0.8.0`; the mint calls (Register Free Key, Subscribe, Mint Child Key) carry `X-Taifoon-Channel: n8n`.

## 0.7.0 (2026-10-19)

Rebuilt for n8n's verified community nodes. No operation, parameter, node type or credential type changed, so saved
workflows keep working.

- **Scaffolded with `@n8n/node-cli`** (`n8n-node build | lint | release`). gulp, `eslint-plugin-n8n-nodes-base`, the
  old `.eslintrc` files and `index.ts` are gone; `eslint.config.mjs` is the node-cli config with no rule turned off.
- **Strict mode on** (`"n8n": { "strict": true }`); no run-time dependencies; `n8n-workflow` is the only peer dependency.
- **One service:** the package is described strictly as the Taifoon coordination API (`coord.taifoon.dev/v1`). Agent
  venues and chains appear only as data.
- **Published from GitHub Actions with npm provenance** (`.github/workflows/publish.yml`, on a GitHub release
  `vX.Y.Z`). The workflow runs lint, build, tests and n8n's scanner before publishing, and the scanner again on the
  published version (blocking). `.github/workflows/ci.yml` runs the same gates on every push.
- **author** is the npm publisher and GitHub maintainer (`yawning.monsoon@proton.me`).
- `scripts/scan.mjs` runs `@n8n/scan-community-package` 0.39.0.
- README rewritten: one API, credential setup, payments from inside n8n are `key_balance` only (the node never signs;
  x402 and escrow are handled on the server side), the operations table, example workflows.
- `X-Taifoon-Client: n8n-nodes-taifoon/0.7.0`.

## 0.6.2 (2026-10-07)

- Wording: the judge calls run on the caller's 3 free grades (per account, API key or address), then on bought grades,
  as `GET /v1/judge/credits` answers. The credential, Compose Verdict's "One Call" mode and the "Your TypeSafe Key"
  field said "free calls".
- `X-Taifoon-Client: n8n-nodes-taifoon/0.6.2`.

## 0.6.1 — 2026-10-01

- **Removed Discovery → Get Scan, Get Candidates and Get Coverage** (`GET /v1/harvest`). The raw harvest is no longer a
  public API: `/v1/harvest` answers 404 to the public. The same index is public as figures in `GET /v1/landscape`, and
  as agents in Agent → Get Cards, Get Wire-Ready and Match. A workflow that used one of the three operations stops with
  "operation not found"; switch it to one of those. Discovery's default operation is now Get Standards.
- **Every operation is covered by a live contract test** (`test/live/ops.test.js`, `npm run test:ops` with a test key).
  The test sends exactly the request the node builds. It checks the success answer against the schema `/v1/openapi.json`
  declares, the latency budget, each documented refusal (`{ ok: false, code, error, next_step }`, never a 5xx), and the
  wrong method (405). `test/coverage.test.js` fails when an operation ships without a contract.
- Fixed behind the node, in the API: Catalog → Get Listing found none of the listed n8n sellers (404). Every refusal now
  carries a `code`. A shortened address or hash in a path is a 400 that names the parameter, not a 404. A negative
  limit or offset is a 400. Get Root's `chainsCovered` is filled. Compose Verdict with no subject is a 400.
- `X-Taifoon-Client: n8n-nodes-taifoon/0.6.1`; the layer now counts node traffic by this header.

## 0.6.0 — 2026-09-30

- **Sell through Taifoon from n8n.** Two Account operations list an n8n workflow as a seller:
  - **Register Seller** (`POST /v1/listings/claim { card_url, kind: "n8n" }`, needs the credential): claims the workflow by
    its card URL and answers with a challenge `nonce`. Put it in the card field `taifoon_listing`.
  - **Verify Seller** (`POST /v1/listings/{id}/verify`, the key that claimed it): the layer reads the nonce from the card
    and probes the hire webhook per class; on success the listing is `listed`.
- **Catalog → Get Listing** (`GET /v1/listings/{id}`) and **Get Many Listings** (`GET /v1/listings`, filters kind, state,
  class, whose, limit): the listings with their counts and funnel.
- **Account → Register Free Key** sends `X-Taifoon-Channel: n8n`, so the tenant is recorded as come via n8n. Every request
  carries `X-Taifoon-Client: n8n-nodes-taifoon/0.6.0` (kept equal to the package version by a test) so the layer can
  attribute node traffic.
- Templates in `workflows/`:
  - `10-buy-through-taifoon.json`: the one-click buyer (a need in words → Demand → Post → poll ≤ 20 times → Explorer →
    Verify Hire Claim on the settle tx → receipt).
  - `11-first-run.json`: no credential yet. Mint a free key, post a sample demand on its sandbox key, and read the next
    steps. The keys are not repeated in the output, and successful executions are not saved.
  - `12-sell-digest.json` (`mcp.digest`, sha256 by n8n's Crypto node), `13-sell-json-normalize.json`
    (`a2a.json_normalize`) and `14-sell-word-count.json` (`chat.word_count`): class sellers, each a Card webhook (GET
    `<slug>-card`) and a Hire webhook (POST `<slug>`) that always answers 200 `{ nonce, provider, status, result }`.
- `test/workflows.test.js` runs the sellers' Code nodes against sample offers (quotes inside the text, nested
  objects and arrays, unicode, probes, refusals) without n8n. The live route check skips the `/v1/listings` routes, with
  a message, while the layer answers them 404.

## 0.5.0 — 2026-09-30

- **n8n buys through the layer in one node.** New resources, each a plain /v1 request:
  - **Demand** → Post (`POST /v1/demands`: the work in words, a job of a class with its input, or a catalog entry
    with the work in words), Get (`GET /v1/demands/{id}`: poll until settled / unmatched / failed / cancelled),
    Get Many. The auto-match loop claims the demand, picks the seller, hires it, grades the reply by code and settles on
    the devnet 36927. Options: buyer label (shown in the explorer; `n8n…` marks the job as an n8n buy), class, dry run,
    price.
  - **Catalog** → Get Many / Get (`GET /v1/catalog`): the resale catalog, the seller's price + 49 bps, the cover.
  - **Explorer** → Get / Get Many (`GET /v1/explorer/jobs`): doer, payee (seller of record), grade, money, every tx.
  - **Account** → Register Free Key (`POST /v1/register`; the key is shown once — save it as the credential) and
    Get My Tenant (`GET /v1/tenant/me`).
- The credential is offered on Demand and Account too (a key posts on its own counters and tenant).
- Workflows `tfnbuyerdemand01` (a need in words) and `tfnbuyern8nsel01` (buys the n8n seller from the catalog) in
  `workflows/` are the reference buyer flows: Post → poll → Explorer → Proof → Verify Hire Claim → receipt.
- The node, the Trigger and the relayer credential test call **`https://coord.taifoon.dev/v1`**, the coordination
  layer's public host (same deployment as `www.taifoon.io/v1`, which keeps answering). The credential is sent to that
  one origin only; README and SECURITY name it.


## 0.4.5 — 2026-09-27

- **Judge → Compose Verdict → Record On** (`none` | `devnet` | `base` | `both`, default `none`): the layer's `record` flag.
  Since the layer made on-chain recording opt-in, a compose without it writes nothing on chain; workflow 8 sets `devnet`
  so every step of HIRE → JUDGE → SETTLE carries a transaction. `base` is metered by the layer's daily budget.

## 0.4.4 — 2026-09-27

- The /v1 writes now say who may make them (the layer's write-auth change of 2026-09-27). The Taifoon Relayer API credential is offered on
  **Handshake** and **Job** too: Handshake → Attach Job and Job → Create Offer with a handshake id need the key that
  opened the handshake; Handshake → Open uses the key's budget when attached (else a 5/minute visitor budget).
- **Judge → Submit Review**: the reviewer is the key. Owner Wallet is optional once bound; the new **Owner Signature**
  binds the wallet to the key once (the owner's personal_sign of the message a 403 returns).
- Workflows 1, 7 and 8 attach the credential by name ("Taifoon Relayer API"); workflow 7 has an `OWNER_SIGNATURE` constant.

## 0.4.2 — 2026-09-27

- **Judge → Compose Verdict** descriptions follow the layer's _JEV_SAME_INPUT_v1_: every compose path (one call on the trial, one call with a key, Prepare → TypeSafe → Answers) now asks Jev the same four questions on the same text — the evidence plus the facts code established. Prepare returns four questions (was six); Answers takes those four. No parameter changed; workflow 8 needs no edit (it passes `jev.questions` through).

## 0.3.1 — 2026-09-24 (unreleased)

- **Judge → Get Reviewable Jobs** (`GET /v1/grid/review`) and **Judge → Submit Review** (`POST /v1/grid/review`): a Grid node's owner reports a paid delivery it read from chain through its own RPC; optional Jev grade rides along. The work behind the reviewers' 20%.
- Workflow 7: the Grid reviewer (chain read in a Code node with 429 backoff, optional Jev grade, submit, remember what was reviewed; a transient gateway failure is retried next run, not marked done).

## 0.3.0 — 2026-09-23 (private)

- **Judge resource**: Grade (up to 4 items in one calibrated call), Judge One, Get Ready Jobs, Get Trace, Get Stages, Post Verdict (unsigned), Give Feedback (unsigned, ERC-8004).
- **Agent → Get Wire-Ready**: agents the harvester spoke to in their own protocol and that answered (CRM `?wire=ready`).
- **Taifoon Devnet Signer** node + **Taifoon Devnet Key** credential: the one node that holds a key — a devnet key by construction (chain 36927 only unless the guard is switched off). Sends the unsigned calls the Taifoon node builds and returns receipts with explorer links. Adds `viem`.
- Workflow 6: the Jev on-chain grader — ready jobs → one grade call → stamp (unsigned) → devnet signer.
- Operation lists alphabetized (n8n rule).


## 0.2.0

A rewrite. 0.1.0 was never published, and of the 17 endpoints it called, 2 existed: 9 answered 404 and 6
answered 401 because it sent a Bearer token where the API wants `x-api-key`. Its credential test pointed
at a 404, so a credential could not be saved. Its lint configuration extended only the `community` rule
set and could not parse `package.json`, so the node code was never checked.

- Declarative **Taifoon** node over `https://www.taifoon.io/v1`: Agent, Assurance, Completion, Discovery,
  Handshake, Job, Proof.
- **Taifoon Trigger**: polling trigger on job changes, with a resumable `(updatedAt, jobId)` cursor and
  dedupe on `(job, status)`.
- Credential is optional and only used by Completion. With `required: true`, n8n's routing engine demanded
  it for every operation and public reads failed with "Credentials not found" — found by running the node
  in n8n; no linter reports it.
- Credential type is `taifoonRelayerApi`, not `taifoonApi`: `n8n-nodes-taifoon-typesafe` already owns that name with
  different fields, and credential type names are global to an n8n instance.
- Themed light/dark icons with square corners, `NodeConnectionTypes.Main`, and a credential icon — all
  required by n8n's current submission scanner and none reported by the older lint plugin.
- `npm run scan` runs n8n's submission scanner locally, in an isolated install.
- `npm run test:live` checks every operation against the live OpenAPI document.
- Three example workflows, each executed in n8n 2.39.8 against production.
