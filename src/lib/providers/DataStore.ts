/**
 * Persistence boundary. Domain and route code depend on this interface,
 * never on `@supabase/supabase-js` directly (see docs/ARCHITECTURE.md
 * Section 2). The full data-access surface (lessons, versions, scores,
 * library queries) is added as those features are built, starting with
 * the domain model in Prompt 5.
 */
export interface DataStore {
	/** Confirms connectivity to the underlying store. Used by the boot-check page. */
	ping(): Promise<boolean>;
}
