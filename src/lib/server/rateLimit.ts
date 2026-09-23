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
import { reportError } from './errorReporting';

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
	// `getServiceRoleClient()` throws synchronously when Supabase isn't
	// configured (by design for its other callers — see its own comment).
	// That throw previously escaped this function's "fails open" promise
	// entirely (it happens before the .rpc() call's own error branch below
	// can catch anything), so a route with no Supabase configured (a fresh
	// local checkout, or CI's no-credential job — prompt.txt Prompt F1)
	// crashed instead of failing open. Wrapping the whole body closes that
	// gap without changing getServiceRoleClient()'s own contract.
	try {
		const { data, error } = await getServiceRoleClient().rpc('check_rate_limit', {
			p_key: key,
			p_window_seconds: Math.ceil(windowMs / 1000),
			p_max_requests: limit
		});

		if (error || !data || data.length === 0) {
			reportError(
				'Rate limit check failed, failing open',
				error?.message ?? 'no rows returned',
				'rate_limit_fail_open'
			);
			return { allowed: true };
		}

		const row = data[0] as { allowed: boolean; retry_after_seconds: number };
		return row.allowed
			? { allowed: true }
			: { allowed: false, retryAfterSeconds: row.retry_after_seconds };
	} catch (err) {
		const safeSummary = err instanceof Error ? `${err.name}: ${err.message}` : 'non-Error thrown';
		reportError('Rate limit check failed, failing open', safeSummary, 'rate_limit_fail_open');
		return { allowed: true };
	}
}
