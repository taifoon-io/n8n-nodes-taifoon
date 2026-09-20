# n8n-nodes-taifoon

Hire on-chain agents from n8n, and let them hire your workflows. Match by skill, price the guarantee,
fund a job, hand in the work, and check every claim against the chain before you believe it.

Two nodes: **Taifoon** (28 operations across 7 resources) and **Taifoon Trigger** (starts a workflow
when an on-chain job changes).

Everything talks to one API, `https://www.taifoon.io/v1`, described by an OpenAPI 3.1 document at
[`/v1/openapi.json`](https://www.taifoon.io/v1/openapi.json).

## What this node will never do

**It never signs a transaction and never holds a key.** Operations that lead to an on-chain write return
*unsigned* calldata, each call carrying its effect in plain words and who must sign it. Your wallet, your
enclave or your signer sends it. A relayer holding your key would be the trusted party this protocol
exists to remove.

## Install

Settings → Community Nodes → Install → `n8n-nodes-taifoon`.

## Credentials

Only **Completion** needs one. Every other operation is a public read and works with no credential.

| Field | Value |
|---|---|
| API Key | A relayer key starting `tfr_`. Sent as `X-API-Key`. |

The credential test calls `GET /v1/relayer/whoami`, which has no side effects and does not count against
the key's rate limit.

## Operations

| Resource | Operation | Request |
|---|---|---|
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
| Completion | Get Status | `GET /v1/jobs/{jobId}/complete` |
| Completion | Submit | `POST /v1/jobs/{jobId}/complete` |
| Discovery | Get Candidates | `GET /v1/harvest?view=candidates` |
| Discovery | Get Capabilities | `GET /v1/capabilities` |
| Discovery | Get Capability Skills | `GET /v1/capabilities/skills` |
| Discovery | Get Coverage | `GET /v1/harvest?view=coverage` |
| Discovery | Get Scan | `GET /v1/harvest` |
| Discovery | Get Standards | `GET /v1/standards` |
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
| `1-n8n-hires-on-chain.json` | Match by skill → quote → create offer → open handshake → the exact calls to sign. |
| `2-on-chain-hires-n8n.json` | Webhook → reputation gate → *your agent* → prove → hand in to the relayer. |
| `3-watch-the-chain.json` | Trigger on completed jobs → verify against the chain → report only what is corroborated. |

All three were imported into n8n 2.39.8 and executed against the production API.

## Development

```
npm run verify     # build, lint, n8n's submission scanner, unit tests, live conformance
```

| Script | What it checks |
|---|---|
| `npm run lint` | `eslint-plugin-n8n-nodes-base`: the `community`, `credentials` and `nodes` rule sets. |
| `npm run scan` | **n8n's own submission scanner**, run against this checkout and the packed tarball. The published CLI only accepts a package already on npm, which is too late to learn that it fails. |
| `npm test` | The trigger's cursor and dedupe logic. |
| `npm run test:live` | Every operation exists in the live OpenAPI document with the same method, and the credential test refuses a bad key. |

Requires Node 20.15 or newer to build; n8n 2.x itself requires Node 24.

## Licence

MIT
