import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * The Taifoon key (tfr_…). Needed by the operations that act on your account: Inference → Chat, Completion, Account → Get My
 * Tenant, Register Seller and Verify Seller, Handshake → Attach Job, Job → Create Offer with a handshake ID, Job Review →
 * Submit Review, Helpdesk → Ask and its writes, Reseller Key and Template → Get Demand. Used when present by Demand and Handshake → Open (else the
 * calling address's visitor budget). Public reads work without it. How to get one and what it sends: README.md#credentials.
 */
export class TaifoonRelayerApi implements ICredentialType {
	// NOT 'taifoonApi': another community package declares a credential type by that name with different
	// fields. Credential type names are global to an n8n instance, so one would shadow the other.
	name = 'taifoonRelayerApi';

	displayName = 'Taifoon Relayer API';

	icon: Icon = { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' };

	documentationUrl = 'https://github.com/taifoon-io/n8n-nodes-taifoon#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Taifoon key (starts with tfr_). Get one free with Account → Register Free Key or POST https://coord.taifoon.dev/v1/register. Needed for Inference → Chat, Completion, Account → Get My Tenant / Register Seller / Verify Seller and Job Review → Submit Review; public reads work without it.',
		},
		{
			displayName: 'Channel ID',
			name: 'channelId',
			type: 'string',
			default: '',
			placeholder: 'e.g. your-agency',
			description:
				'Optional; leave it empty. Sent as X-Taifoon-Channel, only for a channel registered with Taifoon (POLICY.md). Lower-case letters, digits and : . _ - (at most 64).',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}', 'X-Taifoon-Channel': '={{$credentials.channelId || "n8n"}}' } },
	};

	// Side-effect free, and it does not count against the key's rate limit.
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://coord.taifoon.dev/v1', url: '/relayer/whoami' },
	};
}
