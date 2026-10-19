import type { IExecuteSingleFunctions, IHttpRequestOptions, INodeProperties } from 'n8n-workflow';
import { address, show } from './shared';

/** the pay chains a purchase is quoted on (GET /v1/access/quote ?chainId=; absent = Base) */
const PAY_CHAINS = [
	{ name: 'Base (8453) · USDC', value: 8453 },
	{ name: 'Arbitrum One (42161) · USDC', value: 42161 },
	{ name: 'Arc (5042) · USDC', value: 5042 },
	{ name: 'Monad (143) · USDC', value: 143 },
	{ name: 'Robinhood Chain (4663) · USDG', value: 4663 },
];

/**
 * Register Free Key tells the layer the tenant came through n8n (the tenant is recorded `via: "n8n"`). A preSend on a
 * hidden field, not an option-level routing.request.headers: extra keys on an option's routing.request are not routing
 * keys in n8n (the Stamp Grade lesson: the request lost its URL).
 */
export async function channelHeader(this: IExecuteSingleFunctions, requestOptions: IHttpRequestOptions): Promise<IHttpRequestOptions> {
	requestOptions.headers = { ...(requestOptions.headers || {}), 'X-Taifoon-Channel': 'n8n' };
	return requestOptions;
}

/**
 * Account: get a free key once, read your tenant with it, buy a plan or a balance for it (quote → the payment is sent and
 * signed by YOUR wallet → claim), resell it (mint child keys, read the margin), and list an n8n workflow as a seller (claim
 * its card, put the challenge nonce in the card, verify). Nothing here signs or sends a payment: the quote returns the exact
 * transfer and the exact message; the claim carries the transaction hash and the signature your wallet made.
 */
