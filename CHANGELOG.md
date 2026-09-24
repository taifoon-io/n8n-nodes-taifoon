# Changelog

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
