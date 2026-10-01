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
	const keys = Object.keys(state.seen);
	if (keys.length > SEEN_LIMIT) {
		const cutoff = nowMs - SEEN_MAX_AGE_MS;
		for (const k of keys) if (state.seen[k] < cutoff) delete state.seen[k];
	}
	return fresh;
}
