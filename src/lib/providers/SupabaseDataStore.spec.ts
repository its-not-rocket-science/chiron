import { describe, expect, it, vi } from 'vitest';

// prompt.txt Prompt F1 (CI, ADR-028): this test's whole premise —
// "no Supabase credentials are set" — used to depend on the ambient
// process environment genuinely having none, which only held true on a
// fresh local checkout before .env was filled in. That made it the one
// spec in this repo that behaved differently depending on which CI job
// ran it: passed in `fast` (no secrets), failed in `live` (real secrets
// present by design) — a real environment-dependent flake, not the
// deliberate credential-skip pattern every other live-adjacent test in
// this repo uses. Mocking `$lib/server/env` directly makes "unconfigured"
// a deterministic condition this test creates itself, independent of
// whatever secrets the job actually has.
vi.mock('$lib/server/env', () => ({
	env: { PUBLIC_SUPABASE_URL: undefined, SUPABASE_SERVICE_ROLE_KEY: undefined }
}));

describe('SupabaseDataStore', () => {
	it('reports unconfigured and pings false when no Supabase credentials are set', async () => {
		const { SupabaseDataStore } = await import('./SupabaseDataStore');
		const store = new SupabaseDataStore();
		expect(store.isConfigured).toBe(false);
		await expect(store.ping()).resolves.toBe(false);
	});

	it('the scoring cache is a safe no-op when unconfigured (prompts.txt Prompt P5)', async () => {
		const { SupabaseDataStore } = await import('./SupabaseDataStore');
		const store = new SupabaseDataStore();
		await expect(store.getCachedScore('some-hash')).resolves.toBeNull();
		await expect(store.saveCachedScore('some-hash', {} as never)).resolves.toBeUndefined();
	});
});
