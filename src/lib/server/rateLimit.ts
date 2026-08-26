/**
 * Postgres-backed sliding-window rate limiter (`prompts.txt` Prompt 31),
 * replacing the per-process in-memory Map this file used to hold
 * (ADR-006's original design). State now lives in `public.rate_limits`
 * (`supabase/migrations/0011_rate_limits.sql`), checked and incremented
 * atomically by the `check_rate_limit` RPC — so limits hold across more
 * than one app instance and survive a restart/redeploy, closing the gap
 * ADR-006 and `docs/SECURITY.md` Section 6/9 both flagged as open.
 */
import { getServiceRoleClient } from './serviceRoleClient';

export interface RateLimitResult {
	allowed: boolean;
	/** Seconds until the caller should retry, only meaningful when `allowed` is false. */
	retryAfterSeconds?: number;
}

/**
 * Returns whether `key` (e.g. an IP address or user id, combined with a
 * route name) is within `limit` requests per `windowMs`. Fails open (an
 * infra hiccup on this check should not itself take down a request path
 * that has nothing to do with Supabase being reachable) but logs so a
 * real outage is visible rather than silently invisible.
 */
export async function checkRateLimit(
	key: string,
	limit: number,
	windowMs: number
): Promise<RateLimitResult> {
	const { data, error } = await getServiceRoleClient().rpc('check_rate_limit', {
		p_key: key,
		p_window_seconds: Math.ceil(windowMs / 1000),
		p_max_requests: limit
	});

	if (error || !data || data.length === 0) {
		console.error('Rate limit check failed, failing open:', error?.message ?? 'no rows returned');
		return { allowed: true };
	}

	const row = data[0] as { allowed: boolean; retry_after_seconds: number };
	return row.allowed
		? { allowed: true }
		: { allowed: false, retryAfterSeconds: row.retry_after_seconds };
}
