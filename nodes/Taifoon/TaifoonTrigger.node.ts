import {
	IHookFunctions,
	IWebhookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookResponseData,
	NodeOperationError,
} from 'n8n-workflow';

export class TaifoonTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Taifoon Trigger',
		name: 'taifoonTrigger',
		icon: 'file:taifoon.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["eventType"]}}',
		description: 'Trigger workflows on cross-chain events from the Taifoon genome stream',
		defaults: { name: 'Taifoon Trigger' },
		inputs: [],
		outputs: ['main'],
		credentials: [{ name: 'taifoonApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'taifoon-webhook',
			},
		],
		properties: [
			// ═══════════════════════════════════════════════════════════════
			// EVENT TYPE SELECTOR
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Event Type',
				name: 'eventType',
				type: 'options',
				default: 'proto.fill',
				options: [
					{
						name: 'Protocol Fill',
						value: 'proto.fill',
						description: 'Cross-chain order filled by a solver',
					},
					{
						name: 'Protocol Deposit',
						value: 'proto.deposit',
						description: 'Intent deposit detected on source chain',
					},
					{
						name: 'Protocol Timeout',
						value: 'proto.timeout',
						description: 'Order timed out without fill',
					},
					{
						name: 'Whale Transfer',
						value: 'signal.whale',
						description: 'Large transfer detected (>$100k)',
					},
					{
						name: 'New Superroot',
						value: 'superroot.commit',
						description: 'New superroot sealed (every ~10s)',
					},
					{
						name: 'Block Ingested',
						value: 'block.ingest',
						description: 'New block header stored',
					},
					{
						name: 'Agent Action',
						value: 'agent.*',
						description: 'Any agent registration or action',
					},
					{
						name: 'DEX Swap',
						value: 'dex.swap',
						description: 'DEX swap detected',
					},
					{
						name: 'Finality Event',
						value: 'finality.finalize',
						description: 'Block finalized (chain-specific)',
					},
					{
						name: 'Assurance Receipt',
						value: 'settlement.sealed',
						description: 'TaifoonReceipt sealed (coming soon)',
					},
					{
						name: 'Custom Filter',
						value: 'custom',
						description: 'Define custom filter criteria',
					},
				],
				description: 'Type of genome event to trigger on',
			},

			// ═══════════════════════════════════════════════════════════════
			// FILTER OPTIONS
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Filter Chains',
				name: 'filterChains',
				type: 'multiOptions',
				default: [],
				options: [
					{ name: 'Ethereum (1)', value: 1 },
					{ name: 'Arbitrum (42161)', value: 42161 },
					{ name: 'Base (8453)', value: 8453 },
					{ name: 'Optimism (10)', value: 10 },
					{ name: 'Polygon (137)', value: 137 },
					{ name: 'BSC (56)', value: 56 },
					{ name: 'Avalanche (43114)', value: 43114 },
					{ name: 'Fantom (250)', value: 250 },
					{ name: 'Gnosis (100)', value: 100 },
					{ name: 'Linea (59144)', value: 59144 },
					{ name: 'Scroll (534352)', value: 534352 },
					{ name: 'zkSync Era (324)', value: 324 },
					{ name: 'Blast (81457)', value: 81457 },
					{ name: 'Mode (34443)', value: 34443 },
					{ name: 'Moonbeam (1284)', value: 1284 },
					{ name: 'Solana (200)', value: 200 },
				],
				description: 'Only trigger for events on these chains (empty = all chains)',
			},
			{
				displayName: 'Filter Protocols',
				name: 'filterProtocols',
				type: 'multiOptions',
				default: [],
				displayOptions: {
					show: {
						eventType: ['proto.fill', 'proto.deposit', 'proto.timeout', 'custom'],
					},
				},
				options: [
					{ name: 'Across V3', value: 'across_v3' },
					{ name: 'Relay', value: 'relay' },
					{ name: 'deBridge DLN', value: 'debridge_dln' },
					{ name: 'Stargate V2', value: 'stargate_v2' },
					{ name: 'Mayan Swift', value: 'mayan_swift' },
					{ name: 'Wormhole', value: 'wormhole' },
					{ name: 'Hyperlane', value: 'hyperlane' },
					{ name: 'LayerZero V2', value: 'layerzero_v2' },
					{ name: 'CCTP', value: 'cctp' },
					{ name: 'Hop', value: 'hop' },
					{ name: 'Socket', value: 'socket' },
					{ name: 'LiFi', value: 'lifi' },
					{ name: 'Squid', value: 'squid' },
				],
				description: 'Only trigger for events from these protocols (empty = all)',
			},
			{
				displayName: 'Minimum Volume (USD)',
				name: 'minVolume',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						eventType: ['proto.fill', 'proto.deposit', 'signal.whale', 'dex.swap', 'custom'],
					},
				},
				description: 'Only trigger for events with volume >= this amount in USD',
			},
			{
				displayName: 'Custom Filter (JSON)',
				name: 'customFilter',
				type: 'json',
				default: '{\n  "entities": ["proto"],\n  "actions": ["fill"],\n  "conditions": {}\n}',
				displayOptions: {
					show: { eventType: ['custom'] },
				},
				description: 'Advanced: custom genome filter JSON. See docs.taifoon.io/webhooks',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('taifoonApi');
				const webhookUrl = this.getNodeWebhookUrl('default');

				const baseUrl =
					credentials.environment === 'testnet'
						? 'https://testnet.api.taifoon.dev'
						: 'https://api.taifoon.dev';

				try {
					const response = await this.helpers.httpRequest({
						method: 'GET',
						url: `${baseUrl}/api/genome/webhooks`,
						headers: {
							Authorization: `Bearer ${credentials.apiKey}`,
						},
						json: true,
					});

					// Check if our webhook URL is already registered
					const webhooks = response.webhooks || [];
					return webhooks.some(
						(w: { url: string }) => w.url === webhookUrl,
					);
				} catch {
					return false;
				}
			},

			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('taifoonApi');
				const webhookUrl = this.getNodeWebhookUrl('default');
				const eventType = this.getNodeParameter('eventType') as string;
				const filterChains = this.getNodeParameter('filterChains', []) as number[];
				const filterProtocols = this.getNodeParameter('filterProtocols', []) as string[];
				const minVolume = this.getNodeParameter('minVolume', 0) as number;

				const baseUrl =
					credentials.environment === 'testnet'
						? 'https://testnet.api.taifoon.dev'
						: 'https://api.taifoon.dev';

				// Build filter from event type
				let filter: Record<string, unknown>;

				if (eventType === 'custom') {
					const customFilter = this.getNodeParameter('customFilter', '{}') as string;
					try {
						filter = JSON.parse(customFilter);
					} catch {
						throw new NodeOperationError(
							this.getNode(),
							'Invalid custom filter JSON',
						);
					}
				} else {
					const [entity, action] = eventType.split('.');
					filter = {
						entities: action === '*' ? [entity] : undefined,
						actions: action !== '*' ? [action] : undefined,
					};
				}

				// Add chain/protocol filters
				if (filterChains.length > 0) {
					filter.chains = filterChains;
				}
				if (filterProtocols.length > 0) {
					filter.protocols = filterProtocols;
				}
				if (minVolume > 0) {
					filter.conditions = { volume_usd: { gte: minVolume } };
				}

				try {
					await this.helpers.httpRequest({
						method: 'POST',
						url: `${baseUrl}/api/genome/webhooks`,
						headers: {
							Authorization: `Bearer ${credentials.apiKey}`,
							'Content-Type': 'application/json',
						},
						body: {
							url: webhookUrl,
							filter,
						},
						json: true,
					});
					return true;
				} catch (error) {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to register webhook: ${(error as Error).message}`,
					);
				}
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('taifoonApi');
				const webhookUrl = this.getNodeWebhookUrl('default');

				const baseUrl =
					credentials.environment === 'testnet'
						? 'https://testnet.api.taifoon.dev'
						: 'https://api.taifoon.dev';

				try {
					await this.helpers.httpRequest({
						method: 'DELETE',
						url: `${baseUrl}/api/genome/webhooks`,
						headers: {
							Authorization: `Bearer ${credentials.apiKey}`,
							'Content-Type': 'application/json',
						},
						body: { url: webhookUrl },
						json: true,
					});
					return true;
				} catch {
					// Webhook may have been deleted already
					return true;
				}
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const body = req.body as Record<string, unknown>;

		// Validate it looks like a Taifoon genome event
		if (!body.genome_address && !body.entity && !body.action) {
			// Not a valid Taifoon event, but return 200 to avoid retries
			return {
				workflowData: [],
			};
		}

		return {
			workflowData: [
				[
					{
						json: body,
					},
				],
			],
		};
	}
}
