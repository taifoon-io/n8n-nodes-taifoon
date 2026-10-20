import type { INodeProperties } from 'n8n-workflow';
import { show } from './shared';

/**
 * Inference (1.0.1): the models the layer resells and one chat completion through the OpenAI-compatible gate on coord
 * (POST /v1/chat/completions, the same door n8n's OpenAI Chat Model node uses with base URL https://coord.taifoon.dev/v1).
 * Metered on the key; a free key is served within its free agreement; a reseller's child key is paid by the reseller. Every
 * refusal is the OpenAI API error object ({ error: { message, type, code } }) at the status the openai SDK maps.
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
					'One chat completion through the gate (POST /v1/chat/completions, OpenAI-compatible) with the credential, metered on the key at the list price; a free key is served within its free agreement; a child key is paid by its reseller',
				routing: { request: { method: 'POST', url: '/chat/completions' } },
			},
			{
				name: 'List Models',
				value: 'listModels',
				action: 'List the resold models',
				description: 'The models the gate serves, at the list price (GET /v1/models, OpenAI-shaped: data[])',
				routing: { request: { method: 'GET', url: '/models' } },
			},
		],
		default: 'listModels',
	},
	{
		displayName: 'Model',
		name: 'model',
		type: 'string',
		default: 'nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16',
		description: 'A model ID from List Models (the default is our own GPU)',
		displayOptions: show('inference', ['chat']),
		routing: { send: { type: 'body', property: 'model' } },
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
];
