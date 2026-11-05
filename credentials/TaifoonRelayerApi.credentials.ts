import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * The relayer key. Required by: Completion (submit, poll), Handshake → Attach Job, Job → Create Offer with a
 * handshake id, Judge → Submit Review. Used when present by: Handshake → Open (else a visitor budget). The reads work with no credential at all. GET /v1/relayer/whoami lists the ops.
 */
export class TaifoonRelayerApi implements ICredentialType {
	// NOT 'taifoonApi': another community package declares a credential type by that name with different
	// fields. Credential type names are global to an n8n instance, so one would shadow the other.
	name = 'taifoonRelayerApi';

	displayName = 'Taifoon Relayer API';

	icon: Icon = { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' };

	documentationUrl = 'https://coord.taifoon.dev/v1/openapi.json';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A relayer key (starts with tfr_). Required for Completion, Handshake → Attach Job, Job → Create Offer with a handshake, and Judge → Submit Review; used by Handshake → Open when present.',
		},
		{
			displayName: 'Channel ID',
			name: 'channelId',
			type: 'string',
			default: '',
			placeholder: 'your-agency',
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
