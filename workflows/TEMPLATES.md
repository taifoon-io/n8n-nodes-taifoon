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
1. Activate the workflow. Put your payout address in both Code nodes' `ADDRESS` (it ships as a placeholder the claim refuses). The
   card names your own webhook URL by itself.
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

---

## 1 · Hire an on-chain agent by skill

**Nodes:** Manual Trigger, Set ×2, Code, Taifoon (Agent → Match, Assurance → Get Quote, Job → Create Offer, Handshake → Open)

Name a skill and a task. Taifoon matches the agents whose cards publish that skill, quotes the guarantee on the seller's own
record, creates the job offer on the devnet and opens the handshake. It ends with the exact calls your wallet signs to fund the
job; nothing is signed or sent from n8n.

**Set up:** a Taifoon Relayer API credential on the four Taifoon nodes, then edit **What you need** (skill, price, task).

---

## 3 · Watch the chain for completed jobs

**Nodes:** Taifoon Trigger, Taifoon (Proof → Verify Hire Claim), Set

Starts whenever a job changes, asks the chain to confirm each completed job's settlement and its payee, and reports the verdict
(REAL · FABRICATED · UNVERIFIED) beside the job. No key is needed to watch; activate the workflow.

---

## 15 · Resell Taifoon through n8n

**Nodes:** Manual Trigger, Taifoon (Account → Get Access Quote, Mint Child Key, Get Reseller View), Code

Quotes a plan for your key (the exact transfer and the message your wallet signs; you pay and claim it yourself), and reads the
margin each customer key earns you. Enable **Mint Child Key** to mint a capped key for a customer: it is shown once, and its
calls are paid from your balance at your markup.


---

## 16 · An AI answer on one key (0.001 USDC, checked before you pay)

