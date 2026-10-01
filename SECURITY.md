# Security

This node talks to the Taifoon coordination layer at `https://coord.taifoon.dev/v1`. Everything it does is a
read or an encode; it holds no private key and sends no blockchain transaction. This file states exactly
what it handles, what it sends where, and what it deliberately refuses to do — so a reviewer does not have
to infer any of it from the code.

## What it holds, and what it does not

- **It never holds a blockchain private key.** Operations that lead to an on-chain write return *unsigned*
  calldata (`Assurance → Build Call`, `Job → Create Offer`) with the effect in plain words and who must
  sign. The signing happens in your own wallet, enclave or signer, outside this node.
- **The only secret it handles is one API key** — required by Completion, Handshake → Attach Job, Job → Create Offer
  with a handshake id and Judge → Submit Review; used when attached by Handshake → Open and the judge calls:
  - a **relayer key** (`tfr_…`), stored in n8n's encrypted credential store as credential type
    `taifoonRelayerApi`, sent as the `X-API-Key` header over TLS to `coord.taifoon.dev` and nowhere else.
  - It is never logged, never placed in a URL or query string, never echoed in a node's output, and never
    sent to any host other than `coord.taifoon.dev`.
- **The reads are unauthenticated.** No key is required for match, cards, jobs, proofs, standards, harvest,
  capabilities, quotes or registration.

## What leaves your instance, and to whom

- All requests go to **one origin, `https://coord.taifoon.dev`** (the `/v1` API — the same deployment as `www.taifoon.io/v1`), over HTTPS. The base URL is
  fixed in the node; it is not user-supplied, so a workflow cannot be tricked into pointing the credential
  at another host.
- The Trigger and the read operations send only the query parameters you set (a cursor, a skill, an
  address, a limit). They send no workflow data.
- `Completion → Submit` sends the fields you map: the job id, chain, provider address, your result text (or
  a `result_uri`), the proof transaction hash, and a nonce. **Send a `result_uri` instead of `result` for
  anything sensitive** — only a keccak-256 digest of the result is placed on chain, but the text you pass
  travels to the relayer, so do not put a secret in it.

## Addresses and proofs are checked, not trusted

- The node passes **full 20-byte addresses and full 32-byte transaction hashes**. The API refuses a
  shortened or elided form (`0x4cdb…c2b`, `0xd59d…8b47`) with a `422` and a reason, because a truncated
  value cannot be looked up. This is the exact shape a fabricated hire report used, and it is rejected.
- A completion's proof is **re-verified server-side against the chain** before anything is recorded — the
  relayer never trusts the caller's copy. `accepted: true` means *verified and recorded*, and never that a
  transaction exists; the `write` field says which of three things actually happened.

## The Trigger's delivery guarantees

- The Trigger advances its cursor only after a batch is in hand, so a failed poll re-reads the same window:
  **at-least-once**, which is the safe direction. It deduplicates on `(job id, status)`, so a job that
  legitimately reports three times (funded, submitted, completed) is emitted three times and never
  collapsed — and a duplicate is dropped rather than reprocessed. The cursor and the seen-set live in the
  workflow's own static data, not in the clock, so a restart does not replay or lose events.

## Hosting a hireable agent (the example workflows)

- **The hire webhook receives untrusted input.** Treat the incoming payload (`task`, `client`, `provider`,
  `last_tx`) as data from a stranger. The shipped workflow runs a reputation gate (`Agent → Get Reputation`)
  before doing any work, and verifies the job's own transaction against the chain before handing in.
- **Never leave a standing allowance to the assurance hook.** In the live contract, whoever funds a job
  names the seller, and the hook pulls the deposit from whatever that seller has approved. Approve exactly
  one job's deposit, after agreeing to that job. `/v1/enroll/plan` returns this rule; the workflows follow
  it.
- **The card you publish is public.** `Agent → Register` fetches your card from a URL you serve; put nothing
  private in it. It carries an address, a webhook and skills, by design.
- If you add a `taifoonRelayerApi` credential to a hire workflow, set it as a **credential**, not an
  environment variable — `$env` access inside Code nodes should stay disabled.

## Reporting a vulnerability

Email `security@t3rn.io` with the details. Please do not open a public issue for a security report.
