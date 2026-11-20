import type { INodeProperties } from 'n8n-workflow';
import { address, csvToArray, show } from './shared';

/**
 * Seller Listing: an n8n workflow listed the way the layer's own listing form lists an agent (POST /v1/agent-listings,
 * _AGENT_LISTING_v1_). Taifoon serves the card (GET /v1/agent-listings/{id}/card) with the claim's nonce already on it, so a
 * creator hosts no card webhook and copies no nonce: Create claims it, Publish verifies it (one class probe per class, graded by
 * the class's own check, nothing paid).
 *
 * The payee (_PAYEE_DOOR_v1_, owner rule 2026-11-14): a payout goes only to a payee its seller registered with an EIP-712
 * PayeeRegistration, signed by the payTo the listing publishes (basis payto) or by its ERC-8004 agent's owner. Get Payee
 * Registration answers the typed data; the creator's OWN wallet signs it (eth_signTypedData_v4) outside n8n; Register Payee posts
 * the signed registration. Nothing here signs, sends or spends: the node never holds a wallet key.
 *
 * The venues (_VENUE_SETTINGS_v1_): a listing is offered on every venue whose market carries its class. Get Venues reads them with
 * their price, text, payout and state; Set Venue turns one off or on again, sets its own price there, or edits the text and category
 * that venue shows. Nothing is listed, signed or paid by the call: Taifoon's keepers read the settings on their next run.
 */
const ID_OPS = ['get', 'publish', 'payeeToSign', 'registerPayee'];

