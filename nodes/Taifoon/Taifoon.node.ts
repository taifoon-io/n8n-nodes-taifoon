import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class Taifoon implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Taifoon',
		name: 'taifoon',
		icon: 'file:taifoon.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Cross-chain intelligence, proofs, and assurance receipts',
		defaults: { name: 'Taifoon' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'taifoonApi', required: true }],
		requestDefaults: {
			headers: {
				'Content-Type': 'application/json',
			},
		},
		properties: [
			// ═══════════════════════════════════════════════════════════════
			// RESOURCE SELECTOR
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				default: 'intel',
				options: [
					{
						name: 'Intel',
						value: 'intel',
						description: 'Cross-chain intelligence and analytics',
					},
					{
						name: 'Proof',
						value: 'proof',
						description: 'V5 proof generation and verification',
					},
					{
						name: 'Agent',
						value: 'agent',
						description: 'AI agent queries and explanations',
					},
					{
						name: 'Genome',
						value: 'genome',
						description: 'On-chain event stream and statistics',
					},
					{
						name: 'Assurance',
						value: 'assurance',
						description: 'Job receipts and settlement (coming soon)',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// INTEL OPERATIONS
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['intel'] } },
				default: 'getOverview',
				options: [
					{
						name: 'Get Overview',
						value: 'getOverview',
						description: 'Dashboard summary: chains, protocols, orders',
						action: 'Get intel overview',
					},
					{
						name: 'Get Solvers',
						value: 'getSolvers',
						description: 'Solver leaderboard with fill stats',
						action: 'Get solver leaderboard',
					},
					{
						name: 'Get Protocol Health',
						value: 'getProtocolHealth',
						description: 'Protocol ICP profile and health',
						action: 'Get protocol health',
					},
					{
						name: 'Compare Routes',
						value: 'compareRoutes',
						description: 'Compare protocols for a route',
						action: 'Compare routes',
					},
					{
						name: 'Get Fill Rates',
						value: 'getFillRates',
						description: 'Per-protocol fill rate summary',
						action: 'Get fill rates',
					},
					{
						name: 'Get Live Stats',
						value: 'getLiveStats',
						description: 'Per-protocol-per-chain 24h stats',
						action: 'Get live stats',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// PROOF OPERATIONS
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['proof'] } },
				default: 'estimateCost',
				options: [
					{
						name: 'Estimate Cost',
						value: 'estimateCost',
						description: 'Get proof pricing for a chain',
						action: 'Estimate proof cost',
					},
					{
						name: 'Generate Block Proof',
						value: 'generateBlockProof',
						description: 'V5 proof blob for a block',
						action: 'Generate block proof',
					},
					{
						name: 'Generate TX Proof',
						value: 'generateTxProof',
						description: 'V5 proof for a transaction hash',
						action: 'Generate transaction proof',
					},
					{
						name: 'Get Superroot',
						value: 'getSuperroot',
						description: 'Current superroot hash and chain count',
						action: 'Get superroot',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// AGENT OPERATIONS
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['agent'] } },
				default: 'query',
				options: [
					{
						name: 'Query',
						value: 'query',
						description: 'Natural language question about cross-chain',
						action: 'Query agent',
					},
					{
						name: 'Get Quote',
						value: 'getQuote',
						description: 'Cross-chain route quote with recommendations',
						action: 'Get route quote',
					},
					{
						name: 'Get Health',
						value: 'getHealth',
						description: 'Agent service health status',
						action: 'Get agent health',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// GENOME OPERATIONS
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['genome'] } },
				default: 'getStats',
				options: [
					{
						name: 'Get Stats',
						value: 'getStats',
						description: 'Genome system statistics',
						action: 'Get genome stats',
					},
					{
						name: 'Get Latest',
						value: 'getLatest',
						description: 'Recent genome entries',
						action: 'Get latest genome entries',
					},
					{
						name: 'Query Stream',
						value: 'queryStream',
						description: 'Filter genome stream by criteria',
						action: 'Query genome stream',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// ASSURANCE OPERATIONS (COMING SOON)
			// ═══════════════════════════════════════════════════════════════
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['assurance'] } },
				default: 'getReceipt',
				options: [
					{
						name: 'Get Receipt',
						value: 'getReceipt',
						description: 'Fetch TaifoonReceipt by job ID',
						action: 'Get assurance receipt',
					},
					{
						name: 'Verify Receipt',
						value: 'verifyReceipt',
						description: 'Verify receipt against superroot',
						action: 'Verify receipt',
					},
				],
			},

			// ═══════════════════════════════════════════════════════════════
			// SHARED PARAMETERS
			// ═══════════════════════════════════════════════════════════════

			// Chain ID (for proof operations)
			{
				displayName: 'Chain ID',
				name: 'chainId',
				type: 'options',
				default: 1,
				displayOptions: {
					show: {
						resource: ['proof'],
						operation: ['estimateCost', 'generateBlockProof', 'generateTxProof'],
					},
				},
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
					{ name: 'Bitcoin (21000000)', value: 21000000 },
				],
				description: 'Blockchain network to generate proof for',
			},

			// Block number
			{
				displayName: 'Block Number',
				name: 'blockNumber',
				type: 'number',
				default: 0,
				displayOptions: {
					show: {
						resource: ['proof'],
						operation: ['generateBlockProof'],
					},
				},
				description: 'Block number to generate proof for',
			},

			// Transaction hash
			{
				displayName: 'Transaction Hash',
				name: 'txHash',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['proof'],
						operation: ['generateTxProof'],
					},
				},
				placeholder: '0x...',
				description: 'Transaction hash to generate proof for',
			},

			// Agent question
			{
				displayName: 'Question',
				name: 'question',
				type: 'string',
				default: '',
				typeOptions: { rows: 4 },
				displayOptions: {
					show: {
						resource: ['agent'],
						operation: ['query'],
					},
				},
				placeholder: 'What is the fastest bridge from Ethereum to Arbitrum right now?',
				description: 'Natural language question about cross-chain activity',
			},

			// Protocol filter (for intel)
			{
				displayName: 'Protocol',
				name: 'protocol',
				type: 'options',
				default: '',
				displayOptions: {
					show: {
						resource: ['intel'],
						operation: ['getProtocolHealth', 'getSolvers'],
					},
				},
				options: [
					{ name: 'All Protocols', value: '' },
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
				],
				description: 'Filter by protocol (optional)',
			},

			// Genome limit
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				default: 50,
				displayOptions: {
					show: {
						resource: ['genome'],
						operation: ['getLatest', 'queryStream'],
					},
				},
				typeOptions: { minValue: 1, maxValue: 500 },
				description: 'Maximum number of entries to return',
			},

			// Job ID (for assurance)
			{
				displayName: 'Job ID',
				name: 'jobId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['assurance'],
						operation: ['getReceipt', 'verifyReceipt'],
					},
				},
				placeholder: 'job_...',
				description: 'Assurance job ID',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('taifoonApi');

		const baseUrl =
			credentials.environment === 'testnet'
				? 'https://testnet.api.taifoon.dev'
				: 'https://api.taifoon.dev';

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				let endpoint = '';
				let method: 'GET' | 'POST' = 'GET';
				let body: Record<string, unknown> | undefined;
				let qs: Record<string, unknown> = {};

				// ─── INTEL ───────────────────────────────────────────────
				if (resource === 'intel') {
					const protocol = this.getNodeParameter('protocol', i, '') as string;

					switch (operation) {
						case 'getOverview':
							endpoint = '/api/intel/overview';
							break;
						case 'getSolvers':
							endpoint = '/api/intel/solvers';
							if (protocol) qs.protocol = protocol;
							break;
						case 'getProtocolHealth':
							endpoint = '/api/intel/protocols/compare';
							if (protocol) qs.protocol = protocol;
							break;
						case 'compareRoutes':
							endpoint = '/api/intel/routes/compare';
							break;
						case 'getFillRates':
							endpoint = '/api/intel/fill-rates';
							break;
						case 'getLiveStats':
							endpoint = '/api/intel/live-stats';
							break;
					}
				}

				// ─── PROOF ───────────────────────────────────────────────
				else if (resource === 'proof') {
					const chainId = this.getNodeParameter('chainId', i) as number;

					switch (operation) {
						case 'estimateCost':
							endpoint = `/api/v5/proof/cost-estimate`;
							qs = { chain_id: chainId, proof_type: 'receipt' };
							break;
						case 'generateBlockProof':
							const blockNumber = this.getNodeParameter('blockNumber', i) as number;
							if (!blockNumber) {
								throw new NodeOperationError(
									this.getNode(),
									'Block number is required',
									{ itemIndex: i },
								);
							}
							endpoint = `/api/v5/proof/blob/${chainId}/${blockNumber}`;
							break;
						case 'generateTxProof':
							const txHash = this.getNodeParameter('txHash', i) as string;
							if (!txHash) {
								throw new NodeOperationError(
									this.getNode(),
									'Transaction hash is required',
									{ itemIndex: i },
								);
							}
							endpoint = `/v5/proof/tx/${chainId}/${txHash}`;
							break;
						case 'getSuperroot':
							endpoint = '/api/spinner/superroot';
							break;
					}
				}

				// ─── AGENT ───────────────────────────────────────────────
				else if (resource === 'agent') {
					switch (operation) {
						case 'query':
							const question = this.getNodeParameter('question', i) as string;
							if (!question) {
								throw new NodeOperationError(
									this.getNode(),
									'Question is required',
									{ itemIndex: i },
								);
							}
							endpoint = '/v6/agent/query';
							method = 'POST';
							body = { question };
							break;
						case 'getQuote':
							endpoint = '/v6/agent/quote';
							method = 'POST';
							body = {};
							break;
						case 'getHealth':
							endpoint = '/v6/agent/health';
							break;
					}
				}

				// ─── GENOME ──────────────────────────────────────────────
				else if (resource === 'genome') {
					const limit = this.getNodeParameter('limit', i, 50) as number;

					switch (operation) {
						case 'getStats':
							endpoint = '/api/genome/stats';
							break;
						case 'getLatest':
							endpoint = '/api/genome/latest';
							qs = { limit };
							break;
						case 'queryStream':
							endpoint = '/api/genome/stream';
							qs = { limit };
							break;
					}
				}

				// ─── ASSURANCE ───────────────────────────────────────────
				else if (resource === 'assurance') {
					const jobId = this.getNodeParameter('jobId', i, '') as string;

					switch (operation) {
						case 'getReceipt':
							if (!jobId) {
								throw new NodeOperationError(
									this.getNode(),
									'Job ID is required',
									{ itemIndex: i },
								);
							}
							endpoint = `/api/assurance/receipt/${jobId}`;
							break;
						case 'verifyReceipt':
							if (!jobId) {
								throw new NodeOperationError(
									this.getNode(),
									'Job ID is required',
									{ itemIndex: i },
								);
							}
							endpoint = `/api/assurance/receipt/${jobId}/verify`;
							break;
					}
				}

				// Make the request
				const response = await this.helpers.httpRequest({
					method,
					url: `${baseUrl}${endpoint}`,
					headers: {
						Authorization: `Bearer ${credentials.apiKey}`,
						'Content-Type': 'application/json',
					},
					body,
					qs,
					json: true,
				});

				returnData.push({ json: response });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
