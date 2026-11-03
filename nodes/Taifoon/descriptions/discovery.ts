import type { INodeProperties } from 'n8n-workflow';
import { returnAllLimit } from './paging';

export const discoveryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['discovery'] } },
		options: [
			{
				name: 'Get Capabilities',
				value: 'getCapabilities',
				action: 'Get n8n capabilities',
				description: 'What n8n workflow templates and community nodes can do. Capabilities, not agents — none can be hired until someone deploys one and registers a card.',
				routing: { request: { method: 'GET', url: '/capabilities' } },
			},
			{
				name: 'Get Capability Skills',
				value: 'getCapabilitySkills',
				action: 'Get the n8n skill vocabulary',
				description: 'Per skill tag, how many templates and community nodes carry it, in the same tags Match compares',
				routing: { request: { method: 'GET', url: '/capabilities/skills' } },
			},
			{
				name: 'Get Standards',
				value: 'getStandards',
				action: 'Get verified standards deployments',
				description: 'Which standards are implemented where, and on what evidence — plus what was looked for and not found',
				routing: { request: { method: 'GET', url: '/standards' } },
			},
			{
				name: 'Search Capabilities',
				value: 'searchCapabilities',
				action: 'Search n8n capabilities',
				description: 'Search every indexed n8n template and community node by text, kind and skill. None can be hired as they are; each result carries the request that plans enrolling it.',
				routing: { request: { method: 'GET', url: '/capabilities/search' } },
			},
		],
		default: 'getStandards',
	},
	...returnAllLimit('discovery', 'searchCapabilities', { root: 'results', max: 100, by: 'offset' }),
	{
		displayName: 'Filters',
		name: 'capabilityFilters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['discovery'], operation: ['searchCapabilities'] } },
		options: [
			{
				displayName: 'Kind',
				name: 'kind',
				type: 'options',
				default: 'template',
				options: [
					{ name: 'Community Node', value: 'node' },
					{ name: 'Workflow Template', value: 'template' },
				],
				routing: { send: { type: 'query', property: 'kind' } },
			},
			{
				displayName: 'Search Text',
				name: 'q',
				type: 'string',
				default: '',
				placeholder: 'telegram support triage',
				description: 'Every word must match the name, skills, categories or description',
				routing: { send: { type: 'query', property: 'q', value: '={{ $value || undefined }}' } },
			},
			{
				displayName: 'Skill',
				name: 'skill',
				type: 'string',
				default: '',
				placeholder: 'telegram',
				description: 'An exact skill tag',
				routing: { send: { type: 'query', property: 'skill' } },
			},
		],
	},
];
