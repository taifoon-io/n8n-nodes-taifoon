# n8n-nodes-taifoon

Cross-chain intelligence, proofs, and receipts for n8n workflows.

## What is Taifoon?

[Taifoon](https://taifoon.io) is the cross-chain data availability layer:

- **61 chains** indexed in real-time with finality proofs
- **25 protocols** decoded (Across, Relay, Stargate, Mayan, etc.)
- **V5 proofs** for on-chain verification of any block or transaction
- **Genome stream** — unified event bus for all cross-chain activity

## Node Operations

### Intel

| Operation | Description |
|-----------|-------------|
| Get Overview | Dashboard summary: chains, protocols, orders |
| Get Solvers | Solver leaderboard with fill stats |
| Get Protocol Health | Protocol ICP profile and metrics |
| Compare Routes | Compare protocols for a route |
| Get Fill Rates | Per-protocol fill rate summary |
| Get Live Stats | Per-protocol-per-chain 24h stats |

### Proof

| Operation | Description |
|-----------|-------------|
| Estimate Cost | Get proof pricing for a chain |
| Generate Block Proof | V5 proof blob for a block |
| Generate TX Proof | V5 proof for a transaction hash |
| Get Superroot | Current superroot hash and chain count |

### Agent

| Operation | Description |
|-----------|-------------|
| Query | Natural language question about cross-chain |
| Get Quote | Cross-chain route quote with recommendations |
| Get Health | Agent service health status |

### Genome

| Operation | Description |
|-----------|-------------|
| Get Stats | Genome system statistics |
| Get Latest | Recent genome entries |
| Query Stream | Filter genome stream by criteria |

## Installation

### Community Nodes (Recommended)

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-taifoon`
4. Click **Install**

### Manual

```bash
npm install n8n-nodes-taifoon
```

## Credentials

1. Sign up at [taifoon.io/console](https://taifoon.io/console)
2. Generate an API key (starts with `taif-`)
3. In n8n, create a new **Taifoon API** credential
4. Paste your API key

## Example Workflows

### Cross-Chain Route Recommendation

```
Schedule (every hour)
  → Taifoon (Agent: Query "best ETH→ARB route")
  → Google Sheets (append row)
```

### Protocol Health Monitoring

```
Schedule (every 5 min)
  → Taifoon (Intel: Get Fill Rates)
  → IF (fill_rate < 0.8)
    → Slack (alert)
```

### Generate Proof for Settlement

```
Webhook (receive tx hash)
  → Taifoon (Proof: Generate TX Proof)
  → HTTP Request (submit to contract)
```

### Whale Alert

```
Schedule (every minute)
  → Taifoon (Genome: Get Latest, limit 50)
  → IF (volume_usd > 500000)
    → Telegram (send message)
```

## Pricing

| Tier | Price | Credits/month |
|------|-------|---------------|
| Explorer | Free | 50 |
| Builder | $49/mo | 5,000 |
| Solver | $299/mo | 50,000 |

See [taifoon.io/pricing](https://taifoon.io/pricing)

## Links

- [API Docs](https://docs.taifoon.io/api)
- [Discord](https://discord.gg/taifoon)
- [GitHub](https://github.com/taifoon-io/n8n-nodes-taifoon)

## License

MIT
