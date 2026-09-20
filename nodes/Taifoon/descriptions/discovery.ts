import type { INodeProperties } from 'n8n-workflow';

export const discoveryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['discovery'] } },
		options: [
			{
				name: 'Get Candidates',
				value: 'getCandidates',
				action: 'Get candidate contracts',
				description: 'Contracts seen emitting a standard\'s events that are not in the curated map yet. Evidence to check, never a verified deployment.',
				routing: { request: { method: 'GET', url: '/harvest', qs: { view: 'candidates' } } },
			},
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
				name: 'Get Coverage',
				value: 'getCoverage',
				action: 'Get scan coverage',
				description: 'Which chains were scanned and which were not, each with its reason',
				routing: { request: { method: 'GET', url: '/harvest', qs: { view: 'coverage' } } },
			},
			{
				name: 'Get Scan',
				value: 'getScan',
				action: 'Get the scan summary',
				description: 'Protocols, agents and jobs harvested from chain. Agents whose card could not be read are counted with the reason, not dropped.',
				routing: { request: { method: 'GET', url: '/harvest' } },
			},
			{
				name: 'Get Standards',
				value: 'getStandards',
				action: 'Get verified standards deployments',
				description: 'Which standards are implemented where, and on what evidence — plus what was looked for and not found',
				routing: { request: { method: 'GET', url: '/standards' } },
			},
		],
		default: 'getScan',
	},
];