export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Claim Plan',
				value: 'claimPlan',
				action: 'Claim a plan payment',
				description:
					'Give the key the plan one payment bought: the transaction hash of the transfer your wallet sent and the signature it made over the quoted message (needs the credential). 404 means the transfer is not deep enough yet: run again in a few seconds.',
				routing: { request: { method: 'POST', url: '/access/plan' } },
			},
			{
				name: 'Claim Top-Up',
				value: 'claimTopUp',
				action: 'Claim a balance top up',
				description:
					'Credit the key with one paid transfer (a whole number of dollars): the transaction hash and the signature your wallet made over the quoted message (needs the credential). 100 GRID of service per dollar.',
				routing: { request: { method: 'POST', url: '/access/topup' } },
			},
			{
				name: 'Get Access Quote',
				value: 'accessQuote',
				action: 'Get an access quote',
				description:
					'What a plan (builder-99, team-199, protocol-299) or a balance of 1–500 USDC costs on a pay chain: the exact transfer to send and, with the credential, the exact message your wallet signs (it names the key that is credited). Nothing is signed or sent.',
				routing: { request: { method: 'GET', url: '/access/quote' } },
			},
			{
				name: 'Get Key Standing',
				value: 'keyStanding',
				action: 'Get the key standing',
				description: 'The standing of the key that calls: its label, scopes, caps, what it metered today and this month, its balance or plan and the days left (needs the credential). Never the key itself.',
				routing: { request: { method: 'GET', url: '/access/key' } },
			},
			{
				name: 'Get My Tenant',
				value: 'me',
				action: 'Get my tenant',
				description: 'Who the key belongs to, its keys, the next step and your own traffic (needs the credential)',
				routing: { request: { method: 'GET', url: '/tenant/me' } },
			},
			{
				name: 'Get Reseller View',
				value: 'resellerView',
				action: 'Get the reseller view',
				description:
					'Your children, their calls, what your balance paid for them at the list price, what they owe you (list + markup) and the margin (needs the credential). Every tenant is a reseller by default; a child key answers 403.',
				routing: { request: { method: 'GET', url: '/access/reseller' } },
			},
			{
				name: 'Mint Child Key',
				value: 'mintChildKey',
				action: 'Mint a child key',
				description:
					'Mint a customer of yours: a child tenant with its own live and sandbox keys, shown ONCE (needs the credential). The child is debited at the wholesale price from your balance and owes you list + markup (ledger rows only). 10 a day.',
				routing: { request: { method: 'POST', url: '/tenant/keys' } },
			},
			{
				name: 'Register Free Key',
				value: 'register',
				action: 'Register a free key',
				description:
					'Get a free key (tfr_free_…) for a wallet address. The key is shown ONCE: save it as a Taifoon Relayer API credential and do not keep it in workflow data.',
				routing: { request: { method: 'POST', url: '/register' } },
			},
			{
				name: 'Register Seller',
				value: 'registerSeller',
				action: 'Register a seller',
				description:
					'Claim your n8n seller workflow by its card URL (needs the credential). The answer carries a challenge nonce: put it in the card field taifoon_listing, then run Verify Seller.',
				routing: { request: { method: 'POST', url: '/listings/claim' } },
			},
			{
				name: 'Subscribe (Free Key + Terms)',
				value: 'subscribe',
				action: 'Subscribe in one call',
				description:
					'The keyless first call: it mints the free key (shown ONCE: save it as a Taifoon Relayer API credential) and answers the payment terms of a balance top-up for it. Run it WITHOUT a credential; with one, use Get Access Quote instead (a keyed call here answers 402 or 409). Nothing is paid here.',
				routing: { request: { method: 'POST', url: '/access/subscribe' } },
			},
			{
				name: 'Verify Seller',
				value: 'verifySeller',
				action: 'Verify a seller',
				description:
					'The layer reads the card for the nonce and probes the hire webhook for each class; on success the listing is listed (needs the key that claimed it)',
				routing: { request: { method: 'POST', url: '=/listings/{{$parameter.sellerListingId}}/verify' } },
			},
		],
		default: 'me',
	},
	{
		...address('Wallet Address', 'walletAddress', 'account', ['register'], 'The wallet this tenant is for. Nothing is signed with it.'),
		routing: { send: { type: 'body', property: 'wallet_address' } },
	},
	{
		displayName: 'Agent Label',
		name: 'agentLabel',
		type: 'string',
		default: '',
		placeholder: 'e.g. 8453:1234, or a label',
		description: 'Optional ERC-8004 "chain:ID" or a label',
		routing: { send: { type: 'body', property: 'agent_id', value: '={{ $value || undefined }}' } },
		displayOptions: show('account', ['register']),
	},
	{
		displayName: 'Channel',
		name: 'registerChannel',
		type: 'hidden',
		default: 'n8n',
		displayOptions: show('account', ['register', 'subscribe', 'mintChildKey']),
		routing: { send: { preSend: [channelHeader] } },
	},
	// ── subscribe: the free key and the terms, in one call ──
	{
		displayName: 'Create Key',
		name: 'subscribeCreateKey',
		type: 'hidden',
		default: true,
		displayOptions: show('account', ['subscribe']),
		routing: { send: { type: 'body', property: 'create_key' } },
	},
	{
		displayName: 'Top-Up (USDC)',
		name: 'subscribeUsdc',
		type: 'number',
		default: 1,
		typeOptions: { minValue: 1, maxValue: 500 },
		description: 'The balance top-up to quote for the key, in whole dollars (1 to 500); 100 GRID of service per dollar',
		displayOptions: show('account', ['subscribe']),
		routing: { send: { type: 'body', property: 'usdc' } },
	},
	{
		displayName: 'Pay Chain',
		name: 'subscribeChainId',
		type: 'options',
		options: PAY_CHAINS,
		default: 8453,
		description: 'The chain the transfer is quoted on',
		displayOptions: show('account', ['subscribe']),
		routing: { send: { type: 'body', property: 'chainId' } },
	},
	// ── the quote ──
	{
		displayName: 'Product',
		name: 'quoteProduct',
		type: 'options',
		options: [
			{ name: 'Balance (Buy GRID)', value: 'balance' },
			{ name: 'Builder Plan · 99 USDC / 30 Days', value: 'builder-99' },
			{ name: 'Team Plan · 199 USDC / 30 Days', value: 'team-199' },
			{ name: 'Protocol Plan · 299 USDC / 30 Days', value: 'protocol-299' },
		],
		default: 'builder-99',
		description: 'A monthly plan paid up front, or a balance of whole dollars',
		displayOptions: show('account', ['accessQuote']),
		routing: { send: { type: 'query', property: 'plan', value: '={{ $value === "balance" ? undefined : $value }}' } },
	},
	{
		displayName: 'Balance (USDC)',
		name: 'quoteUsdc',
		type: 'number',
		default: 10,
		typeOptions: { minValue: 1, maxValue: 500 },
		description: 'For a balance: whole dollars, 1 to 500',
		displayOptions: { show: { resource: ['account'], operation: ['accessQuote'], quoteProduct: ['balance'] } },
		routing: { send: { type: 'query', property: 'usdc' } },
	},
	{
		displayName: 'Pay Chain',
		name: 'quoteChainId',
		type: 'options',
		options: PAY_CHAINS,
		default: 8453,
		description: 'The chain the transfer is quoted on; the dollar token of that chain pays',
		displayOptions: show('account', ['accessQuote']),
		routing: { send: { type: 'query', property: 'chainId' } },
	},
	// ── the claims: the payment YOUR wallet sent and signed ──
	{
		displayName: 'Plan',
		name: 'claimPlan',
		type: 'options',
		options: [
			{ name: 'Builder Plan (Builder-99)', value: 'builder-99' },
			{ name: 'Team Plan (Team-199)', value: 'team-199' },
			{ name: 'Protocol Plan (Protocol-299)', value: 'protocol-299' },
		],
		default: 'builder-99',
		description: 'The plan the payment bought (the ID the quote named)',
		displayOptions: show('account', ['claimPlan']),
		routing: { send: { type: 'body', property: 'plan' } },
	},
	{
		displayName: 'Transaction Hash',
		name: 'claimTx',
		type: 'string',
		default: '',
		required: true,
		placeholder: '0x…',
		description: 'The hash of the transfer your wallet sent (exactly the quoted amount, from one EOA, to the quoted payee)',
		displayOptions: show('account', ['claimPlan', 'claimTopUp']),
		routing: { send: { type: 'body', property: 'tx' } },
	},
	{
		displayName: 'Signature',
		name: 'claimSignature',
		type: 'string',
		default: '',
		required: true,
		placeholder: '0x…',
		description: 'Personal_sign (EIP-191) by the wallet that sent the transfer, over the quoted message with the transaction hash filled in',
		displayOptions: show('account', ['claimPlan', 'claimTopUp']),
		routing: { send: { type: 'body', property: 'signature' } },
	},
	{
		displayName: 'Pay Chain',
		name: 'claimChainId',
		type: 'options',
		options: PAY_CHAINS,
		default: 8453,
		description: 'The chain the transfer was sent on: the one the quote was asked for (a claim on another chain answers 404 no_receipt for ever)',
		displayOptions: show('account', ['claimPlan', 'claimTopUp']),
		routing: { send: { type: 'body', property: 'chainId' } },
	},
	// ── a child key: the resold customer ──
	{
		displayName: 'Action',
		name: 'childAction',
		type: 'hidden',
		default: 'child',
		displayOptions: show('account', ['mintChildKey']),
		routing: { send: { type: 'body', property: 'action' } },
	},
	{
		displayName: 'Label',
		name: 'childLabel',
		type: 'string',
		default: '',
		placeholder: 'e.g. customer-acme',
		description: 'A label for the child (up to 60 characters)',
		displayOptions: show('account', ['mintChildKey']),
		routing: { send: { type: 'body', property: 'label', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Markup (Bps per Product)',
		name: 'childMarkupBps',
		type: 'json',
		default: '{ "*": 1000 }',
		description: 'What the child owes you above the list price, in basis points, per product ID or "*" for every product (0 up to the catalogue maximum)',
		displayOptions: show('account', ['mintChildKey']),
		routing: { send: { type: 'body', property: 'markup_bps', value: '={{ typeof $value === "string" ? JSON.parse($value) : $value }}' } },
	},
	// ── register / verify a seller ──
	{
		displayName: 'Card URL',
		name: 'cardUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'https://your-n8n.example.com/webhook/tfn-digest-card',
		description: 'The URL your seller workflow serves its card from (the Card webhook, GET)',
		displayOptions: show('account', ['registerSeller']),
		routing: { send: { type: 'body', property: 'card_url' } },
	},
	{
		// constants ride on hidden fields (an option-level routing.request.body is not a routing key)
		displayName: 'Kind',
		name: 'sellerKind',
		type: 'hidden',
		default: 'n8n',
		displayOptions: show('account', ['registerSeller']),
		routing: { send: { type: 'body', property: 'kind' } },
	},
	{
		displayName: 'Listing ID',
		name: 'sellerListingId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'ls_…',
		description: 'The listing ID Register Seller returned',
		displayOptions: show('account', ['verifySeller']),
	},
];
