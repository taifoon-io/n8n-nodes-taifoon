# n8n-nodes-taifoon

Cross-chain intelligence, proofs, and assurance receipts for n8n workflows.

## What is Taifoon?

[Taifoon](https://taifoon.io) is the cross-chain data availability layer. It provides:

- **61 chains** indexed in real-time with finality proofs
- **25 protocols** decoded (Across, Relay, Stargate, Mayan, etc.)
- **V5 proofs** for on-chain verification of any block or transaction
- **Genome stream** — a unified event bus for all cross-chain activity
- **Assurance layer** — settlement receipts with 14 terminal outcomes

## Nodes

### Taifoon (Action Node)

Query cross-chain intelligence and generate proofs.

**Resources:**

| Resource | Operations |
|----------|------------|
| **Intel** | Get Overview, Get Solvers, Get Protocol Health, Compare Routes, Get Fill Rates |
| **Proof** | Estimate Cost, Generate Block Proof, Generate TX Proof, Get Superroot |
| **Agent** | Query (natural language), Get Quote, Get Health |
| **Genome** | Get Stats, Get Latest, Query Stream |
| **Assurance** | Get Receipt, Verify Receipt |

### Taifoon Trigger

Trigger workflows on cross-chain events.

**Event Types:**

| Event | Description |
|-------|-------------|
| `proto.fill` | Cross-chain order filled by a solver |
| `proto.deposit` | Intent deposit detected on source chain |
| `proto.timeout` | Order timed out without fill |
| `signal.whale` | Large transfer detected (>$100k) |
| `superroot.commit` | New superroot sealed (~10s interval) |
| `block.ingest` | New block header stored |
| `dex.swap` | DEX swap detected |
| `settlement.sealed` | TaifoonReceipt sealed (assurance) |

**Filters:**

- Filter by chains (Ethereum, Arbitrum, Base, etc.)
- Filter by protocols (Across, Relay, Stargate, etc.)
- Filter by minimum volume (USD)
- Custom JSON filter for advanced use cases

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-taifoon`
4. Click **Install**

### Manual Installation

```bash
pnpm install n8n-nodes-taifoon
```

## Credentials

1. Sign up at [taifoon.io/console](https://taifoon.io/console)
2. Generate an API key (starts with `taif-`)
3. In n8n, create a new **Taifoon API** credential
4. Paste your API key

## Example Workflows

### Alert on Whale Transfers

```
Taifoon Trigger (signal.whale, min $500k)
  → Slack (Send message)
```

### Generate Proof for Settlement

```
Webhook (receive tx hash)
  → Taifoon (Proof: Generate TX Proof)
  → HTTP Request (submit to contract)
```

### Cross-Chain Route Recommendation

```
Schedule (every hour)
  → Taifoon (Agent: Query "best ETH→ARB route")
  → Google Sheets (append row)
```

### Protocol Health Monitoring

```
Schedule (every 5 min)
  → Taifoon (Intel: Get Protocol Health)
  → IF (fill_rate < 0.8)
    → Email (alert)
```

## Pricing

Taifoon uses a credit-based pricing model:

| Tier | Price | Credits/month | Webhooks |
|------|-------|---------------|----------|
| Explorer | Free | 50 | 5/day |
| Builder | $49/mo | 5,000 | 100 |
| Solver | $299/mo | 50,000 | Unlimited |

See [taifoon.io/pricing](https://taifoon.io/pricing) for details.

## Documentation

- [API Reference](https://docs.taifoon.io/api)
- [Webhook Guide](https://docs.taifoon.io/webhooks)
- [Proof System](https://docs.taifoon.io/proofs)
- [Assurance Layer](https://docs.taifoon.io/assurance)

## Support

- [Discord](https://discord.gg/taifoon)
- [GitHub Issues](https://github.com/taifoon-io/n8n-nodes-taifoon/issues)
- [Email](mailto:support@taifoon.io)

## License

MIT
