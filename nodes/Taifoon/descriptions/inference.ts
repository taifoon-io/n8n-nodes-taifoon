import type { INodeProperties } from 'n8n-workflow';
import { show } from './shared';

/**
 * Inference (0.9.0): the models the layer resells and one chat call on the GPU gate, metered on the key. The gate is
 * api.taifoon.dev (a baseURL of its own): POST /gpu/{model}/chat with X-API-Key; a key with no bought plan and no balance
 * is served within its free agreement (0.10 USDC of metered use a UTC day); a reseller's child key is paid by the reseller.
 * No streaming here: the OpenAI-compatible streamed door is the coord task web-inference-gate-m4 (then n8n's own chat model node).
 */
export const inferenceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['inference'] } },
		options: [
			{
				name: 'Chat',
				value: 'chat',
				action: 'Run a chat completion',
				description:
					'One chat completion on the GPU gate (api.taifoon.dev/gpu/{model}/chat) with the credential: metered on the key at the catalogue price (0.02 USDC per 1M tokens spot, 0.04 reserved); a key with nothing holds the free agreement; a child key is paid by its reseller',
				routing: { request: { method: 'POST', baseURL: 'https://api.taifoon.dev', url: '=/gpu/{{$parameter.model}}/chat' } },
			},
			{
				name: 'List Models',
				value: 'listModels',
				action: 'List the resold models',
				description: 'The models the layer resells at the list price (GET /v1/models; the GPU gate’s lanes at GET api.taifoon.dev/gpu/pricing). Empty until the gate lists them (coord task web-inference-gate-m4).',
				routing: { request: { method: 'GET', url: '/models' } },
			},
		],
		default: 'listModels',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		default: 'llama-3.1-8b',
		required: true,
		description: 'The model class the gate serves (llama-3.1-8b is the 8B class: nvidia Nemotron-3-Nano-4B on the reserved and spot lanes)',
		displayOptions: show('inference', ['chat']),
	},
	{
		displayName: 'Messages',
		name: 'messages',
		type: 'json',
		default: '[{ "role": "user", "content": "Say hello in five words." }]',
		required: true,
		description: 'The OpenAI-shaped messages array',
		displayOptions: show('inference', ['chat']),
		routing: { send: { type: 'body', property: 'messages', value: '={{ typeof $value === "string" ? JSON.parse($value) : $value }}' } },
	},
	{
		displayName: 'Max Tokens',
		name: 'maxTokens',
		type: 'number',
		default: 256,
		typeOptions: { minValue: 1, maxValue: 8192 },
		description: 'The most output tokens the gate holds for (the hold is released to what was used)',
		displayOptions: show('inference', ['chat']),
		routing: { send: { type: 'body', property: 'max_tokens' } },
	},
	{
		displayName: 'Lane',
		name: 'tier',
		type: 'options',
		options: [
			{ name: 'Spot (0.02 USDC / 1M Tokens)', value: 'spot' },
			{ name: 'Reserved (0.04 USDC / 1M Tokens)', value: 'reserved' },
		],
		default: 'spot',
		description: 'The lane the call is priced on',
		displayOptions: show('inference', ['chat']),
		routing: { send: { type: 'query', property: 'tier' } },
	},
];