export const sellerListingOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['sellerListing'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a seller listing',
				description:
					'Save your workflow as a seller listing (a draft, needs the credential). With a webhook, a class and a payTo it is claimed at once on a card Taifoon serves. The answer shows an agent token and a signing secret ONCE (Taifoon signs each hire to your webhook with the secret): keep them out of workflow data.',
				routing: { request: { method: 'POST', url: '/agent-listings' } },
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a seller listing',
				description: 'Your listing as Taifoon holds it: status (draft, live, paused), the claim, the card URL, the registered payee and the events (needs the key that created it)',
				routing: { request: { method: 'GET', url: '=/agent-listings/{{$parameter.agentListingId}}' } },
			},
			{
				name: 'Get Payee Registration',
				value: 'payeeToSign',
				action: 'Get the payee registration to sign',
				description:
					'The EIP-712 PayeeRegistration your own wallet signs next (eth_signTypedData_v4): registration, typed_data, digest and who signs. Nothing is signed, sent or spent here. A payout goes only to a payee its seller registered.',
				routing: { request: { method: 'GET', url: '=/agent-listings/{{$parameter.agentListingId}}/payee' } },
			},
			{
				name: 'Get Venues',
				value: 'getVenues',
				action: 'Get the venues of a listing',
				description:
					'Every venue your listing is offered on (each one whose market carries its class): on or off, your price there and what the buyer pays, the text and category that venue shows, where the payout goes, and its state with the next step when it is held (needs the key that holds the listing)',
				routing: { request: { method: 'GET', url: '=/listings/{{$parameter.venueListingId}}/venues' } },
			},
			{
				name: 'Publish',
				value: 'publish',
				action: 'Publish a seller listing',
				description:
					'Put the listing live: Taifoon reads its own card, sends one test job of each class to your webhook and grades it by code (nothing is paid). Live only when a test job passed; one verify per listing every 15 minutes.',
				routing: { request: { method: 'POST', url: '=/agent-listings/{{$parameter.agentListingId}}/publish' } },
			},
			{
				name: 'Register Payee',
				value: 'registerPayee',
				action: 'Register the payee',
				description:
					'Post the signed PayeeRegistration: the registration Get Payee Registration answered and the signature your wallet made over its typed data. Checked (form, expiry, the signer is the payTo or the agent\'s owner) and stored for the payout. A live listing whose payee would change must be paused first.',
				routing: { request: { method: 'POST', url: '=/agent-listings/{{$parameter.agentListingId}}/payee' } },
			},
			{
				name: 'Set Venue',
				value: 'setVenue',
				action: 'Set one venue of a listing',
				description:
					'Change one venue of your listing: turn it off or on again, set your own price there, or edit the title, description and category that venue shows. Dry Run answers what would change and writes nothing. Nothing is listed, signed or paid here (needs the key that holds the listing).',
				routing: { request: { method: 'POST', url: '=/listings/{{$parameter.venueListingId}}/venues' } },
			},
		],
		default: 'create',
	},
	{
		displayName: 'Listing ID',
		name: 'agentListingId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. al_…',
		description: 'The listing ID Create answered (al_ and 16 hex characters)',
		displayOptions: show('sellerListing', ID_OPS),
	},
	{
		displayName: 'Listing ID',
		name: 'venueListingId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. ls_…',
		description: 'The listing the venues belong to (ls_ and 16 hex characters): the claim\'s listing ID that Create answered, or the listing ID Account → Register Seller answered',
		displayOptions: show('sellerListing', ['getVenues', 'setVenue']),
	},
	{
		displayName: 'Venue',
		name: 'venueId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. x402-base',
		description: 'The venue ID, as Get Venues lists it',
		displayOptions: show('sellerListing', ['setVenue']),
		routing: { send: { type: 'body', property: 'venue' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'venueOptions',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('sellerListing', ['setVenue']),
		options: [
			{
				displayName: 'Category',
				name: 'category',
				type: 'string',
				default: '',
				placeholder: 'e.g. data',
				description: 'The category this venue shows the listing under (one the venue carries; Get Venues names the current one)',
				routing: { send: { type: 'body', property: 'category', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'The listing text this venue shows. It is checked before it is used and refused (422 copy_refused) when it breaks the listing rules.',
				routing: { send: { type: 'body', property: 'description', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'Dry Run',
				name: 'dryRun',
				type: 'boolean',
				default: false,
				description: 'Whether to answer what would change without writing it',
				routing: { send: { type: 'body', property: 'dry_run' } },
			},
			{
				displayName: 'Listed Here',
				name: 'on',
				type: 'boolean',
				default: true,
				description: 'Whether the listing is offered on this venue. Off takes it off this venue only.',
				routing: { send: { type: 'body', property: 'on' } },
			},
			{
				displayName: 'Price (USDC)',
				name: 'priceUsdc',
				type: 'string',
				default: '',
				placeholder: 'e.g. 0.05',
				description: 'Your own price per call on this venue, in USDC (above 0). Type <code>one</code> to drop it and sell at the listing\'s one price again; empty keeps the current price.',
				routing: { send: { type: 'body', property: 'price_usdc', value: '={{ /^one$/i.test(String($value).trim()) ? null : (String($value).trim() || undefined) }}' } },
			},
			{
				displayName: 'Title',
				name: 'title',
				type: 'string',
				default: '',
				description: 'The listing title this venue shows',
				routing: { send: { type: 'body', property: 'title', value: '={{ $value || undefined }}' } },
			},
		],
	},
	// ── create ──
	{
		displayName: 'Name',
		name: 'listingName',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Word counter',
		description: 'What buyers see, up to 80 characters',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'identity.name' } },
	},
	{
		displayName: 'Handle',
		name: 'listingHandle',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. my-word-counter',
		description: 'Your listing\'s permanent name: 3 to 30 lowercase letters, digits and hyphens, a letter first. It also makes the listing ID, so a second Create with the same handle answers 409 handle_taken.',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'identity.handle' } },
	},
	{
		displayName: 'Category',
		name: 'listingCategory',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. data',
		description: 'The hire category of at least one of its classes (GET /v1/classes names each class\'s category)',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'identity.category' } },
	},
	{
		displayName: 'Tagline',
		name: 'listingTagline',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Counts the words of a text',
		description: 'One sentence, up to 200 characters',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'identity.tagline' } },
	},
	{
		displayName: 'Webhook URL',
		name: 'listingWebhookUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://your-n8n.example.com/webhook/word-count',
		description: 'The production URL of your workflow\'s Webhook node (POST, public https): Taifoon sends each hire there and holds your answer',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'hosting.door.endpoint' } },
	},
	{
		displayName: 'Door Kind',
		name: 'listingDoorKind',
		type: 'options',
		default: 'n8n',
		required: true,
		options: [
			{ name: 'A2A Agent', value: 'a2a' },
			{ name: 'MCP Server', value: 'mcp' },
			{ name: 'Workflow Webhook', value: 'n8n' },
		],
		description: 'How Taifoon speaks to the URL: an n8n webhook (the offer as JSON), an MCP server or an A2A agent',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'hosting.door.kind' } },
	},
	{
		// constants ride on hidden fields (an option-level routing.request.body is not a routing key)
		displayName: 'Hosting',
		name: 'listingHosting',
		type: 'hidden',
		default: 'self_hosted',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'hosting.mode' } },
	},
	{
		displayName: 'Classes',
		name: 'listingClasses',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. chat.word_count',
		description: 'The classes your workflow does, comma-separated (GET /v1/classes lists them); each is tested by its own check before you are listed',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'pricing.classes', value: csvToArray } },
	},
	{
		displayName: 'Seller Price (USD)',
		name: 'listingPrice',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 0.05',
		description: 'What you are paid per hire, in USD with at most 6 decimals (USDC). The buyer pays your price + 20 %.',
		displayOptions: show('sellerListing', ['create']),
		routing: { send: { type: 'body', property: 'pricing.seller_price_usd', value: '={{ String($value).trim() }}' } },
	},
	{
		...address('PayTo Address', 'listingPayout', 'sellerListing', ['create'], 'The address you are paid to (a wallet or a Safe you control); the card names it as the provider. Nothing is signed with it here.'),
		routing: { send: { type: 'body', property: 'pricing.payout' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'listingOptions',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('sellerListing', ['create']),
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'What it does, up to 10,000 characters',
				routing: { send: { type: 'body', property: 'identity.description', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'SLA (Seconds)',
				name: 'slaSeconds',
				type: 'number',
				default: 3600,
				typeOptions: { minValue: 60 },
				description: 'How long a hire may take, in whole seconds (60 to 30 days)',
				routing: { send: { type: 'body', property: 'pricing.sla_seconds' } },
			},
		],
	},
	// ── the payee: what to sign, then the signed registration ──
	{
		displayName: 'Who Signs',
		name: 'payeeBasis',
		type: 'options',
		default: 'payto',
		required: true,
		options: [
			{ name: 'Your PayTo Address Signs for Itself', value: 'payto' },
			{ name: 'Your ERC-8004 Agent\'s Owner Signs', value: 'agent_owner' },
		],
		description: 'The payTo the listing publishes signs for itself (no agent needed), or the wallet that owns your ERC-8004 agent names the payee',
		displayOptions: show('sellerListing', ['payeeToSign']),
		routing: { send: { type: 'query', property: 'basis', value: '={{ $value === "payto" ? "payto" : undefined }}' } },
	},
	{
		displayName: 'Agent ID',
		name: 'payeeAgentId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 1234',
		description: 'Your agent\'s ERC-8004 ID (a decimal integer)',
		displayOptions: { show: { resource: ['sellerListing'], operation: ['payeeToSign'], payeeBasis: ['agent_owner'] } },
		routing: { send: { type: 'query', property: 'agent_id' } },
	},
	{
		displayName: 'Registration (JSON)',
		name: 'payeeRegistration',
		type: 'json',
		default: '{}',
		required: true,
		description: 'The registration object Get Payee Registration answered (the agent ID, payee, nonce, valid_until and, for a payTo, basis), unchanged: the signature covers exactly these values',
		displayOptions: show('sellerListing', ['registerPayee']),
		routing: {
			send: {
				type: 'body',
				property: 'registration',
				// the whole answer pasted instead of its registration is taken too; the signature rides inside it as `sig`
				value: '={{ Object.assign({}, ((v) => (v && v.registration) || v)(typeof $value === "string" ? JSON.parse($value || "{}") : $value), { sig: $parameter.payeeSignature }) }}',
			},
		},
	},
	{
		displayName: 'Signature',
		name: 'payeeSignature',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. 0x…',
		description: 'The eth_signTypedData_v4 signature your own wallet made over typed_data (65 bytes, 0x and 130 hex characters)',
		displayOptions: show('sellerListing', ['registerPayee']),
	},
];
