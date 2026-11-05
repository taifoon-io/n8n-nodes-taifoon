import type { INodeProperties } from 'n8n-workflow';
import { jobOperations } from './job';
import { settlementOperations } from './settlement';

/**
 * Commerce: the two steps of one sale in one place, for n8n integrators and agencies. Hire (POST /v1/jobs) and Settle
 * (POST /v1/settle) are the same requests as the MCP tools taifoon_hire and taifoon_settle_plan, with the same fields as
 * Job → Create Offer and Settlement → Settle (shown again here, not copied: the fields below are those operations' own,
 * re-bound to this resource).
 *
 * Settle is a plan only: it answers the unsigned calls in order and who signs each. Nothing is signed or sent by the node;
 * the act happens in the signer's own wallet, never here.
 *
 * Every call carries the credential's Channel ID as X-Taifoon-Channel: a sale your workflow makes pays your channel its
 * share of Taifoon's fee (POST /v1/channels registers the channel and the address it is paid to).
 */
const STEPS = [
	{ from: ['job', 'createOffer'], to: 'hire' },
	{ from: ['settlement', 'settle'], to: 'settle' },
] as const;

type Show = { resource?: string[]; operation?: string[] } & Record<string, unknown>;
/** the fields of one source operation, shown under Commerce → step instead (its other displayOptions kept) */
function rebind(props: INodeProperties[], resource: string, operation: string, to: string): INodeProperties[] {
	return props
		.filter((p) => p.name !== 'operation')
		.filter((p) => {
			const s = p.displayOptions?.show as Show | undefined;
			return Boolean(s?.resource?.includes(resource) && s?.operation?.includes(operation));
		})
		.map((p) => {
			const s = p.displayOptions!.show as Show;
			return { ...p, displayOptions: { ...p.displayOptions, show: { ...s, resource: ['commerce'], operation: [to] } } };
		});
}

export const commerceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['commerce'] } },
		options: [
			{
				name: 'Hire',
				value: 'hire',
				action: 'Hire a seller',
				description: 'Create the offer for a chosen seller (POST /v1/jobs): a job ID, priced terms and the unsigned calls that fund it. Same as the MCP tool taifoon_hire. Nothing is signed or sent.',
				routing: { request: { method: 'POST', url: '/jobs' } },
			},
			{
				name: 'Settle (Plan)',
				value: 'settle',
				action: 'Plan the settlement of one paid call',
				description: 'The unsigned settlement plan of one paid call (POST /v1/settle): calls[] in order, each saying who signs. Same as the MCP tool taifoon_settle_plan. A plan only: nothing is signed or sent.',
				routing: { request: { method: 'POST', url: '/settle' } },
			},
		],
		default: 'hire',
	},
	...STEPS.flatMap(({ from: [resource, operation], to }) => {
		const all = { job: jobOperations, settlement: settlementOperations }[resource];
		return rebind(all, resource, operation, to);
	}),
];
