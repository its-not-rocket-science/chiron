import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { ScoringResultSchema, type ScoringResult } from '$lib/domain/schemas';
import type { DataStore } from './DataStore';

/**
 * Supabase-backed implementation of {@link DataStore}. Server-side only —
 * uses the service role key, which must never reach the client.
 *
 * `ping()` is a standalone connectivity check, unused by any route (see
 * {@link DataStore}'s doc comment / ADR-014). The scoring-cache methods
 * *are* wired into the request path — `scoreLesson()` receives an
 * instance of this class from `POST /api/lessons/score`.
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

	async getCachedScore(contentHash: string): Promise<ScoringResult | null> {
		if (!this.client) return null;

		try {
			const { data, error } = await this.client
				.from('scoring_cache')
				.select('scoring_result')
				.eq('content_hash', contentHash)
				.maybeSingle();
			if (error || !data) return null;

			// Defensive: a cache row written by a previous prompt/schema
			// version could no longer validate. Treat that as a miss, not a
			// crash — a cache lookup failing must fall through to a fresh
			// LLM call, never break the scoring request itself.
			const parsed = ScoringResultSchema.safeParse(data.scoring_result);
			return parsed.success ? parsed.data : null;
		} catch {
			return null;
		}
	}

	async saveCachedScore(contentHash: string, result: ScoringResult): Promise<void> {
		if (!this.client) return;

		// Best-effort — see DataStore's doc comment. A cache write failing
		// (including a thrown network error, not just a returned `error`)
		// must never fail the scoring request that produced this result.
		try {
			await this.client
				.from('scoring_cache')
				.upsert(
					{ content_hash: contentHash, scoring_result: result },
					{ onConflict: 'content_hash' }
				);
		} catch {
			// swallow — see comment above
		}
	}
}
