/**
 * As originally planned, this was meant to grow into the full
 * lessons/versions/scores/library data-access surface, so domain and
 * route code would never touch `@supabase/supabase-js` directly. As
 * built (Prompt 8 onward), that didn't happen: routes call
 * `locals.supabase` (the per-request, cookie-authenticated client from
 * `hooks.server.ts`) directly for reads and RPC calls, relying on
 * Postgres RLS (ADR-002) — not this interface — as the isolation
 * boundary. See ADR-014 for why, and docs/ARCHITECTURE.md Section 2/6
 * for the as-built request flow. This interface (and
 * `SupabaseDataStore`) is currently unused by any route — it exists
 * only as a service-role connectivity check, exercised by its own spec
 * test, not wired into the app.
 */
export interface DataStore {
	/** Confirms connectivity to the underlying store (service-role client). */
	ping(): Promise<boolean>;
}
