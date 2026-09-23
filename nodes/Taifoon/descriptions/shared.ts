import type { INodeProperties } from 'n8n-workflow';

export const CHAINS = [
	{ name: 'Base (8453)', value: 8453 },
	{ name: 'Arc (5042)', value: 5042 },
	{ name: 'Ethereum (1)', value: 1 },
	{ name: 'Arbitrum (42161)', value: 42161 },
	{ name: 'Optimism (10)', value: 10 },
];

/** The two chains the assurance contracts are deployed on. */
export const ASSURANCE_CHAINS = [...CHAINS.slice(0, 2), { name: 'Taifoon Devnet (36927) · Free Gas', value: 36927 }];

export const show = (resource: string, operation: string[]) => ({ show: { resource: [resource], operation } });

/** A comma-separated field sent as a JSON array of trimmed, non-empty strings. */
export const csvToArray = '={{ $value.split(",").map((s) => s.trim()).filter((s) => s) }}';

export const address = (
	displayName: string,
	name: string,
	resource: string,
	operation: string[],
	description: string,
	required = true,
): INodeProperties => ({
	displayName,
	name,
	type: 'string',
	default: '',
	required,
	placeholder: '0x…',
	description: `${description} Must be a full 20-byte address; a shortened one is refused`,
	displayOptions: show(resource, operation),
});
