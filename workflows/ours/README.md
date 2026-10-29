# Taifoon's own n8n templates

One template per kind of work n8n users buy most, each **ours**: sold by Taifoon under the agentic-commerce agreement
(TSUL-1.1 + TAT), paid from one Taifoon key, every call metered on that key, the money through the loop vault
(`vault:taifoon:loop`) and every delivery graded under the assurance pool (`vault:assurance:pools`).

```
Input ─▶ Agreements ─▶ Terms ─▶ [Accept document] ─▶ Buy ─▶ Answer
          GET /v1/access/agreements      POST /v1/x402/class/<class>
                                         X-API-Key: your key (debited, refunded when nothing passes)
                                         X-Taifoon-Channel: n8n-template:<id>
```

| Template | Class | n8n kinds it serves | USDC | Verified live | Live answer |
|---|---|---|---|---|---|
| [16-chat-on-one-key](16-chat-on-one-key.json) | `inference.metered` | text.generate, chat.converse, reason.general | 0.001 | yes | 2026-10-21: 200 ok |
| [17-text-digest](17-text-digest.json) | `mcp.digest` | mcp.digest | 0.005455 | yes | 2026-10-21: 200 ok |
| [18-address-risk](18-address-risk.json) | `risk.address` | risk.address | 0.010000 | yes | 2026-10-21: 200 ok |

A template ships only after one run in a real n8n against production kept a sale; the others stay in `pending/` (not in
the npm package) with their live answer in `live.json`. Waiting for the keyed path (no template yet):

- `market.price`: the keyed path does not take keys on market.price yet: its wall answers an x402 challenge to a key; no template until a key buys it.
- `plan.steps`: the keyed path answers 409 not_metered: the meter line does not price plan.steps, so it is not sold to a key (every X-API-Key call is metered).

## Operator flows

The layer's own jobs as n8n nodes: no buy and no key debit. Each step runs the loop's own code, and the flow never signs or sends.

- [19-onboard-agent](pending/19-onboard-agent.json) (`flow:onboard-agent`): onboard an agent as a seller (its spec checked, the fix back to its owner, buyer demand, a quote, the plans unsigned). Verified live: no (pending: a dry run in a real n8n goes in live.json flows).
- [20-seller-check](pending/20-seller-check.json) (`flow:seller-check`): check a seller before you resell it (its own 402, buyer demand, Jev on its own tool, listed · recheck · held). Verified live: no (pending: a dry run in a real n8n goes in live.json flows).
- [20-agentic-commerce](pending/20-agentic-commerce.json) (`flow:agentic-commerce`): agentic commerce, strict (discover, spec check, quote, list, pay in, then every hop of the sale, OK · HELD · MISSING · BROKEN). Verified live: no (pending: a dry run in a real n8n goes in live.json flows).
- [21-pay-in](pending/21-pay-in.json) (`flow:pay-in`): pay in from any venue (your venue's own bridge to your own address, then x402 per call, into the vault). Verified live: no (pending: a dry run in a real n8n goes in live.json flows).

Rebuild: `node workflows/ours/build.mjs` (the tests check the committed files are its output).
