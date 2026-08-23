import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import type { DataStore } from './DataStore';

/**
 * Supabase-backed implementation of {@link DataStore}. Server-side only —
 * uses the service role key, which must never reach the client.
 */
export class SupabaseDataStore implements DataStore {
	private client: SupabaseClient | null;

	constructor() {
		this.client =
			env.PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
				? createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
				: null;
	}

	get isConfigured(): boolean {
		return this.client !== null;
	}

	async ping(): Promise<boolean> {
		if (!this.client) return false;
		// auth.getSession() with the service role client doesn't hit the DB;
		// a lightweight metadata query confirms the project is reachable.
		const { error } = await this.client.from('_chiron_boot_check').select('*').limit(0);
		// A "relation does not exist" error still proves the connection and
		// credentials work — only a network/auth failure should read as down.
		return !error || error.code === '42P01';
	}
}
