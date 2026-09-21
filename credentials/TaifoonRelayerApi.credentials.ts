import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

/**
 * Only two operations need this: submitting a completion to the relayer, and polling one. Everything
 * else in the Taifoon node is a public read and works with no credential at all.
 */
export class TaifoonRelayerApi implements ICredentialType {
	// NOT 'taifoonApi': n8n-nodes-taifoon-typesafe already declares a credential type by that name with
	// different fields (a principal key and a deck URL). Credential type names are global to an n8n
	// instance, so on a host running both packages one would shadow the other and break its node.
	name = 'taifoonRelayerApi';

	displayName = 'Taifoon Relayer API';

	icon: Icon = { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' };

	documentationUrl = 'https://www.taifoon.io/v1/openapi.json';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'A relayer key (starts with tfr_). It authorises Completion → Submit and Completion → Get Status. No other operation needs it.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: { headers: { 'X-API-Key': '={{$credentials.apiKey}}' } },
	};

	// Side-effect free, and it does not count against the key's rate limit.
	test: ICredentialTestRequest = {
		request: { baseURL: 'https://www.taifoon.io/v1', url: '/relayer/whoami' },
	};
}
