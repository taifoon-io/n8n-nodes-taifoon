import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { accountOperations } from './descriptions/account';
import { agentOperations } from './descriptions/agent';
import { assuranceOperations } from './descriptions/assurance';
import { catalogOperations } from './descriptions/catalog';
import { completionOperations } from './descriptions/completion';
import { demandOperations } from './descriptions/demand';
import { discoveryOperations } from './descriptions/discovery';
import { explorerOperations } from './descriptions/explorer';
import { handshakeOperations } from './descriptions/handshake';
import { jobOperations } from './descriptions/job';
import { judgeOperations } from './descriptions/judge';
import { proofOperations } from './descriptions/proof';
import { settlementOperations } from './descriptions/settlement';

/**
 * The Taifoon coordination layer: find an agent, price the guarantee, fund a job, hand in the work,
 * and check what came back against the chain.
 *
 * Declarative on purpose. Every operation is a plain request to https://coord.taifoon.dev/v1, so what
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
		description: 'Hire on-chain agents and be hired by them: match, quote, fund, judge, settle, and verify against the chain',
		defaults: { name: 'Taifoon' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'taifoonRelayerApi',
				// NOT required, deliberately. Only Completion needs a key; every other operation is a
				// public read. n8n's routing engine fetches the first declared credential for EVERY
				// operation and ignores displayOptions when deciding whether to — so with
				// `required: true` a public read failed with "Credentials not found". Found by running
				// the node in n8n; the linter does not see it. Without a key, Completion is answered
				// 401 "X-API-Key header required" by the relayer itself.
				required: false,
				// Judge calls count against the key's own quota when it is present; Settlement plans need none
				// but a hire workflow carries one credential for all its keyed steps. Handshake: a key opens it on
				// the key's own budget (else the n8n host is a visitor, 5 a minute) and only that key may attach
				// its job; Job → Create Offer with a handshake id needs the key that opened it; Judge → Submit
				// Review needs it (the reviewer IS the key, bound to one owner wallet). Demand: a key posts on its own
				// counters and tenant (else the per-IP visitor budget); Account → Get My Tenant, Register Seller and Verify Seller
				// need it.
				displayOptions: { show: { resource: ['completion', 'judge', 'settlement', 'handshake', 'job', 'demand', 'account'] } },
			},
		],
		requestDefaults: {
			baseURL: 'https://coord.taifoon.dev/v1',
			// X-Taifoon-Client lets the layer attribute node traffic; kept equal to package.json's version (a test checks it)
			headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Taifoon-Client': 'n8n-nodes-taifoon/0.6.0' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account', description: 'Get a free key, read your tenant, list your workflow as a seller' },
					{ name: 'Agent', value: 'agent', description: 'Find agents, check reputation, register a card' },
					{ name: 'Assurance', value: 'assurance', description: 'Price the guarantee and build unsigned calls' },
					{ name: 'Catalog', value: 'catalog', description: 'Every hireable agent resold through the layer, priced, and the listings' },
					{ name: 'Completion', value: 'completion', description: 'Hand finished work to the relayer (needs an API key)' },
					{ name: 'Demand', value: 'demand', description: 'Say what you need; the layer matches, hires, grades and settles it' },
					{ name: 'Discovery', value: 'discovery', description: 'What the chain scanner found, and what it could not reach' },
					{ name: 'Explorer', value: 'explorer', description: 'Every job through the layer: doer, payee, grade and transactions' },
					{ name: 'Handshake', value: 'handshake', description: 'Open and follow a brokered hire' },
					{ name: 'Job', value: 'job', description: 'Poll jobs, read the ledger, create an offer' },
					{ name: 'Judge', value: 'judge', description: 'Grade work with the calibrated judge and leave the trail on chain (unsigned calls)' },
					{ name: 'Proof', value: 'proof', description: 'Prove a transaction, or check a claim against the chain' },
					{ name: 'Settlement', value: 'settlement', description: 'Settle one paid call on the assurance hook (unsigned calls, in order)' },
				],
				default: 'agent',
			},
			...accountOperations,
			...agentOperations,
			...assuranceOperations,
			...catalogOperations,
			...completionOperations,
			...demandOperations,
			...discoveryOperations,
			...explorerOperations,
			...handshakeOperations,
			...jobOperations,
			...judgeOperations,
			...proofOperations,
			...settlementOperations,
		],
	};
}
