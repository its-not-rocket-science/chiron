import type { ScoringResult } from '$lib/domain/schemas';

/**
 * As originally planned, this was meant to grow into the full
 * lessons/versions/scores/library data-access surface, so domain and
 * route code would never touch `@supabase/supabase-js` directly. As
 * built (Prompt 8 onward), that didn't happen: routes call
 * `locals.supabase` (the per-request, cookie-authenticated client from
 * `hooks.server.ts`) directly for reads and RPC calls, relying on
 * Postgres RLS (ADR-002) — not this interface — as the isolation
 * boundary. See ADR-014 for why.
 *
 * The scoring-cache methods below (prompts.txt Prompt P5) are the one
 * genuine exception, not a reversal of ADR-014: a content-hash cache
 * has no owner, org, or visibility to get wrong — it's a pure
 * memoization of "we scored this exact text+subject+prompt combo
 * before," safe to serve to anyone who submits the same content. That's
 * precisely the kind of service-role, non-RLS-scoped operation this
 * interface was always meant for, unlike lesson persistence (which
 * stays on `locals.supabase` because RLS is the real boundary there).
 */
export interface DataStore {
	/** Confirms connectivity to the underlying store (service-role client). */
	ping(): Promise<boolean>;

	/** Looks up a previously computed score by content hash. Null on a miss or if unconfigured. */
	getCachedScore(contentHash: string): Promise<ScoringResult | null>;

	/**
	 * Stores a score under its content hash for future reuse. Best-effort:
	 * a failed cache write must never fail the scoring request it's
	 * attached to, so implementations should swallow their own errors.
	 */
	saveCachedScore(contentHash: string, result: ScoringResult): Promise<void>;
}
