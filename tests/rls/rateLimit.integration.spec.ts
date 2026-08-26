/**
 * Live tests for the Postgres-backed rate limiter (`prompts.txt`
 * Prompt 31 — `supabase/migrations/0011_rate_limits.sql`,
 * `src/lib/server/rateLimit.ts`). Rate-limiting correctness under
 * concurrency isn't meaningfully testable against a mock — the whole
 * point of the atomic `check_rate_limit` RPC is real row-level locking
 * in real Postgres, same discipline as the RLS suites in this
 * directory. Skipped (not failed) when Supabase isn't configured.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { env } from '$lib/server/env';
import { checkRateLimit } from '$lib/server/rateLimit';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

describe.skipIf(!hasSupabase)('checkRateLimit (live Postgres-backed limiter)', () => {
	it('allows requests up to the limit within the window', async () => {
		const key = `test-${randomUUID()}`;
		for (let i = 0; i < 5; i++) {
			expect((await checkRateLimit(key, 5, 60_000)).allowed).toBe(true);
		}
	});

	it('blocks the request once the limit is exceeded, with a positive retry-after', async () => {
		const key = `test-${randomUUID()}`;
		for (let i = 0; i < 3; i++) await checkRateLimit(key, 3, 60_000);
		const result = await checkRateLimit(key, 3, 60_000);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('tracks different keys independently', async () => {
		const keyA = `test-a-${randomUUID()}`;
		const keyB = `test-b-${randomUUID()}`;
		for (let i = 0; i < 3; i++) await checkRateLimit(keyA, 3, 60_000);
		expect((await checkRateLimit(keyA, 3, 60_000)).allowed).toBe(false);
		expect((await checkRateLimit(keyB, 3, 60_000)).allowed).toBe(true);
	});

	it('allows requests again once the window has passed', async () => {
		const key = `test-${randomUUID()}`;
		expect((await checkRateLimit(key, 1, 1000)).allowed).toBe(true);
		expect((await checkRateLimit(key, 1, 1000)).allowed).toBe(false);
		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect((await checkRateLimit(key, 1, 1000)).allowed).toBe(true);
	}, 10_000);

	// The atomicity claim this whole design rests on: N concurrent callers
	// racing for the same fresh key with limit N must produce exactly N
	// allowed and the rest blocked — never more than N allowed (a lost
	// update from a non-atomic read-then-write) and never fewer (a bug
	// double-counting one caller).
	it('serializes concurrent requests for the same key so exactly `limit` are allowed, not more or fewer', async () => {
		const key = `test-concurrent-${randomUUID()}`;
		const limit = 5;
		const attempts = 12;
		const results = await Promise.all(
			Array.from({ length: attempts }, () => checkRateLimit(key, limit, 60_000))
		);
		const allowedCount = results.filter((r) => r.allowed).length;
		expect(allowedCount).toBe(limit);
	}, 20_000);
});
