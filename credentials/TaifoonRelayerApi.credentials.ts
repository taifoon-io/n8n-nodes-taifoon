import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * The relayer key. Required by: Completion (submit, poll), Handshake → Attach Job, Job → Create Offer with a
 * handshake id, Judge → Submit Review. Used when present by: Handshake → Open (else a visitor budget) and the judge
 * calls (else the free calls). The reads work with no credential at all. GET /v1/relayer/whoami lists the ops.
 */
export class TaifoonRelayerApi implements ICredentialType {
	// NOT 'taifoonApi': n8n-nodes-taifoon-typesafe already declares a credential type by that name with
	// different fields (a principal key and a deck URL). Credential type names are global to an n8n
	// instance, so on a host running both packages one would shadow the other and break its node.
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
				'A relayer key (starts with tfr_). Required for Completion, Handshake → Attach Job, Job → Create Offer with a handshake, and Judge → Submit Review; used by Handshake → Open and the judge calls when present.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
	};

	// Side-effect free, and it does not count against the key's rate limit.
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://coord.taifoon.dev/v1', url: '/relayer/whoami' },
	};
}
