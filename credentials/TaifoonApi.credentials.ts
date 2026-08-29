import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TaifoonApi implements ICredentialType {
	name = 'taifoonApi';
	displayName = 'Taifoon API';
	documentationUrl = 'https://docs.taifoon.io/api-keys';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Taifoon API key (starts with taif-). Get one at https://taifoon.io/console',
		},
		{
			displayName: 'Environment',
			name: 'environment',
			type: 'options',
			default: 'production',
			options: [
				{ name: 'Production', value: 'production' },
				{ name: 'Testnet', value: 'testnet' },
			],
			description: 'Which Taifoon environment to use',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.environment === "testnet" ? "https://testnet.api.taifoon.dev" : "https://api.taifoon.dev"}}',
			url: '/api/genome/stats',
		},
	};
}
