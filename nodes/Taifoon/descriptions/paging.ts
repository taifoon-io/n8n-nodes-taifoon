// _N8N_RETURN_ALL_v1_ (n8n review of 1.2.2): a list operation offers Return All + Limit, never a raw Offset. With Return All
// the node follows the API's own paging (offset, page or cursor) until the list is exhausted and answers with ONE item: the
// first page's body with the list holding every row. A list the API does not page is read once at the API's own maximum.
import type { DeclarativeRestApiSettings, IDataObject, IExecutePaginationFunctions, INodeExecutionData, INodeProperties } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

export type Paging = {
	/** the response key that holds the rows */
	root: string;
	/** the API's largest page (its "limit: 1 to N") */
	max: number;
	/** offset: ?offset=; page: ?page= up to the body's pages; cursor: ?cursor= from the body's next_cursor; none: one read at max */
	by: 'offset' | 'page' | 'cursor' | 'none';
};

/** never more requests than this for one Return All (the index holds tens of thousands of rows at most) */
const MAX_PAGES = 500;

/**
 * Reads every page of a list and answers with one item shaped like a single page: the rows under `root`, counts updated. A row
 * whose `id` an earlier page already carried is kept once (a live index can move under an offset read).
 */
export function pageAll(p: Paging) {
	return async function (this: IExecutePaginationFunctions, req: DeclarativeRestApiSettings.ResultOptions): Promise<INodeExecutionData[]> {
		const rows: unknown[] = [];
		const seen = new Set<unknown>();
		let first: IDataObject | undefined;
		let at: IDataObject = p.by === 'offset' ? { offset: 0 } : p.by === 'page' ? { page: 1 } : {};
		for (let n = 0; n < MAX_PAGES; n++) {
			const [item] = await this.makeRoutingRequest({ ...req, options: { ...req.options, qs: { ...req.options.qs, limit: p.max, ...at } } });
			const body = (item?.json ?? {}) as IDataObject;
			const page = body[p.root];
			if (!Array.isArray(page)) throw new NodeOperationError(this.getNode(), `The answer has no "${p.root}" list to page through`);
			first ??= body;
			for (const row of page) {
				const id = row && typeof row === 'object' ? (row as IDataObject).id : undefined;
				if (id !== undefined && id !== null) {
					if (seen.has(id)) continue;
					seen.add(id);
				}
				rows.push(row);
			}
			if (p.by === 'none' || page.length === 0) break;
			if (p.by === 'offset') {
				if (page.length < p.max) break;
				at = { offset: (at.offset as number) + page.length };
			} else if (p.by === 'page') {
				if ((at.page as number) >= Number(body.pages ?? 0)) break;
				at = { page: (at.page as number) + 1 };
			} else {
				if (typeof body.next_cursor !== 'string' || !body.next_cursor) break;
				at = { cursor: body.next_cursor };
			}
		}
		const out: IDataObject = { ...first, [p.root]: rows as IDataObject[] };
		for (const k of ['returned', 'count']) if (k in out) out[k] = rows.length;
		for (const k of ['next_offset', 'next_cursor']) delete out[k];
		return [{ json: out }];
	};
}

/**
 * Return All and its Limit for one list operation. Limit shows only while Return All is off and is sent as ?limit=; Return All
 * sends no limit of its own and pages with pageAll.
 */
export function returnAllLimit(
	resource: string,
	operation: string,
	p: Paging,
	o: { limitName?: string; defaultLimit?: number } = {},
): INodeProperties[] {
	const on = { resource: [resource], operation: [operation] };
	const limit: INodeProperties = {
		displayName: 'Limit',
		name: o.limitName ?? 'limit',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: p.max },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...on, returnAll: [false] } },
		routing: { send: { type: 'query', property: 'limit' } },
	};
	if (o.defaultLimit) limit.default = o.defaultLimit;
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: on },
			routing: {
				send: { paginate: '={{ $value }}' },
				operations: { pagination: pageAll(p) },
			},
		},
		limit,
	];
}
