/**
 * Unit coverage for `checkRateLimit`'s documented "fails open on an
 * infra hiccup" promise (see the function's own comment) — specifically
 * the gap found while wiring CI (`prompt.txt` Prompt F1, ADR-028):
 * `getServiceRoleClient()` throws synchronously when Supabase isn't
 * configured, which previously escaped this function's error handling
 * entirely (the throw happens before the `.rpc()` call's own `if
 * (error)` branch can run) and crashed the caller instead of failing
 * open. Mocks `getServiceRoleClient` directly rather than depending on
 * real env state, so this runs identically with or without a local
 * `.env` — unlike the live suite in tests/rls/rateLimit.integration.spec.ts,
 * this doesn't need (and shouldn't need) real Postgres to prove it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('./serviceRoleClient', () => ({
	getServiceRoleClient: vi.fn(() => {
		throw new Error('Supabase service role is not configured.');
	})
}));

describe('checkRateLimit — fails open when Supabase is unconfigured', () => {
	it('returns allowed: true rather than throwing, when getServiceRoleClient() throws synchronously', async () => {
		const { checkRateLimit } = await import('./rateLimit');
		const result = await checkRateLimit('test-key', 5, 60_000);
		expect(result).toEqual({ allowed: true });
	});
});
