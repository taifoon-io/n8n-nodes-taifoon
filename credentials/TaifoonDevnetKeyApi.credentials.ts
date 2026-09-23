import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * A DEVNET key. The Taifoon devnet (chain 36927) has free gas and public dev accounts; a key here signs
 * the unsigned calls the Taifoon node builds (stamp, feedback, post-verdict) and sends them there. It is
 * never used on a mainnet: the signer node refuses any chain but 36927 unless you turn the guard off.
 */
export class TaifoonDevnetKeyApi implements ICredentialType {
	name = 'taifoonDevnetKeyApi';
	displayName = 'Taifoon Devnet Key API';
	documentationUrl = 'https://www.taifoon.io/docs/coordination';
	icon = { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' } as const;
	properties: INodeProperties[] = [
		{
			displayName: 'Private Key',
			name: 'privateKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'A devnet-only key (0x + 64 hex). anvil #0 and #1 are public; faucet.taifoon.dev funds any address.',
		},
		{
			displayName: 'RPC URL',
			name: 'rpcUrl',
			type: 'string',
			default: 'https://rpc.taifoon.dev',
			required: true,
		},
		{
			displayName: 'Allow Chains Other Than the Devnet',
			name: 'allowMainnet',
			type: 'boolean',
			default: false,
			description: 'Whether the signer may send to chains other than 36927 — off by default; on, this key spends real gas',
		},
	];
}
