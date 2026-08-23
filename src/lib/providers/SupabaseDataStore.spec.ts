import { describe, expect, it } from 'vitest';
import { SupabaseDataStore } from './SupabaseDataStore';

describe('SupabaseDataStore', () => {
	it('reports unconfigured and pings false when no Supabase credentials are set', async () => {
		// The test environment has no PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY set,
		// matching a fresh local checkout before .env is filled in.
		const store = new SupabaseDataStore();
		expect(store.isConfigured).toBe(false);
		await expect(store.ping()).resolves.toBe(false);
	});
});
