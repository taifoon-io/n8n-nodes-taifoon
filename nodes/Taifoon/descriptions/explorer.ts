import type { INodeProperties } from 'n8n-workflow';
import { show } from './shared';
import { returnAllLimit } from './paging';

/**
 * Explorer: every job that went through the layer, with the buyer, the seller that did the work (doer), the seller
 * of record the chain paid (payee), the delivery digest, the grade and every transaction with its link.
 */
export const explorerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['explorer'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get one job of the explorer',
				description: 'One job by its demand (dm_…), handshake (hs_…) or on-chain job ID (0x…): grade, money and every transaction',
				routing: { request: { method: 'GET', url: '=/explorer/jobs/{{$parameter.explorerId}}' } },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many jobs of the explorer',
				description: 'Jobs, newest first, filtered by chain, class, seller, buyer or kind',
				routing: { request: { method: 'GET', url: '/explorer/jobs' } },
			},
		],
		default: 'get',
	},
	{
		displayName: 'Job ID',
		name: 'explorerId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'dm_… | hs_… | 0x…',
		displayOptions: show('explorer', ['get']),
	},
	// /explorer/jobs pages by ?page= (1..pages), at most 100 rows a page
	...returnAllLimit('explorer', 'getAll', { root: 'rows', max: 100, by: 'page' }),
	{
		displayName: 'Filters',
		name: 'explorerFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show('explorer', ['getAll']),
		options: [
			{
				displayName: 'Buyer',
				name: 'buyer',
				type: 'options',
				options: [
					{ name: 'Ours', value: 'ours' },
					{ name: 'Outside', value: 'outside' },
					{ name: 'Unknown', value: 'unknown' },
					{ name: 'Visitor', value: 'visitor' },
				],
				default: 'outside',
				routing: { send: { type: 'query', property: 'buyer' } },
			},
			{
				displayName: 'Chain',
				name: 'chain',
				type: 'string',
				default: '',
				placeholder: '36927, 8453 or none',
				routing: { send: { type: 'query', property: 'chain', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'Class',
				name: 'class',
				type: 'string',
				default: '',
				routing: { send: { type: 'query', property: 'class', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'Seller',
				name: 'seller',
				type: 'string',
				default: '',
				description: 'Part of the seller host, endpoint or payee address (e.g. n8n)',
				routing: { send: { type: 'query', property: 'seller', value: '={{ $value || undefined }}' } },
			},
		],
	},
];
