import type { IExecuteSingleFunctions, IHttpRequestOptions, INodeProperties } from 'n8n-workflow';
import { address, show } from './shared';

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
 * Account: get a free key once, read your tenant with it, and list an n8n workflow as a seller (claim its card, put the
 * challenge nonce in the card, verify).
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
				name: 'Get My Tenant',
				value: 'me',
				action: 'Get my tenant',
				description: 'Who the key belongs to, its keys, the next step and your own traffic (needs the credential)',
				routing: { request: { method: 'GET', url: '/tenant/me' } },
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
		displayOptions: show('account', ['register']),
		routing: { send: { preSend: [channelHeader] } },
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
