import type { INodeProperties } from 'n8n-workflow';
import { show, address } from './shared';

export const completionOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['completion'] } },
		options: [
			{
				name: 'Get Status',
				value: 'getStatus',
				action: 'Get the status of a completion',
				description: 'Poll a submitted completion until it is settled',
				routing: { request: { method: 'GET', url: '=/jobs/{{$parameter.jobId}}/complete' } },
			},
			{
				name: 'Submit',
				value: 'submit',
				action: 'Submit a completed job',
				description:
					'Hand a finished job to the relayer. The proof is re-verified server-side and the call is idempotent on Job ID + Nonce.',
				routing: {
					request: {
						method: 'POST',
						url: '=/jobs/{{$parameter.jobId}}/complete',
						// The body repeats the Job ID; the relayer refuses a body that disagrees with the path.
						body: { jobId: '={{$parameter.jobId}}' },
					},
				},
			},
		],
		default: 'submit',
	},
	{
		displayName: 'Job ID',
		name: 'jobId',
		type: 'string',
		default: '',
		required: true,
		placeholder: '80926 or 0x…',
		description: 'A decimal job ID, or a 0x-prefixed 32-byte value',
		displayOptions: show('completion', ['submit', 'getStatus']),
	},
	{
		displayName: 'Nonce',
		name: 'nonce',
		type: 'string',
		default: '',
		required: true,
		description:
			'Half of the idempotency key. Echo the nonce from the hire webhook. Submitting the same Job ID + Nonce again returns the original outcome and never sends a second transaction.',
		displayOptions: show('completion', ['submit']),
		routing: { send: { type: 'body', property: 'nonce' } },
	},
	{
		displayName: 'Nonce',
		name: 'statusNonce',
		type: 'string',
		default: '',
		required: true,
		description: 'The nonce the completion was submitted with',
		displayOptions: show('completion', ['getStatus']),
		routing: { send: { type: 'query', property: 'nonce' } },
	},
	{
		displayName: 'Chain ID',
		name: 'chain',
		type: 'string',
		default: '8453',
		required: true,
		description: 'Decimal chain ID, as a string',
		displayOptions: show('completion', ['submit']),
		routing: { send: { type: 'body', property: 'chain' } },
	},
	{
		...address('Provider', 'provider', 'completion', ['submit'], 'The agent that did the work. It must be the seller of the job on chain.'),
		routing: { send: { type: 'body', property: 'provider' } },
	},
	{
		displayName: 'Result',
		name: 'result',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		description:
			'The work product, up to 100,000 characters. Only its keccak-256 digest goes on chain. Send a Result URI instead for anything larger.',
		displayOptions: show('completion', ['submit']),
		routing: { send: { type: 'body', property: 'result', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Result URI',
		name: 'result_uri',
		type: 'string',
		default: '',
		placeholder: 'ipfs://… or https://…',
		description: 'Where the result lives, when it is too large to send inline. One of Result or Result URI is required.',
		displayOptions: show('completion', ['submit']),
		routing: { send: { type: 'body', property: 'result_uri', value: '={{ $value || undefined }}' } },
	},
	{
		displayName: 'Proof Transaction Hash',
		name: 'proofTx',
		type: 'string',
		default: '',
		required: true,
		placeholder: '0x… (66 characters)',
		description:
			'The transaction whose inclusion proves the job. It is required, and it is re-verified against the chain before anything is recorded. A shortened hash such as 0xd59d…8b47 is refused.',
		displayOptions: show('completion', ['submit']),
		routing: { send: { type: 'body', property: 'proof.tx' } },
	},
];
