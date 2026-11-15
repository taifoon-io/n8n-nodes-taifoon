# Policies

Pricing, the terms for selling a workflow through Taifoon, and partner attribution. These terms apply to calls made through `n8n-nodes-taifoon` to the Taifoon API (`coord.taifoon.dev`). They sit under the
Taifoon Access Terms and the Taifoon Sustainable Use License 1.1 ([taifoon-io/license](https://github.com/taifoon-io/license)).

## Pricing

- A paid call states its price before any payment: the API answers `402 Payment Required` with the amount, the asset and
  the network.
- The price of a resold call is the seller's price plus Taifoon's fee, which is at least 20 % of the seller's price. The
  exact price is in the `402` answer and in the catalogue (`GET /v1/catalog`) before anything is paid.
- On Taifoon's class checkout, a call is charged only after its answer passed the check of its class; an answer that
  fails it is refunded. Inference is charged for the tokens a call used, at the price it stated.
- The node never signs a payment. Settlements are returned as unsigned plans for the buyer's own wallet to sign.

## Selling a workflow through Taifoon

These terms apply when you list an n8n workflow as a seller with **Account → Register Seller** (`POST /v1/listings/claim`)
and **Account → Verify Seller** (`POST /v1/listings/{id}/verify`), as templates 12, 13, 14 and 24 do.

| | |
|---|---|
| What you sell | one class of work that Taifoon checks by code. From n8n today: `mcp.digest`, `a2a.json_normalize`, `chat.word_count`, `typed.compile` |
| Your price | the `price_usdc` on your card. You are paid your own price; Taifoon charges you no fee and n8n takes none |
| The buyer's price | your price plus Taifoon's fee, at least 20 % of your price, stated to the buyer before it pays |
| Seller of record | Taifoon sells to the buyer under the terms below; you sell to Taifoon at your price |
| Listing | your card carries the nonce `Register Seller` answers; `Verify Seller` sends one small job of each class and lists you when its check passes. Probes are free (one per listing every 15 minutes) |
| When you are paid | after a buyer's payment has been received and your answer passed the class's check. An answer that fails it is not paid, and the buyer is refunded |
| How you are paid | USDC on Base, from Taifoon's vault, to the payout address of your listing. A payout goes only to a payout address confirmed for the listing by a signed payee registration; until then your share stays owed to you. A wallet that fails sanctions screening gets no payout |
| Devnet jobs | jobs settled on the Taifoon devnet (chain 36927, test tokens with no value) carry no payout |
| Pausing and delisting | paused after 3 failed checks or 3 failed hires in a row, or at once when a hire's attestation contradicts it; delisted after 7 days paused. To stop selling, remove `taifoon_listing` from your card |
| What stays yours | your workflow and its code. Taifoon resells calls to it and never receives the workflow |
| What is public | your card (payout address, webhook URL, class, price) and the jobs you deliver ([`PRIVACY.md`](PRIVACY.md)) |

Nothing in the node or the templates signs a transaction or moves money from your wallet.

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

## The terms behind these

The Taifoon Access Terms 1.0 and the Taifoon Sustainable Use License 1.1 ([taifoon-io/license](https://github.com/taifoon-io/license)),
offered by Interop FZCA, Dubai, United Arab Emirates. You accept them when you mint a key (Account → Register Free Key or
`POST /v1/register`), and **Agreement → List Agreements** shows what your key has accepted. The node and its workflows are
MIT ([`LICENSE`](LICENSE)); your own n8n instance stays under n8n's terms. Privacy: [`PRIVACY.md`](PRIVACY.md). Contact:
info@taifoon.io.
