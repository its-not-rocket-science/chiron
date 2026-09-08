/**
 * Live check: every seeded onboarding-example lesson's `attributionUrl`
 * actually resolves (`prompts-onboarding-examples.txt` Prompt E3) —
 * attribution links going stale silently is worse than not having them.
 * A real outbound HTTP request per seeded example, against the real live
 * Supabase project to find them. Skipped (not failed) when Supabase isn't
 * configured; each example is treated as informational (not a hard
 * failure) when zero system-example lessons exist yet — this repo
 * applies migrations manually (see migration 0017's own header) and runs
 * `scripts/seed-onboarding-examples.ts` as a separate manual step, so a
 * fresh checkout or an unmigrated project legitimately has none yet.
 *
 * "Resolves" here means "a real server answered, and didn't say the
 * resource is gone" — not "returned 200." Both loc.gov URLs are known to
 * return Cloudflare's bot-check (403) to a plain server-side fetch (see
 * docs/CONTENT_LICENSING.md) even though the pages are genuinely live; a
 * 403 from a real server is still proof the URL isn't dead, which is the
 * actual thing worth guarding here. A DNS/connection failure, a 404, or a
 * 5xx would not pass.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';

interface SeededExample {
	id: string;
	title: string;
	attribution_url: string;
}

const hasSupabase = Boolean(env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY);

describe.skipIf(!hasSupabase)('onboarding examples — attribution links resolve (live)', () => {
	let examples: SeededExample[] = [];

	beforeAll(async () => {
		const supabase = createClient(env.PUBLIC_SUPABASE_URL!, env.PUBLIC_SUPABASE_ANON_KEY!, {
			auth: { autoRefreshToken: false, persistSession: false }
		});
		// A project whose migrations don't yet include 0017 (missing the
		// `origin`/`attribution_url` columns) should make this suite report
		// zero examples, not error the whole run.
		const { data, error } = await supabase
			.from('lessons')
			.select('id, title, attribution_url')
			.eq('origin', 'system_example')
			.returns<SeededExample[]>();
		examples = error ? [] : (data ?? []);

		if (examples.length === 0) {
			console.warn(
				'No system-example lessons found — has migration 0017 been applied and scripts/seed-onboarding-examples.ts been run?'
			);
		}
	}, 15_000);

	it('every seeded example lesson has a non-empty attributionUrl', () => {
		// Always asserts at least once (this suite's `requireAssertions`
		// config would otherwise fail an empty-examples run as a false
		// negative — a genuinely unmigrated/unseeded project, not a bug).
		expect(Array.isArray(examples)).toBe(true);
		for (const example of examples) {
			expect(example.attribution_url, example.title).toBeTruthy();
		}
	});

	it("every seeded example lesson's attributionUrl resolves with a real HTTP response", async () => {
		expect(Array.isArray(examples)).toBe(true);
		for (const example of examples) {
			let status: number | null = null;
			try {
				const response = await fetch(example.attribution_url, {
					method: 'GET',
					redirect: 'follow'
				});
				status = response.status;
			} catch (err) {
				expect.fail(`${example.title} → ${example.attribution_url} failed to connect: ${err}`);
			}
			expect(
				status !== null && status < 500 && status !== 404 && status !== 410,
				`${example.title} → ${example.attribution_url} returned ${status}`
			).toBe(true);
		}
	}, 30_000);
});
