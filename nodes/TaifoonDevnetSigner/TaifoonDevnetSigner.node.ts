import type { IExecuteFunctions, INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { createWalletClient, createPublicClient, http, defineChain, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Sends the UNSIGNED calls the Taifoon node builds (assurance/call: stamp, give-feedback, post-verdict,
 * fund-job …) on the Taifoon devnet, in the order they arrive, and returns each receipt with its explorer link.
 *
 * The one node in this package that holds a key — a devnet key, by construction: chain 36927 has free gas
 * and public dev accounts, and the credential's guard refuses any other chain unless switched off. Use it
 * to close the loop for a Jev grade: Judge → Grade → Stamp Grade (unsigned) → this node → the registry.
 */
export class TaifoonDevnetSigner implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Taifoon Devnet Signer',
		name: 'taifoonDevnetSigner',
		icon: { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' } as const,
		group: ['transform'],
		version: 1,
		subtitle: 'send unsigned calls on the devnet',
		description: 'Sign and send the unsigned calls the Taifoon node builds, on the Taifoon devnet (free gas). Returns the receipt and the explorer link for each call.',
		defaults: { name: 'Taifoon Devnet Signer' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'taifoonDevnetKeyApi', required: true }],
		properties: [
			{
				displayName: 'Calls Field',
				name: 'callsField',
				type: 'string',
				default: 'calls',
				description: 'The field on the incoming item that holds the unsigned calls (an array of { chainId, to, data, value, requires? }) — /v1/assurance/call answers with it as <code>calls</code>',
			},
			{
				displayName: 'Send `Requires` First',
				name: 'sendRequires',
				type: 'boolean',
				default: false,
				description: 'Whether to also send the calls another signer must send first (a seller’s deposit approve) — only right when this key IS that signer',
			},
			{
				displayName: 'Wait for Receipts',
				name: 'wait',
				type: 'boolean',
				default: true,
				description: 'Whether to wait for each receipt before sending the next call',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const cred = (await this.getCredentials('taifoonDevnetKeyApi')) as { privateKey: string; rpcUrl: string; allowMainnet: boolean };
		const pk = String(cred.privateKey || '').trim();
		if (!/^0x[0-9a-fA-F]{64}$/.test(pk)) throw new NodeOperationError(this.getNode(), 'the credential needs a 0x-prefixed 64-hex private key');
		const account = privateKeyToAccount(pk as Hex);
		const out: INodeExecutionData[] = [];
		for (let i = 0; i < items.length; i++) {
			const field = this.getNodeParameter('callsField', i) as string;
			const sendRequires = this.getNodeParameter('sendRequires', i) as boolean;
			const wait = this.getNodeParameter('wait', i) as boolean;
			const raw = (items[i].json as Record<string, unknown>)[field];
			type Call = { chainId: number; to: string; data: string; value?: string; action?: string; effect?: string; requires?: Call[] };
			const calls = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Call[];
			if (!calls.length) throw new NodeOperationError(this.getNode(), `no calls found on item ${i} under "${field}"`, { itemIndex: i });
			const queue: Call[] = calls.flatMap((c) => [...(sendRequires ? c.requires ?? [] : []), c]);
			const receipts: unknown[] = [];
			for (const c of queue) {
				const chainId = Number(c.chainId);
				if (chainId !== 36927 && !cred.allowMainnet) throw new NodeOperationError(this.getNode(), `refusing chain ${chainId}: this key is a devnet key (turn the guard off in the credential to allow it)`, { itemIndex: i });
				const chain = defineChain({ id: chainId, name: chainId === 36927 ? 'Taifoon Devnet' : `chain ${chainId}`, nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [cred.rpcUrl] } } });
				const wallet = createWalletClient({ account, chain, transport: http(cred.rpcUrl) });
				const pub = createPublicClient({ chain, transport: http(cred.rpcUrl) });
				const hash = await wallet.sendTransaction({ to: c.to as Hex, data: (c.data || '0x') as Hex, value: BigInt(c.value ?? '0'), type: 'legacy' } as never);
				const receipt = wait ? await pub.waitForTransactionReceipt({ hash }) : null;
				receipts.push({ action: c.action ?? null, to: c.to, tx: hash, status: receipt ? receipt.status : 'sent', block: receipt ? Number(receipt.blockNumber) : null, logs: receipt ? receipt.logs.length : null, explorer: chainId === 36927 ? `https://www.taifoon.io/scan/36927/tx/${hash}` : null, effect: c.effect ?? null });
			}
			out.push({ json: { ...items[i].json, signer: account.address, sent: receipts }, pairedItem: { item: i } });
		}
		return [out];
	}
}
