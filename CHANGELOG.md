# Changelog

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
