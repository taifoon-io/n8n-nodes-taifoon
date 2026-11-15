# Privacy

What `n8n-nodes-taifoon` sends, to whom, and what is kept. The node and its workflows are covered by Taifoon's privacy
policy, [taifoon.io/privacy](https://www.taifoon.io/privacy). This page states the part that concerns the node. Questions
and requests: info@taifoon.io. Requests are answered within 30 days.

## What the node sends

- **One destination.** Every request goes over HTTPS to `https://coord.taifoon.dev/v1`. The base URL is fixed in the node, so
  a workflow cannot send your credential to another host.
- **Only the fields you set.** Each operation sends the parameters you fill in on it: a query, a body, or both. It sends
  nothing else from your workflow, and it collects no usage data in the background.
- **Four headers.** `X-API-Key` (your key, only when a Taifoon Relayer API credential is selected), `X-Taifoon-Channel`
  (the credential's Channel ID, or `n8n` when it is empty), `X-Taifoon-Client` (the package name and version, for example
  `n8n-nodes-taifoon/2.1.0`), and the usual `Accept` / `Content-Type`.
- **The Taifoon Trigger** polls `GET /v1/jobs` with the filters you set (event, address, chain). Its cursor and the jobs it
  has already emitted are kept in the workflow's static data in your own n8n, not on Taifoon's side.

## What stays in your n8n

- Your key is stored in n8n's encrypted credential store. The node never writes it to an output, a log or a URL.
- Execution data (what each node returned) stays in your n8n, under your n8n's execution settings. Template 11 (first run)
  turns off saving successful executions, because its output shows the new keys once.

## What Taifoon keeps

- **Your key:** only its hash. Nobody can read a key back, Taifoon included (Taifoon Access Terms §1.1).
- **AI answers (Inference → Chat):** the prompt and the completion are not stored. Taifoon keeps the record of the sale: a
  SHA-256 digest of the request, the model, the token counts, the price, the sale ID and a reference to the key that paid. It
  keeps that record as long as the key's billing history, so usage can be audited and disputes settled. Prompts and
  completions are not used to train models and are not sold or shared. The request goes to the provider that serves the model
  you chose, and that provider's privacy policy covers what it does with it.
- **Completion → Submit:** the result text you map travels to Taifoon, and only its keccak-256 digest goes on chain. Send a
  `result_uri` instead of the text for anything sensitive.
- **Helpdesk:** the words of a case are kept under your tenant. Only their digest travels with the case.
- **Hosting:** Taifoon's hosting providers (Cloudflare and Vercel) keep standard request logs, such as the IP address, the path
  and the timing, under their own policies.

## What is public by design

- **Jobs and settlements.** The explorer (`GET /v1/explorer/jobs`) shows every job that went through Taifoon: who did the work,
  who was paid, and the transactions. Anything settled on a chain is public on that chain.
- **A seller's card.** If you sell a workflow, its card is served from your own webhook and read by anyone: your payout
  address, your webhook URL, the class you sell and your price. Put nothing private in it.
- **The Channel ID** is a public label, not a secret.

## When you share a workflow of your own

An n8n export carries the IDs and names of your credentials, your webhook paths and any pinned data. Before you publish a
workflow, remove them. The workflows in this package carry none of these: each credential reference has an empty ID and a
descriptive name, so n8n asks you to choose your own credential when you import it.

## Children

The node and the Taifoon API are not meant for anyone under 13.
