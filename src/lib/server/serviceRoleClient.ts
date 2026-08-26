/**
 * Service-role Supabase client for the small set of Phase 2A writes that
 * must NOT be reachable by an ordinary authenticated client at all —
 * see ADR-020. `SupabaseDataStore` already builds a service-role client
 * internally (ADR-014) but only exposes `ping()`/`isConfigured`, not the
 * raw client — this is a separate, minimal helper rather than changing
 * that class's public contract.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** Throws if the service role isn't configured — callers only ever call this server-side, on a path that already requires Supabase to be configured. */
export function getServiceRoleClient(): SupabaseClient {
	if (!env.PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
		throw new Error('Supabase service role is not configured.');
	}
	client ??= createClient(env.PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
		auth: { autoRefreshToken: false, persistSession: false }
	});
	return client;
}
