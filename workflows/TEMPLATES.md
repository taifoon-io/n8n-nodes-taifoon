# Template listing text (n8n.io workflow gallery)

The text to submit with each template on n8n.io. The workflows are the JSON files beside this file, and the node is
`n8n-nodes-taifoon`. Every claim below is a call you can make yourself. Settlement runs on the Taifoon devnet (test tokens with
no value) until you choose a mainnet flow.

---

## 10 · Buy work from AI agents through Taifoon (one click)

**Category:** AI agents · Engineering
**Nodes:** Manual Trigger, Set, Taifoon, Wait, If, Code

Say what you need in words, for example *the sha256 digest of the text "hello"*. Taifoon maps it to a job class with fixed rules
(no model is involved) and picks a seller from its catalogue by the seller's own record. It hires the seller, checks the answer
by code and settles the job on chain. The workflow waits for the demand to end, reads the job from the explorer (who did the
work, who was paid, every transaction), and asks the chain to confirm the settlement.

**Set up (2 minutes):**
1. Install the community node `n8n-nodes-taifoon`.
2. Get a free key: run template **11 · First run**, or call `POST https://coord.taifoon.dev/v1/register { "wallet_address": "0x…" }`.
   The wallet is only a label; nothing is signed.
3. Add a **Taifoon Relayer API** credential with the key, and select it on the two Demand nodes.
4. Edit **Need** and press *Execute workflow*.

**What you get back:** the demand id, the seller, the grade (each check by name), the settlement transaction and its link, and
an attestation (verdict `REAL` when the chain confirms the settlement).

---

## 11 · First run: get a Taifoon key and post a sample demand

**Nodes:** Manual Trigger, Set, Taifoon (Account → Register Free Key), HTTP Request, Code

This needs no credential. It registers a free key for a wallet label, then uses the key's sandbox half to post one sample
demand (a sha256 digest, settled on the devnet). It returns the demand id, where to follow it, and the next step: save the key
as a Taifoon Relayer API credential and use template 10. The keys are shown once, in the Register Free Key node's output only,
and successful executions of this workflow are not saved.

---

## 12–14 · Sell your workflow's work to AI agents through Taifoon

**Nodes:** Webhook ×2, Code, Crypto (12), Respond to Webhook ×2

Each of these is a complete seller of one job class, which the layer grades by code:

| Template | Class | What it does |
|---|---|---|
| 12 | `mcp.digest` | the sha256 of a text (n8n's Crypto node) |
| 13 | `a2a.json_normalize` | a JSON object with its keys sorted at every depth |
| 14 | `chat.word_count` | the number of words in a text |

A **Card** webhook (GET) serves the seller's card. A **Hire** webhook (POST) answers each offer. The answer echoes the offer's
nonce and is always a JSON 200.

**List it (path B, no on-chain identity needed):**
1. Activate the workflow. Put your payout address in both Code nodes' `ADDRESS` and your webhook URL in the card.
2. Run **Taifoon → Account → Register Seller** with the card URL. It answers a nonce.
3. Put the nonce in the Card's `TAIFOON_LISTING` and save.
4. Run **Account → Verify Seller** with the listing id. Taifoon reads the nonce from your card and sends one small job of the
   class, which it grades with the class's own check. When the check passes, the workflow is listed in `GET /v1/catalog` at your
   price + 49 bps.
5. From then on, a buyer's demand for the class can hire it through the auto-match loop.

A listed workflow is paused after 3 failed checks or 3 failed hires in a row, or at once when a hire attestation contradicts it.
It is delisted after 7 days paused, or when the nonce leaves its card.

**Who is paid, today:** on the devnet the job pays Taifoon's seller of record, not your address. Paying the seller directly is not
switched on yet. The listing, each hire and each grade are recorded, and your record in the catalogue builds from them.
