/**
 * Adversarial RLS tests (Prompt 8): prove one org cannot read another
 * org's private or org-shared lessons, and that a public-template lesson
 * is visible cross-org. These run against the REAL live Supabase project
 * (not a mock) — RLS correctness isn't meaningfully testable against a
 * mock, per docs/ARCHITECTURE.md Section 8. Skipped (not failed) when
 * Supabase isn't configured, matching the pattern used for the live LLM
 * integration tests.
 *
 * Creates and tears down real fixture users/orgs/lessons on every run —
 * safe to run repeatedly against a real project, but do not point this
 * at a project with data you care about without reading it first.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { ctSkillIds } from '$lib/domain/taxonomy';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

async function createLessonFixture(
	client: SupabaseClient,
	opts: {
		title: string;
		orgId: string | null;
		visibility: 'private' | 'org-shared' | 'public-template';
	}
): Promise<string> {
	const { data, error } = await client.rpc('save_lesson', {
		p_title: opts.title,
		p_subject_profile_id: 'science-lab',
		p_grade_level: null,
		p_visibility: opts.visibility,
		p_org_id: opts.orgId,
		p_source: 'paste',
		p_raw_text: 'Some lesson text used for an RLS adversarial test.',
		p_dialogue_score: 1,
		p_dialogue_justification: 'x',
		p_authenticity_score: 1,
		p_authenticity_justification: 'x',
		p_mentoring_score: 1,
		p_mentoring_justification: 'x',
		p_model_id: 'test-model',
		p_prompt_version: 'test-prompt-v1',
		p_skill_coverage: ctSkillIds.map((skill) => ({
			skill,
			covered: false,
			confidence: 'low',
			justification: 'x'
		})),
		p_suggestions: []
	});
	if (error || !data) throw error ?? new Error(`Failed to create lesson fixture: ${opts.title}`);
	return data as string;
}

describe.skipIf(!hasSupabase)('RLS — org isolation (adversarial, live Supabase)', () => {
	let admin: SupabaseClient;
	let userAClient: SupabaseClient;
	let userBClient: SupabaseClient;
	let outsiderClient: SupabaseClient;

	let orgAId: string;
	let orgBId: string;
	let userAId: string | undefined;
	let userBId: string | undefined;
	let outsiderId: string | undefined;

	let orgAPrivateLessonId: string;
	let orgASharedLessonId: string;
	let publicTemplateLessonId: string;

	const runId = randomUUID().slice(0, 8);
	const emailFor = (label: string) => `chiron-rls-test-${label}-${runId}@example.com`;
	const password = 'Test-Password-123!';

	beforeAll(async () => {
		const url = env.PUBLIC_SUPABASE_URL!;
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
		admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

		const userA = await admin.auth.admin.createUser({
			email: emailFor('user-a'),
			password,
			email_confirm: true
		});
		if (userA.error || !userA.data.user) throw userA.error ?? new Error('Failed to create user A');
		userAId = userA.data.user.id;

		const userB = await admin.auth.admin.createUser({
			email: emailFor('user-b'),
			password,
			email_confirm: true
		});
		if (userB.error || !userB.data.user) throw userB.error ?? new Error('Failed to create user B');
		userBId = userB.data.user.id;

		const outsider = await admin.auth.admin.createUser({
			email: emailFor('outsider'),
			password,
			email_confirm: true
		});
		if (outsider.error || !outsider.data.user)
			throw outsider.error ?? new Error('Failed to create outsider');
		outsiderId = outsider.data.user.id;

		userAClient = createClient(url, anonKey, NO_PERSIST);
		await userAClient.auth.signInWithPassword({ email: emailFor('user-a'), password });

		userBClient = createClient(url, anonKey, NO_PERSIST);
		await userBClient.auth.signInWithPassword({ email: emailFor('user-b'), password });

		outsiderClient = createClient(url, anonKey, NO_PERSIST);
		await outsiderClient.auth.signInWithPassword({ email: emailFor('outsider'), password });

		const orgA = await userAClient.rpc('create_org', { org_name: `RLS Test Org A ${runId}` });
		if (orgA.error || !orgA.data) throw orgA.error ?? new Error('Failed to create org A');
		orgAId = (orgA.data as { id: string }).id;

		const orgB = await userBClient.rpc('create_org', { org_name: `RLS Test Org B ${runId}` });
		if (orgB.error || !orgB.data) throw orgB.error ?? new Error('Failed to create org B');
		orgBId = (orgB.data as { id: string }).id;

		orgAPrivateLessonId = await createLessonFixture(userAClient, {
			title: 'Org A private lesson',
			orgId: null,
			visibility: 'private'
		});
		orgASharedLessonId = await createLessonFixture(userAClient, {
			title: 'Org A shared lesson',
			orgId: orgAId,
			visibility: 'org-shared'
		});
		publicTemplateLessonId = await createLessonFixture(userBClient, {
			title: 'Org B public template lesson',
			orgId: orgBId,
			visibility: 'public-template'
		});
	}, 30_000);

	afterAll(async () => {
		// Cascading FKs clean up lessons/versions/scores/etc. and memberships/invites.
		if (orgAId) await admin.from('orgs').delete().eq('id', orgAId);
		if (orgBId) await admin.from('orgs').delete().eq('id', orgBId);
		if (userAId) await admin.auth.admin.deleteUser(userAId);
		if (userBId) await admin.auth.admin.deleteUser(userBId);
		if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
	});

	it("org A's user can see their own private lesson", async () => {
		const { data } = await userAClient
			.from('lessons')
			.select('id')
			.eq('id', orgAPrivateLessonId)
			.maybeSingle();
		expect(data?.id).toBe(orgAPrivateLessonId);
	});

	it("org A's user can see the org-shared lesson in their own org", async () => {
		const { data } = await userAClient
			.from('lessons')
			.select('id')
			.eq('id', orgASharedLessonId)
			.maybeSingle();
		expect(data?.id).toBe(orgASharedLessonId);
	});

	it("org B's user cannot see org A's private lesson", async () => {
		const { data } = await userBClient
			.from('lessons')
			.select('id')
			.eq('id', orgAPrivateLessonId)
			.maybeSingle();
		expect(data).toBeNull();
	});

	it("org B's user cannot see org A's org-shared lesson", async () => {
		const { data } = await userBClient
			.from('lessons')
			.select('id')
			.eq('id', orgASharedLessonId)
			.maybeSingle();
		expect(data).toBeNull();
	});

	it('an outsider with no org membership cannot see org A private or org-shared lessons', async () => {
		const privateResult = await outsiderClient
			.from('lessons')
			.select('id')
			.eq('id', orgAPrivateLessonId)
			.maybeSingle();
		expect(privateResult.data).toBeNull();

		const sharedResult = await outsiderClient
			.from('lessons')
			.select('id')
			.eq('id', orgASharedLessonId)
			.maybeSingle();
		expect(sharedResult.data).toBeNull();
	});

	it('a public-template lesson is visible cross-org, including to an outsider with no org', async () => {
		const fromOtherOrg = await userAClient
			.from('lessons')
			.select('id')
			.eq('id', publicTemplateLessonId)
			.maybeSingle();
		expect(fromOtherOrg.data?.id).toBe(publicTemplateLessonId);

		const fromOutsider = await outsiderClient
			.from('lessons')
			.select('id')
			.eq('id', publicTemplateLessonId)
			.maybeSingle();
		expect(fromOutsider.data?.id).toBe(publicTemplateLessonId);
	});

	it("org B's user cannot read the score for org A's org-shared lesson version either", async () => {
		const version = await userAClient
			.from('lesson_versions')
			.select('id')
			.eq('lesson_id', orgASharedLessonId)
			.maybeSingle();
		expect(version.data?.id).toBeTruthy();

		const scoreAsUserB = await userBClient
			.from('scores')
			.select('id')
			.eq('lesson_version_id', version.data!.id)
			.maybeSingle();
		expect(scoreAsUserB.data).toBeNull();
	});

	it('a non-admin (org B) cannot feature a lesson in org A', async () => {
		await userBClient.from('lessons').update({ featured: true }).eq('id', orgASharedLessonId);
		// RLS makes the update match zero rows rather than erroring — verify nothing changed.
		const stillUnfeatured = await admin
			.from('lessons')
			.select('featured')
			.eq('id', orgASharedLessonId)
			.single();
		expect(stillUnfeatured.data?.featured).toBe(false);
	});

	it("a user cannot insert a lesson claiming another org's id as org_id", async () => {
		const { error } = await userBClient.from('lessons').insert({
			owner_id: userBId,
			org_id: orgAId,
			title: 'Spoofed org lesson',
			subject_profile_id: 'science-lab',
			visibility: 'private'
		});
		expect(error).not.toBeNull();
	});

	// --- Prompt 11 (security review) — a few more adversarial cases, not
	// just the read-path ones above.

	it("org B's user cannot rename org A's private lesson via a direct UPDATE", async () => {
		await userBClient
			.from('lessons')
			.update({ title: 'Renamed by an attacker' })
			.eq('id', orgAPrivateLessonId);
		const stillOriginalTitle = await admin
			.from('lessons')
			.select('title')
			.eq('id', orgAPrivateLessonId)
			.single();
		expect(stillOriginalTitle.data?.title).toBe('Org A private lesson');
	});

	it("org B cannot list org A's pending invites", async () => {
		const inviteEmail = emailFor('never-invited');
		const created = await userAClient
			.from('org_invites')
			.insert({ org_id: orgAId, email: inviteEmail, role: 'teacher', invited_by: userAId })
			.select('id')
			.single();
		expect(created.data?.id).toBeTruthy();

		const asOrgB = await userBClient.from('org_invites').select('id').eq('org_id', orgAId);
		expect(asOrgB.data).toEqual([]);

		const asAdmin = await userAClient.from('org_invites').select('id').eq('org_id', orgAId);
		expect(asAdmin.data?.length).toBeGreaterThan(0);
	});

	it('accept_org_invite rejects a guessed/nonexistent token rather than joining any org', async () => {
		const { error } = await outsiderClient.rpc('accept_org_invite', {
			invite_token: randomUUID()
		});
		expect(error).not.toBeNull();

		const membership = await admin
			.from('memberships')
			.select('id')
			.eq('user_id', outsiderId)
			.maybeSingle();
		expect(membership.data).toBeNull();
	});

	it('copy_lesson refuses to copy a lesson the caller cannot see', async () => {
		const { error, data } = await userBClient.rpc('copy_lesson', {
			source_lesson_id: orgAPrivateLessonId
		});
		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	// --- prompts.txt Prompt A — profiles email-exposure fix (ADR-012).
	// See supabase/migrations/0007.

	it("org B's user cannot read org A user's email via a direct profiles query", async () => {
		const direct = await userBClient.from('profiles').select('id, email').eq('id', userAId!);
		// RLS now scopes profiles' SELECT policy to id = auth.uid() — a
		// query for someone else's row matches zero rows, it isn't an error.
		expect(direct.data).toEqual([]);
	});

	it('a user can still read their own email via a direct profiles query', async () => {
		const own = await userAClient
			.from('profiles')
			.select('id, email')
			.eq('id', userAId!)
			.maybeSingle();
		expect(own.data?.id).toBe(userAId);
		expect(own.data?.email).toBeTruthy();
	});

	it("profiles_public still returns display_name for another org's user (by design — not the leak)", async () => {
		const crossOrg = await userBClient
			.from('profiles_public')
			.select('id, display_name')
			.eq('id', userAId!)
			.maybeSingle();
		expect(crossOrg.data?.id).toBe(userAId);
		expect(crossOrg.data?.display_name).toBeTruthy();
	});

	it('profiles_public never exposes an email column at all', async () => {
		// Not just "didn't select it" — the view itself has no such column,
		// so asking for it is a query error, not a silently-omitted field.
		const { error } = await userBClient
			.from('profiles_public')
			.select('id, email')
			.eq('id', userAId!)
			.maybeSingle();
		expect(error).not.toBeNull();
	});

	it('the org member list embed resolves through profiles_public, not profiles', async () => {
		const members = await userAClient
			.from('memberships')
			.select('id, profiles_public(display_name)')
			.eq('org_id', orgAId);
		expect(members.error).toBeNull();
		expect(members.data?.length).toBeGreaterThan(0);
		expect(members.data?.[0]).toHaveProperty('profiles_public');
	});

	// --- prompts.txt Prompt 14 — re-confirms Prompt A's fix against the
	// one embed site (library lesson-author display) Prompt A's own tests
	// didn't separately exercise (only the org member list was tested).

	it('the library lesson-author embed resolves through profiles_public too', async () => {
		const asOutsider = await outsiderClient
			.from('lessons')
			.select('id, profiles_public(display_name)')
			.eq('id', publicTemplateLessonId)
			.maybeSingle()
			.returns<{ id: string; profiles_public: { display_name: string } | null }>();
		expect(asOutsider.error).toBeNull();
		expect(asOutsider.data).toHaveProperty('profiles_public');
		expect(asOutsider.data?.profiles_public?.display_name).toBeTruthy();
	});
});
