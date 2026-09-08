/**
 * Adversarial RLS tests for system-example lessons
 * (prompts-onboarding-examples.txt Prompt E2). Prove:
 *   1. any authenticated user (regardless of org) can read a
 *      system-example lesson — the existing "view lessons per visibility
 *      rules" policy's `visibility = 'public-template'` branch, with no
 *      owner_id check.
 *   2. no ordinary authenticated user can INSERT, UPDATE, or DELETE one
 *      via a direct REST call — the existing owner-scoped write policies
 *      require `owner_id = auth.uid()`, which a NULL owner_id can never
 *      satisfy.
 *
 * These run against the REAL live Supabase project, not a mock — same
 * rationale as tests/rls/orgIsolation.spec.ts. Skipped (not failed) when
 * Supabase isn't configured. Requires migration
 * supabase/migrations/0017_system_example_lessons.sql to have been
 * applied — see that file's own header for why this repo applies
 * migrations manually via the Supabase SQL Editor rather than from CI.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

describe.skipIf(!hasSupabase)('RLS — system-example lessons (adversarial, live Supabase)', () => {
	let admin: SupabaseClient;
	let userClient: SupabaseClient;
	let userId: string | undefined;

	let exampleLessonId: string;

	const runId = randomUUID().slice(0, 8);
	const emailFor = (label: string) => `chiron-rls-test-${label}-${runId}@example.com`;
	const password = 'Test-Password-123!';

	beforeAll(async () => {
		const url = env.PUBLIC_SUPABASE_URL!;
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
		admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

		const user = await admin.auth.admin.createUser({
			email: emailFor('user'),
			password,
			email_confirm: true
		});
		if (user.error || !user.data.user) throw user.error ?? new Error('Failed to create user');
		userId = user.data.user.id;

		userClient = createClient(url, anonKey, NO_PERSIST);
		await userClient.auth.signInWithPassword({ email: emailFor('user'), password });

		// Seeded the same way scripts/seed-onboarding-examples.ts does: a
		// direct service-role insert, never the save_lesson RPC (which
		// hardcodes owner_id = auth.uid(), the wrong shape for a row with
		// no owner at all).
		const { data, error } = await admin
			.from('lessons')
			.insert({
				owner_id: null,
				org_id: null,
				title: `RLS test system example ${runId}`,
				subject_profile_id: 'science-lab',
				visibility: 'public-template',
				origin: 'system_example',
				attribution_name: 'Test Source',
				attribution_url: 'https://example.com/test-source',
				license: 'CC-BY-4.0',
				license_note: null
			})
			.select('id')
			.single();
		if (error || !data) throw error ?? new Error('Failed to create system-example lesson fixture');
		exampleLessonId = data.id;

		// A scored version, so copy_lesson() (below) has something to copy —
		// mirrors what scripts/seed-onboarding-examples.ts actually leaves
		// behind, minus the real LLM call.
		const { data: version, error: versionError } = await admin
			.from('lesson_versions')
			.insert({ lesson_id: exampleLessonId, version_number: 1, source: 'paste', raw_text: 'x' })
			.select('id')
			.single();
		if (versionError || !version)
			throw versionError ?? new Error('Failed to create version fixture');
		await admin
			.from('lessons')
			.update({ current_version_id: version.id })
			.eq('id', exampleLessonId);
	}, 30_000);

	afterAll(async () => {
		if (exampleLessonId) await admin.from('lessons').delete().eq('id', exampleLessonId);
		if (userId) await admin.auth.admin.deleteUser(userId);
	});

	it('any authenticated user can read a system-example lesson', async () => {
		const { data } = await userClient
			.from('lessons')
			.select('id, origin, owner_id, attribution_name, attribution_url, license')
			.eq('id', exampleLessonId)
			.maybeSingle();
		expect(data?.id).toBe(exampleLessonId);
		expect(data?.origin).toBe('system_example');
		expect(data?.owner_id).toBeNull();
	});

	it('an ordinary authenticated user cannot claim a system-example row by inserting one with owner_id null', async () => {
		const { error } = await userClient.from('lessons').insert({
			owner_id: null,
			title: 'Spoofed system example',
			subject_profile_id: 'science-lab',
			visibility: 'public-template',
			origin: 'system_example',
			attribution_name: 'Fake',
			attribution_url: 'https://example.com',
			license: 'CC-BY-4.0'
		});
		expect(error).not.toBeNull();
	});

	it('an ordinary authenticated user cannot update a system-example lesson via a direct REST call', async () => {
		await userClient
			.from('lessons')
			.update({ title: 'Renamed by an attacker' })
			.eq('id', exampleLessonId);
		const stillOriginal = await admin
			.from('lessons')
			.select('title')
			.eq('id', exampleLessonId)
			.single();
		expect(stillOriginal.data?.title).toBe(`RLS test system example ${runId}`);
	});

	it('an ordinary authenticated user cannot delete a system-example lesson via a direct REST call', async () => {
		await userClient.from('lessons').delete().eq('id', exampleLessonId);
		const stillExists = await admin
			.from('lessons')
			.select('id')
			.eq('id', exampleLessonId)
			.maybeSingle();
		expect(stillExists.data?.id).toBe(exampleLessonId);
	});

	it("a system-example lesson never appears in the user's owned-lessons filter (owner_id = auth.uid())", async () => {
		const { data } = await userClient.from('lessons').select('id').eq('owner_id', userId!);
		expect(data?.map((r) => r.id)).not.toContain(exampleLessonId);
	});

	it("copy_lesson produces a private, user-owned copy that still carries the original's attribution", async () => {
		const { data: newLessonId, error } = await userClient.rpc('copy_lesson', {
			source_lesson_id: exampleLessonId
		});
		expect(error).toBeNull();
		expect(newLessonId).toBeTruthy();

		const { data: copy } = await admin
			.from('lessons')
			.select('owner_id, origin, visibility, attribution_name, attribution_url, license')
			.eq('id', newLessonId as string)
			.single();

		expect(copy?.owner_id).toBe(userId);
		expect(copy?.origin).toBe('user');
		expect(copy?.visibility).toBe('private');
		expect(copy?.attribution_name).toBe('Test Source');
		expect(copy?.attribution_url).toBe('https://example.com/test-source');
		expect(copy?.license).toBe('CC-BY-4.0');

		await admin
			.from('lessons')
			.delete()
			.eq('id', newLessonId as string);
	});
});
