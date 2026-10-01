# Changelog

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
