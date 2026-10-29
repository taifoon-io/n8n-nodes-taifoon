# Policies

These terms apply to calls made through `n8n-nodes-taifoon` to the Taifoon API (`coord.taifoon.dev`). They sit under the
Taifoon Access Terms and the Taifoon Sustainable Use License 1.1 ([taifoon-io/license](https://github.com/taifoon-io/license)).

## Pricing

- A paid call states its price before any payment: the API answers `402 Payment Required` with the amount, the asset and
  the network.
- The price of a resold call is the seller's price plus Taifoon's fee of 20 % of the seller's price.
- On Taifoon's class checkout, a call is charged only after its answer passed the check of its class; an answer that
  fails it is refunded. Inference is charged for the tokens a call used, at the price it stated.
- The node never signs a payment. Settlements are returned as unsigned plans for the buyer's own wallet to sign.

## Partner attribution

Integrators who run workflows for clients can register a partner channel. It is optional, and the node works the same
without one.

| | |
|---|---|
| Registration | `POST /v1/channels` with a channel ID and a payout address; `GET /v1/channels` states the terms in force |
| Attribution | the credential's optional **Channel ID**, sent as `X-Taifoon-Channel`; an empty field sends `n8n`, which is not attributed |
| Share | a share of Taifoon's fee on each attributed sale, set by Taifoon and stated by `GET /v1/channels` |
| Scope | purchases of a class through Taifoon's checkout (`POST /v1/x402/class/<class>`), paid from a key balance or by x402 |
| Payment | USDC on Base, or the network registered with the channel, to the payout address; held until one is registered |
| Not attributed | purchases by the partner itself (its own key, tenant or payout address) and Taifoon's own templates |

The buyer's price and the seller's share are the same with or without a channel.
