/**
 * The trigger's memory, kept apart from n8n so it can be tested without it.
 *
 * Two rules, both learned by getting them wrong against the live API first:
 *
 * 1. The cursor is `<updatedAt>.<jobId>`, passed back verbatim. A bare timestamp cannot page through
 *    jobs that share a second — `>=` re-delivers them forever, `>` silently skips all but the first.
 *
 * 2. A job is emitted once per (id, status), not once per id. Funded, submitted and completed are
 *    three different facts about one job, and keying on id alone drops the completion — the one
 *    fact most workflows exist to catch.
 */
export type Job = { id: string | null; status: string; updatedAt: number | null; [k: string]: unknown };
export type PollState = { cursor?: string; seen?: Record<string, number> };

const SEEN_LIMIT = 5000;
const SEEN_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

/** First run: start an hour back rather than replaying the whole window as if it were new. */
export function initialCursor(nowMs: number, backfill: boolean): string {
	return backfill ? '0' : String(Math.floor(nowMs / 1000) - 3600);
}

/** Returns only facts not seen before, and records them. Mutates `state`. */
export function takeFresh(state: PollState, jobs: Job[], nowMs: number): Job[] {
	state.seen = state.seen ?? {};
	const fresh: Job[] = [];
	for (const j of jobs) {
		const key = `${j.id}:${j.status}`;
		if (state.seen[key]) continue;
		state.seen[key] = nowMs;
		fresh.push(j);
	}
	prune(state, nowMs);
	return fresh;
}

/** The dedupe map is pruned by age once it grows large, never below what is recent. Mutates `state`. */
function prune(state: PollState, nowMs: number): void {
	const seen = state.seen ?? {};
	const keys = Object.keys(seen);
	if (keys.length <= SEEN_LIMIT) return;
	const cutoff = nowMs - SEEN_MAX_AGE_MS;
	for (const k of keys) if (seen[k] < cutoff) delete seen[k];
}

/**
 * Offers to a seller (event "Offer to My Seller Address", GET /v1/handshake?provider=): the inbox has no cursor, it answers the
 * newest offers first. An offer is emitted once per (handshake, state): OPEN, NOTIFIED and DELIVERED are three facts about one
 * offer, as funded and completed are about one job. The floor is set on the first poll (an hour back, or 0 with backfill) and
 * kept: an offer last updated before it is history, not news; an older offer that moves on is updated now and is news again.
 */
export type Offer = { handshake_id: string | null; state: string; updated_at?: string | null; created_at?: string | null; [k: string]: unknown };
export type OfferState = PollState & { offerFloor?: number };

const atOf = (o: Offer): number => {
	const t = Date.parse(String(o.updated_at ?? o.created_at ?? ''));
	return Number.isFinite(t) ? t : 0;
};

/** Returns the offers not seen before at their state and not older than the floor, oldest first, and records them. Mutates `state`. */
export function takeFreshOffers(state: OfferState, offers: Offer[], nowMs: number, backfill: boolean): Offer[] {
	if (state.offerFloor === undefined) state.offerFloor = backfill ? 0 : nowMs - 3600 * 1000;
	const floor = state.offerFloor;
	const recent = offers.filter((o) => o && typeof o.handshake_id === 'string' && atOf(o) >= floor).sort((a, b) => atOf(a) - atOf(b));
	state.seen = state.seen ?? {};
	const fresh: Offer[] = [];
	for (const o of recent) {
		const key = `offer:${o.handshake_id}:${o.state}`;
		if (state.seen[key]) continue;
		state.seen[key] = nowMs;
		fresh.push(o);
	}
	prune(state, nowMs);
	return fresh;
}
