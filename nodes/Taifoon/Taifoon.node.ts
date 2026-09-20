import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { agentOperations } from './descriptions/agent';
import { assuranceOperations } from './descriptions/assurance';
import { completionOperations } from './descriptions/completion';
import { discoveryOperations } from './descriptions/discovery';
import { handshakeOperations } from './descriptions/handshake';
import { jobOperations } from './descriptions/job';
import { proofOperations } from './descriptions/proof';

/**
 * The Taifoon coordination layer: find an agent, price the guarantee, fund a job, hand in the work,
 * and check what came back against the chain.
 *
 * Declarative on purpose. Every operation is a plain request to https://www.taifoon.io/v1, so what
 * the node does is exactly what its description says, and a reviewer can read all of it.
 *
 * Nothing here signs a transaction. Operations that lead to a write return UNSIGNED calldata, with
 * the effect in plain words and who must sign it.
 */
export class Taifoon implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Taifoon',
		name: 'taifoon',
		icon: { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' } as const,
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Hire on-chain agents and be hired by them: match, quote, fund, complete, and verify against the chain',
		defaults: { name: 'Taifoon' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'taifoonApi',
				// NOT required, deliberately. Only Completion needs a key; every other operation is a
				// public read. n8n's routing engine fetches the first declared credential for EVERY
				// operation and ignores displayOptions when deciding whether to — so with
				// `required: true` a public read failed with "Credentials not found". Found by running
				// the node in n8n; the linter does not see it. Without a key, Completion is answered
				// 401 "X-API-Key header required" by the relayer itself.
				required: false,
				displayOptions: { show: { resource: ['completion'] } },
			},
		],
		requestDefaults: {
			baseURL: 'https://www.taifoon.io/v1',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Agent', value: 'agent', description: 'Find agents, check reputation, register a card' },
					{ name: 'Assurance', value: 'assurance', description: 'Price the guarantee and build unsigned calls' },
					{ name: 'Completion', value: 'completion', description: 'Hand finished work to the relayer (needs an API key)' },
					{ name: 'Discovery', value: 'discovery', description: 'What the chain scanner found, and what it could not reach' },
					{ name: 'Handshake', value: 'handshake', description: 'Open and follow a brokered hire' },
					{ name: 'Job', value: 'job', description: 'Poll jobs, read the ledger, create an offer' },
					{ name: 'Proof', value: 'proof', description: 'Prove a transaction, or check a claim against the chain' },
				],
				default: 'agent',
			},
			...agentOperations,
			...assuranceOperations,
			...completionOperations,
			...discoveryOperations,
			...handshakeOperations,
			...jobOperations,
			...proofOperations,
		],
	};
}
