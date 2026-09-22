/**
 * Adversarial + behavioral tests for org member management (`prompt.txt`
 * Prompt F4: remove_member, change_member_role, leave_org —
 * supabase/migrations/0020_org_member_management.sql). Runs against the
 * REAL live Supabase project, not a mock — RLS/SECURITY DEFINER
 * correctness isn't meaningfully testable against a mock, per
 * docs/ARCHITECTURE.md Section 8, matching every other file in this
 * directory. Skipped (not failed) when Supabase isn't configured.
 *
 * A fixed pool of 5 real users is created once in beforeAll and reused
 * across every test, rather than creating fresh users per test — an
 * earlier version of this file did that and reliably hit Supabase's own
 * auth rate limit ("AuthApiError: Request rate limit reached" from
 * signInWithPassword) once the file grew past a dozen tests each
 * creating 2-4 users. Each test instead creates its own fresh *org*
 * (cheap — admin-API only, no auth rate limit) and adds pool members to
 * it directly; afterEach deletes every org created that test (cascades
 * memberships), so a pool user's `memberships.user_id` uniqueness never
 * blocks the next test from adding them to a new org. Pool users
 * themselves are torn down once in the final afterAll.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { ctSkillIds } from '$lib/domain/taxonomy';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

describe.skipIf(!hasSupabase)('Org member management (live Supabase, adversarial)', () => {
	let url: string;
	let anonKey: string;
	let admin: SupabaseClient;

	const runId = randomUUID().slice(0, 8);
	const poolUserIds: string[] = [];
	let ordersCreatedThisTest: string[] = [];

	type PoolUser = { id: string; client: SupabaseClient };
	let adminA: PoolUser;
	let adminB: PoolUser;
	let teacher1: PoolUser;
	let teacher2: PoolUser;
	let outsider: PoolUser;

	async function createPoolUser(label: string): Promise<PoolUser> {
		const email = `chiron-org-mgmt-test-${label}-${runId}@example.com`;
		const password = 'Test-Password-123!';
		const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
		if (created.error || !created.data.user) {
			throw created.error ?? new Error(`Failed to create user ${label}`);
		}
		poolUserIds.push(created.data.user.id);

		const client = createClient(url, anonKey, NO_PERSIST);
		const signIn = await client.auth.signInWithPassword({ email, password });
		if (signIn.error || !signIn.data.session) {
			throw signIn.error ?? new Error(`Sign-in for ${label} returned no session`);
		}
		return { id: created.data.user.id, client };
	}

	beforeAll(async () => {
		url = env.PUBLIC_SUPABASE_URL!;
		anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
		admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

		adminA = await createPoolUser('admin-a');
		adminB = await createPoolUser('admin-b');
		teacher1 = await createPoolUser('teacher-1');
		teacher2 = await createPoolUser('teacher-2');
		outsider = await createPoolUser('outsider');
	}, 30_000);

	afterEach(async () => {
		for (const id of ordersCreatedThisTest) await admin.from('orgs').delete().eq('id', id);
		ordersCreatedThisTest = [];
	});

	afterAll(async () => {
		for (const id of poolUserIds) await admin.auth.admin.deleteUser(id);
	});

	/** Creates an org (creator becomes its sole admin) and returns its id. */
	async function createOrg(creatorClient: SupabaseClient, name: string): Promise<string> {
		const { data, error } = await creatorClient.rpc('create_org', { org_name: name });
		if (error || !data) throw error ?? new Error('Failed to create org');
		const orgId = (data as { id: string }).id;
		ordersCreatedThisTest.push(orgId);
		return orgId;
	}

	/** Adds a member directly as the given role, bypassing the invite flow — setup only, not something the app exposes. */
	async function addMember(orgId: string, userId: string, role: 'admin' | 'teacher') {
		const { error } = await admin
			.from('memberships')
			.insert({ org_id: orgId, user_id: userId, role });
		if (error) throw error;
	}

	async function membershipRole(orgId: string, userId: string): Promise<string | null> {
		const { data } = await admin
			.from('memberships')
			.select('role')
			.eq('org_id', orgId)
			.eq('user_id', userId)
			.maybeSingle();
		return (data as { role: string } | null)?.role ?? null;
	}

	it('a non-admin member cannot remove another member', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-a`);
		await addMember(orgId, teacher1.id, 'teacher');
		await addMember(orgId, teacher2.id, 'teacher');

		const { error } = await teacher1.client.rpc('remove_member', { target_user_id: teacher2.id });
		expect(error).not.toBeNull();
		expect(await membershipRole(orgId, teacher2.id)).toBe('teacher');
	}, 15_000);

	it('a non-admin member cannot remove themselves via remove_member (elevated effect on self)', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-b`);
		await addMember(orgId, teacher1.id, 'teacher');

		const { error } = await teacher1.client.rpc('remove_member', { target_user_id: teacher1.id });
		expect(error).not.toBeNull();
		expect(await membershipRole(orgId, teacher1.id)).toBe('teacher');
	}, 15_000);

	it('a non-admin member cannot promote themselves to admin', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-c`);
		await addMember(orgId, teacher1.id, 'teacher');

		const { error } = await teacher1.client.rpc('change_member_role', {
			target_user_id: teacher1.id,
			new_role: 'admin'
		});
		expect(error).not.toBeNull();
		expect(await membershipRole(orgId, teacher1.id)).toBe('teacher');
	}, 15_000);

	it("a non-admin member cannot change another member's role", async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-d`);
		await addMember(orgId, teacher1.id, 'teacher');
		await addMember(orgId, teacher2.id, 'teacher');

		const { error } = await teacher1.client.rpc('change_member_role', {
			target_user_id: teacher2.id,
			new_role: 'admin'
		});
		expect(error).not.toBeNull();
		expect(await membershipRole(orgId, teacher2.id)).toBe('teacher');
	}, 15_000);

	it('an admin can remove another member, and their org-shared lesson stays in the org library', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-e`);
		await addMember(orgId, teacher1.id, 'teacher');

		const { data: lessonId, error: lessonError } = await teacher1.client.rpc('save_lesson', {
			p_title: 'Shared by departing teacher',
			p_subject_profile_id: 'science-lab',
			p_grade_level: null,
			p_visibility: 'org-shared',
			p_org_id: orgId,
			p_source: 'paste',
			p_raw_text: 'Some lesson text for the org-member-management adversarial test.',
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
		if (lessonError || !lessonId) throw lessonError ?? new Error('Failed to create lesson');

		const { error } = await adminA.client.rpc('remove_member', { target_user_id: teacher1.id });
		expect(error).toBeNull();
		expect(await membershipRole(orgId, teacher1.id)).toBeNull();

		// The lesson itself is untouched by the membership deletion (neither
		// lessons.owner_id nor lessons.org_id references memberships), and
		// the org-shared SELECT policy checks the *viewer's* own org, not
		// the lesson owner's — so it should still be there, still org-shared,
		// still visible to the remaining admin.
		const { data: lesson } = await admin
			.from('lessons')
			.select('id, visibility, org_id')
			.eq('id', lessonId as string)
			.single();
		expect(lesson?.visibility).toBe('org-shared');
		expect(lesson?.org_id).toBe(orgId);

		const { data: visibleToAdmin } = await adminA.client
			.from('lessons')
			.select('id')
			.eq('id', lessonId as string)
			.maybeSingle();
		expect(visibleToAdmin?.id).toBe(lessonId);

		// Clean up the lesson directly — it isn't cascaded away by the org
		// deletion this file's afterEach does (lessons.org_id is ON DELETE
		// SET NULL, not CASCADE, by design — see migration 0001).
		await admin
			.from('lessons')
			.delete()
			.eq('id', lessonId as string);
	}, 20_000);

	it('an admin can promote a teacher and demote another admin, when the org has more than one admin', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-f`);
		await addMember(orgId, adminB.id, 'admin');
		await addMember(orgId, teacher1.id, 'teacher');

		const promoted = await adminA.client.rpc('change_member_role', {
			target_user_id: teacher1.id,
			new_role: 'admin'
		});
		expect(promoted.error).toBeNull();
		expect(await membershipRole(orgId, teacher1.id)).toBe('admin');

		// Org now has three admins (adminA, adminB, teacher1-now-admin) —
		// demoting adminB is safe, not the sole-admin case.
		const demoted = await adminA.client.rpc('change_member_role', {
			target_user_id: adminB.id,
			new_role: 'teacher'
		});
		expect(demoted.error).toBeNull();
		expect(await membershipRole(orgId, adminB.id)).toBe('teacher');
		expect(await membershipRole(orgId, adminA.id)).toBe('admin');
	}, 20_000);

	it('an admin cannot remove or demote a member of a different org', async () => {
		await createOrg(adminA.client, `Org ${runId}-g`);
		const orgBId = await createOrg(adminB.client, `Org ${runId}-h`);
		await addMember(orgBId, teacher1.id, 'teacher');

		const removeResult = await adminA.client.rpc('remove_member', {
			target_user_id: teacher1.id
		});
		expect(removeResult.error).not.toBeNull();

		const roleResult = await adminA.client.rpc('change_member_role', {
			target_user_id: teacher1.id,
			new_role: 'admin'
		});
		expect(roleResult.error).not.toBeNull();

		expect(await membershipRole(orgBId, teacher1.id)).toBe('teacher');
	}, 20_000);

	it('a sole admin cannot remove themselves', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-i`);

		const { error } = await adminA.client.rpc('remove_member', { target_user_id: adminA.id });
		expect(error).not.toBeNull();
		expect(error?.message).toMatch(/only admin/i);
		expect(await membershipRole(orgId, adminA.id)).toBe('admin');
	}, 15_000);

	it('a sole admin cannot demote themselves to teacher', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-j`);

		const { error } = await adminA.client.rpc('change_member_role', {
			target_user_id: adminA.id,
			new_role: 'teacher'
		});
		expect(error).not.toBeNull();
		expect(error?.message).toMatch(/only admin/i);
		expect(await membershipRole(orgId, adminA.id)).toBe('admin');
	}, 15_000);

	it('a sole admin cannot leave the org', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-k`);

		const { error } = await adminA.client.rpc('leave_org');
		expect(error).not.toBeNull();
		expect(error?.message).toMatch(/only admin/i);
		expect(await membershipRole(orgId, adminA.id)).toBe('admin');
	}, 15_000);

	it('a non-sole-admin member (teacher, or admin with a co-admin) can leave the org', async () => {
		const orgId = await createOrg(adminA.client, `Org ${runId}-l`);
		await addMember(orgId, teacher1.id, 'teacher');

		const { error } = await teacher1.client.rpc('leave_org');
		expect(error).toBeNull();
		expect(await membershipRole(orgId, teacher1.id)).toBeNull();
	}, 15_000);

	it('a user with no org membership gets a clear error from leave_org, not a silent no-op', async () => {
		const { error } = await outsider.client.rpc('leave_org');
		expect(error).not.toBeNull();
		expect(error?.message).toMatch(/not a member/i);
	}, 15_000);

	it('change_member_role rejects an invalid role value', async () => {
		await createOrg(adminA.client, `Org ${runId}-m`);

		const { error } = await adminA.client.rpc('change_member_role', {
			target_user_id: adminA.id,
			new_role: 'superadmin'
		});
		expect(error).not.toBeNull();
	}, 15_000);
});
