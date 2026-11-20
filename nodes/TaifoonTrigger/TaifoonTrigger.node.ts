import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { initialCursor, takeFresh, takeFreshOffers, type Job, type Offer, type OfferState, type PollState } from './cursor';

const BASE = 'https://coord.taifoon.dev/v1';
const MAX_PAGES = 10;

export class TaifoonTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Taifoon Trigger',
		name: 'taifoonTrigger',
		icon: { light: 'file:taifoon.svg', dark: 'file:taifoon.dark.svg' } as const,
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["event"]}}',
		description: 'Starts a workflow when an on-chain agent job changes — funded, submitted, completed, expired, rejected — or when Taifoon sends your seller address an offer',
		defaults: { name: 'Taifoon Trigger' },
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				// optional: with a key the polls run on the key's own budget instead of the visitor budget of the n8n host's address
				// (600 keyless calls a day), so a trigger that polls every minute keeps answering
				name: 'taifoonRelayerApi',
				required: false,
			},
		],
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				default: 'any',
				description:
					'A job ends in exactly one of four ways. "Opened or Progressed" is a job still in flight. "Offer to My Seller Address" is an offer Taifoon or a buyer sent the address on your card (a handshake), once per offer and state.',
				options: [
					{ name: 'Any Change', value: 'any' },
					{ name: 'Cheat Finding', value: 'cheat' },
					{ name: 'Completed', value: 'done' },
					{ name: 'Expired', value: 'expired' },
					{ name: 'Offer to My Seller Address', value: 'offer' },
					{ name: 'Opened or Progressed', value: 'open' },
					{ name: 'Rejected', value: 'rejected' },
				],
			},
			{
				displayName: 'Seller Address',
				name: 'address',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 0x…',
				description:
					'Your payTo address, the one on your card: the offers addressed to it (GET /v1/handshake?provider=). Each carries what your webhook answered; your answer is that reply. A full 20-byte address.',
				displayOptions: { show: { event: ['offer'] } },
			},
			{
				displayName: 'Watch',
				name: 'watch',
				type: 'options',
				default: 'all',
				displayOptions: { hide: { event: ['offer'] } },
				options: [
					{ name: 'All Jobs', value: 'all' },
					{ name: 'Jobs an Address Is Buying', value: 'buyer' },
					{ name: 'Jobs an Address Is Selling', value: 'seller' },
					{ name: 'Jobs an Address Takes Part In', value: 'participant' },
				],
			},
			{
				displayName: 'Address',
				name: 'address',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'e.g. 0x…',
				description: 'A full 20-byte address. A shortened one is refused by the API.',
				displayOptions: { hide: { watch: ['all'], event: ['offer'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Backfill on First Run',
						name: 'backfill',
						type: 'boolean',
						default: false,
						description:
							'Whether the first activation should emit every job in the API\'s current window. Off, it starts one hour back, so switching a workflow on does not fire it dozens of times.',
					},
					{
						displayName: 'Chain ID',
						name: 'chain',
						type: 'number',
						default: 8453,
						description: 'The chain of the jobs (not used for offers)',
					},
				],
			},
		],
	};

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const watch = this.getNodeParameter('watch') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;
		const manual = this.getMode() === 'manual';
		const state = this.getWorkflowStaticData('node') as PollState;
		const now = Date.now();
		// the credential, when one is attached, carries X-API-Key and the channel on every poll
		const keyed = Boolean(this.getNode().credentials?.taifoonRelayerApi);
		const get = async (url: string, qs: IDataObject) =>
			keyed
				? this.helpers.httpRequestWithAuthentication.call(this, 'taifoonRelayerApi', { method: 'GET', url, qs, json: true })
				: this.helpers.httpRequest({ method: 'GET', url, qs, json: true });

		if (event === 'offer') {
			const address = (this.getNodeParameter('address') as string).trim();
			if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
				throw new NodeOperationError(this.getNode(), 'Seller Address must be a full 20-byte address (0x followed by 40 hex characters)', {
					description: 'Paste the payTo address your card names (0x and 40 hex characters), not a shortened 0x12…ab form.',
				});
			}
			const res = (await get(`${BASE}/handshake`, { provider: address, limit: 200 })) as { ok?: boolean; handshakes?: Offer[] };
			if (!res || res.ok !== true || !Array.isArray(res.handshakes)) {
				throw new NodeOperationError(this.getNode(), 'The Taifoon API returned an unexpected response for /v1/handshake', {
					description: 'The trigger polls again on its next interval. If this repeats, check https://coord.taifoon.dev/v1/handshake?provider=<your address>&limit=1 in a browser.',
				});
			}
			// manual: the newest five as they stand, nothing consumed
			if (manual) return res.handshakes.length ? [this.helpers.returnJsonArray(res.handshakes.slice(0, 5) as IDataObject[])] : null;
			const fresh = takeFreshOffers(state as OfferState, res.handshakes, now, options.backfill === true);
			return fresh.length ? [this.helpers.returnJsonArray(fresh as IDataObject[])] : null;
		}

		const qs: IDataObject = { limit: 50 };
		if (event !== 'any') qs.status = event;
		if (options.chain) qs.chain = options.chain;
		if (watch !== 'all') {
			const address = (this.getNodeParameter('address') as string).trim();
			if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
				throw new NodeOperationError(this.getNode(), 'Address must be a full 20-byte address (0x followed by 40 hex characters)', {
					description: 'Paste the whole address (0x and 40 hex characters, not a shortened 0x12…ab form), or set Watch to All Jobs.',
				});
			}
			qs[watch] = address;
		}

		// A manual test should show what the trigger WOULD emit without consuming it: it reads from
		// the start of the window and leaves the stored cursor and the dedupe map untouched.
		let cursor = manual ? '0' : (state.cursor ?? initialCursor(now, options.backfill === true));
		const collected: Job[] = [];

		for (let page = 0; page < MAX_PAGES; page++) {
			const res = (await get(`${BASE}/jobs`, { ...qs, since: cursor })) as { ok?: boolean; jobs?: Job[]; cursor?: string; more?: boolean };

			if (!res || res.ok !== true || !Array.isArray(res.jobs)) {
				throw new NodeOperationError(this.getNode(), 'The Taifoon API returned an unexpected response for /v1/jobs', {
					description: 'The trigger polls again on its next interval. If this repeats, check https://coord.taifoon.dev/v1/jobs?limit=1 in a browser and report it at https://github.com/taifoon-io/n8n-nodes-taifoon/issues.',
				});
			}
			collected.push(...res.jobs);
			if (res.cursor) cursor = String(res.cursor);
			if (!res.more || manual) break;
		}

		if (manual) {
			const sample = collected.slice(-5);
			return sample.length ? [this.helpers.returnJsonArray(sample as IDataObject[])] : null;
		}

		// The cursor advances only now, with the batch in hand. Had the request thrown, the next poll
		// would re-read the same window: at-least-once, which is the safe direction. A duplicate is a
		// nuisance and takeFresh() removes it; a skipped settlement is a lost fact.
		state.cursor = cursor;
		const fresh = takeFresh(state, collected, now);
		return fresh.length ? [this.helpers.returnJsonArray(fresh as IDataObject[])] : null;
	}
}
