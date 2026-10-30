import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { accountOperations } from './descriptions/account';
import { agentOperations } from './descriptions/agent';
import { agreementOperations } from './descriptions/agreement.generated';
import { assuranceOperations } from './descriptions/assurance';
import { catalogOperations } from './descriptions/catalog';
import { commerceOperations } from './descriptions/commerce';
import { completionOperations } from './descriptions/completion';
import { demandOperations } from './descriptions/demand';
import { discoveryOperations } from './descriptions/discovery';
import { explorerOperations } from './descriptions/explorer';
import { handshakeOperations } from './descriptions/handshake';
import { helpdeskOperations } from './descriptions/helpdesk';
import { inferenceOperations } from './descriptions/inference';
import { jobOperations } from './descriptions/job';
import { judgeOperations } from './descriptions/judge';
import { proofOperations } from './descriptions/proof';
import { resellerKeyOperations } from './descriptions/reseller.generated';
import { settlementOperations } from './descriptions/settlement';
import { templateOperations } from './descriptions/template.generated';

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
				// need it. Shown on every resource (1.1.0): the credential's Channel ID goes on every call as X-Taifoon-Channel, so a
				// sale a workflow makes pays the integrator's channel its share; the reads accept a key too.
				// Helpdesk: Ask, the Learn and Nominate writes need the tenant's key (Graph widens with it).
			},
		],
		requestDefaults: {
			baseURL: 'https://coord.taifoon.dev/v1',
			// X-Taifoon-Client lets the layer attribute node traffic; kept equal to package.json's version (a test checks it)
			headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Taifoon-Client': 'n8n-nodes-taifoon/1.2.2' },
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
					{ name: 'Agreement', value: 'agreement', description: 'What your key accepted (TSUL-1.1, TAT, TEL, VAULT-GRANT, CLA) and record an acceptance' },
					{ name: 'Assurance', value: 'assurance', description: 'Price the guarantee and build unsigned calls' },
					{ name: 'Catalog', value: 'catalog', description: 'Every agent you can hire, with its price, and the listings' },
					{ name: 'Commerce', value: 'commerce', description: 'Hire an agent, grade its answer, and plan the settlement for your own wallet to sign' },
					{ name: 'Completion', value: 'completion', description: 'Hand finished work to the relayer (needs an API key)' },
					{ name: 'Demand', value: 'demand', description: 'Say what you need; the layer matches, hires, grades and settles it' },
					{ name: 'Discovery', value: 'discovery', description: 'Verified standards deployments and the n8n capability index' },
					{ name: 'Explorer', value: 'explorer', description: 'Every job through the layer: doer, payee, grade and transactions' },
					{ name: 'Handshake', value: 'handshake', description: 'Open and follow a brokered hire' },
					{ name: 'Helpdesk', value: 'helpdesk', description: 'Show Me Around ++: ask one question about a product, answer and grade cases, nominate experts, read the graph' },
					{ name: 'Inference', value: 'inference', description: 'List the models and run one OpenAI-compatible chat completion, metered on your key' },
					{ name: 'Job', value: 'job', description: 'Poll jobs, read the ledger, create an offer' },
					{ name: 'Judge', value: 'judge', description: 'Grade work with the calibrated judge and leave the trail on chain (unsigned calls)' },
					{ name: 'Proof', value: 'proof', description: 'Prove a transaction, or check a claim against the chain' },
					{ name: 'Reseller Key', value: 'resellerKey', description: 'A key with its own spending cap for each client you build workflows for' },
					{ name: 'Settlement', value: 'settlement', description: 'Settle one paid call on the assurance hook (unsigned calls, in order)' },
					{ name: 'Template', value: 'template', description: 'Taifoon\'s own n8n templates with class and live price, and the n8n demand verdicts' },
				],
				default: 'agent',
			},
			...accountOperations,
			...agentOperations,
			...agreementOperations,
			...assuranceOperations,
			...catalogOperations,
			...completionOperations,
			...demandOperations,
			...discoveryOperations,
			...explorerOperations,
			...handshakeOperations,
			...helpdeskOperations,
			...inferenceOperations,
			...jobOperations,
			...judgeOperations,
			...proofOperations,
			...resellerKeyOperations,
			...settlementOperations,
			// 1.1.0, last so the fields Commerce re-binds are found under their own operations first
			...commerceOperations,
			...templateOperations,
		],
	};
}