**Category:** AI · Engineering
**Nodes:** Manual Trigger, Set, HTTP Request ×3, Code ×2, If (built-in nodes only)
**File:** `ours/16-chat-on-one-key.json` (all of Taifoon's own templates and their live runs: `ours/README.md`)

**For:** n8n builders whose workflow needs a short AI answer (a draft, a classification, a step of reasoning) without an OpenAI
account or a card on file. **Why:** one Taifoon key pays each answer at Taifoon's own price, the answer is checked before the key
is charged, and every call is one metered line on the key.

```
Input → Agreements → Terms → [Accept document] → Buy → Answer
```

**Set up (2 minutes):** get a key (`POST https://coord.taifoon.dev/v1/register`), add a **Header Auth** credential (name
`X-API-Key`, value the key), select it on the three HTTP nodes, edit **Input** and run. Read TSUL-1.1 and TAT before you set
`accept_terms` to true.

**What you get back:** the answer, the model and its token usage, and the sale (its id, what the key paid). A refusal comes back
in one shape: `{ ok: false, error: { code, status, type, sdk, retry, message, next } }`.

---

## 17 · The sha256 digest of a text, from a checked agent · 18 · Is this wallet address risky?

**Nodes:** Manual Trigger, Set, HTTP Request ×3, Code ×2, If (built-in nodes only)
**Files:** `ours/17-text-digest.json`, `ours/18-address-risk.json`

| Template | For | Price |
|---|---|---|
| 17 | builders who fingerprint documents, payloads or records and want the digest from an agent whose answer is checked by code | 0.005455 USDC |
| 18 | builders who pay out to, onboard or take funds from wallet addresses and need a risk answer first (level, score, reasons) | 0.01 USDC |

Taifoon hires the best-ranked agent behind its wall and checks the answer by code before the key is charged. When no answer
passes, the key is refunded. Jev grades the delivery afterwards. The setup is the same as for 16. The answer comes back with
its sale (id, price, the template's channel), the meter line and the loop vault.

---

## 20–22 · Taifoon × NEAR AI Cloud: the provider entry, one routed call, the daily reconcile

**Nodes:** Manual Trigger, Set, HTTP Request, Code (20) · Manual Trigger, Taifoon ×2, Code (21) · Schedule Trigger, HTTP Request ×3, Code (22)

Three workflows that say, end to end, how an inference cloud routes through Taifoon as one OpenAI-compatible provider — written for
NEAR AI Cloud's admin shape and shareable with any cloud that has one.

| Template | Who runs it | What it does |
|---|---|---|
| 20 | the cloud's engineer | builds the provider entry (`taifoon`, backend `openai_compatible`, base_url `https://coord.taifoon.dev/v1`, `TAIFOON_API_KEY`, `models`), reads the catalogue at `/v1/models` and shapes the batch for `PATCH /v1/admin/models` (NEAR's shape: `{amount, scale: 9}` per token; the registry's cost profile in micro-USD per million tokens). The PATCH node is disabled: it is the cloud's own admin call. |
| 21 | either side | one chat completion through the gate on the key, as the router makes it, and the settlement line it leaves: `actual_cost_microusd = prompt_tokens × in + completion_tokens × out` (the list price is USD per 1M tokens, so it is the same number in micro-USD per token), `evidence` = the completion id, or the sale id on the x402 door. |
| 22 | either side, daily | reads the public sale run (`api.taifoon.dev/coordination/sale-run.json`: every sale, its legs, whether they sum) and the key's standing, and writes the day's digest; the per-attempt settlement call is disabled, it is the cloud's. |

**Set up:** the cloud mints its key at `POST https://coord.taifoon.dev/v1/register`, funds it by a USDC top-up on Base (`GET /v1/access/quote`),
and puts it behind `TAIFOON_API_KEY`. Nothing in the workflows carries a key value. The guide:
https://www.taifoon.io/docs/guides/inference-cloud

---

## 23 · Work on the NEAR AI Agent Market, answering each brief through Taifoon

**Category:** AI agents · Engineering
**Nodes:** Schedule Trigger, Manual Trigger, HTTP Request ×4, Code ×3, If

An agent registered on the NEAR AI Agent Market takes its work from n8n. **Every minute** reads its assignments
(`GET market.near.ai/v1/agents/me/assignments`), keeps the briefs in progress and not yet submitted, answers each one through
Taifoon's OpenAI-compatible door (`POST https://coord.taifoon.dev/v1/chat/completions`, the brief as the prompt and nothing else)
and submits the answer as the deliverable (`POST market.near.ai/v1/assignments/{id}/submit`). The buyer accepts it, which releases
the escrow to the agent's marketplace account, or asks for changes.

**Try it first, without a NEAR key:** run **Try one brief (no NEAR key)**. A sample brief is answered through Taifoon and shown as
*The deliverable (sample, not submitted)*: nothing reaches the market.

**Set up:** two Header Auth credentials: `Authorization: Bearer tfr_…` (your Taifoon key, on the chat node) and
`Authorization: Bearer aat_…` (the agent's NEAR Agent Market token, on the two market nodes). The register node is disabled: it
creates the marketplace account and accepts its terms, so the agent's owner runs it once. Then activate the workflow.

**What you get back:** per brief the answer and the market's reply to the submission. A free key answers about 10 briefs a UTC day
from one calling address; past that, a key with a balance pays per answer.

---

## 24 · An n8n workflow sells through Taifoon (MCP Client)

**Category:** AI agents · Sales
**Nodes:** Webhook, Code, Respond to Webhook, Manual Trigger, Set, MCP Client, Schedule Trigger, No Operation

Your workflow becomes a seller on Taifoon with n8n's own **MCP Client** node: no AI Agent and no community node. The Card webhook
serves the seller's card (class `chat.word_count`, price 0.05), the Hire webhook answers the offers. **List once** claims the
listing through the coord MCP (`taifoon_op` → `POST /v1/listings/claim`), you paste the nonce into the card, **Verify listing**
runs one class probe (`POST /v1/listings/{id}/verify`), and **Register for dispatch** registers the card (`taifoon_sell`
register). **Every hour** reads the offers addressed to you (`taifoon_sell` inbox).

**Set up:** one Header Auth credential on the MCP Client nodes (name `X-API-Key`, value your Taifoon key); set `CARD_URL` and
`PAYOUT_ADDRESS` in **Seller** and `ADDRESS` in both Code nodes; enable the three listing nodes and run **List once**.

**What you get back:** the listing id and its state, the probe's verdict, and every offer with what your workflow answered. Your
share is paid by Taifoon on Base USDC to your payout address; nothing in this workflow signs or moves money.

