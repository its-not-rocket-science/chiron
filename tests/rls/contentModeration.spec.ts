/**
 * Adversarial + behavioral tests for Chiron-level content moderation
 * (`prompt.txt` Prompt G4: chiron_moderators, lesson_reports,
 * moderation_actions, is_chiron_moderator(), unpublish_lesson(),
 * resolve_lesson_report() — supabase/migrations/0021_content_moderation.sql).
 * Runs against the REAL live Supabase project, not a mock — RLS/SECURITY
 * DEFINER correctness isn't meaningfully testable against a mock, per
 * docs/ARCHITECTURE.md Section 8, matching every other file in this
 * directory. Skipped (not failed) when Supabase isn't configured.
 *
 * A fixed pool of users is created once in beforeAll and reused across
 * tests (matching tests/rls/orgMemberManagement.spec.ts's own fix for
 * hitting Supabase's auth rate limit with fresh-user-per-test); each test
 * creates its own fresh lesson (cheap — a real RPC call, no auth rate
 * limit) and cleans it up in afterEach.
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

describe.skipIf(!hasSupabase)('Content moderation (live Supabase, adversarial)', () => {
	let url: string;
	let anonKey: string;
	let admin: SupabaseClient;

	const runId = randomUUID().slice(0, 8);
	const poolUserIds: string[] = [];
	let lessonIdsCreatedThisTest: string[] = [];

	type PoolUser = { id: string; client: SupabaseClient };
	let moderator: PoolUser;
	let orgAdmin: PoolUser; // an org admin, deliberately NOT a chiron moderator
	let teacher: PoolUser; // an ordinary user, owns the lessons under test
	let reporter: PoolUser; // an ordinary user, reports lessons

	async function createPoolUser(label: string): Promise<PoolUser> {
		const email = `chiron-moderation-test-${label}-${runId}@example.com`;
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

		moderator = await createPoolUser('moderator');
		orgAdmin = await createPoolUser('org-admin');
		teacher = await createPoolUser('teacher');
		reporter = await createPoolUser('reporter');

		// Grant moderator status the only way it can be granted: a direct
		// service-role write (no client-facing insert policy exists on
		// chiron_moderators at all — see the migration's own comment).
		const grant = await admin.from('chiron_moderators').insert({ user_id: moderator.id });
		if (grant.error) throw grant.error;

		// orgAdmin becomes an admin of their own org — proves org-admin
		// status alone confers no moderator capability.
		const org = await orgAdmin.client.rpc('create_org', {
			org_name: `Moderation Test Org ${runId}`
		});
		if (org.error) throw org.error;
	}, 30_000);

	afterEach(async () => {
		for (const id of lessonIdsCreatedThisTest) await admin.from('lessons').delete().eq('id', id);
		lessonIdsCreatedThisTest = [];
	});

	afterAll(async () => {
		await admin.from('chiron_moderators').delete().eq('user_id', moderator.id);
		for (const id of poolUserIds) await admin.auth.admin.deleteUser(id);
	});

	async function createPublicTemplateLesson(owner: PoolUser, title: string): Promise<string> {
		const { data, error } = await owner.client.rpc('save_lesson', {
			p_title: title,
			p_subject_profile_id: 'science-lab',
			p_grade_level: null,
			p_visibility: 'public-template',
			p_org_id: null,
			p_source: 'paste',
			p_raw_text: 'Some lesson text for the content-moderation adversarial test.',
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
		if (error || !data) throw error ?? new Error('Failed to create lesson fixture');
		const lessonId = data as string;
		lessonIdsCreatedThisTest.push(lessonId);
		return lessonId;
	}

	async function lessonVisibility(lessonId: string): Promise<string | null> {
		const { data } = await admin.from('lessons').select('visibility').eq('id', lessonId).single();
		return (data as { visibility: string } | null)?.visibility ?? null;
	}

	it('an ordinary user cannot unpublish a public-template lesson', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Ordinary user cannot unpublish');

		const { error } = await teacher.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: 'trying to self-moderate'
		});

		expect(error).not.toBeNull();
		expect(await lessonVisibility(lessonId)).toBe('public-template');
	}, 20_000);

	it('an org admin who is not also a Chiron moderator cannot unpublish a lesson — no conflation with is_org_admin()', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Org admin is not a moderator');

		const { error } = await orgAdmin.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: 'org admins should not be able to do this'
		});

		expect(error).not.toBeNull();
		expect(await lessonVisibility(lessonId)).toBe('public-template');
	}, 20_000);

	it('the moderator capability cannot be self-granted through any exposed path (no insert policy exists)', async () => {
		const selfGrant = await teacher.client.from('chiron_moderators').insert({
			user_id: teacher.id
		});
		expect(selfGrant.error).not.toBeNull();

		// Confirm it didn't silently work despite the error shape.
		const check = await admin
			.from('chiron_moderators')
			.select('user_id')
			.eq('user_id', teacher.id)
			.maybeSingle();
		expect(check.data).toBeNull();

		// Also try granting it to someone else, in case the policy gap
		// were narrower than "no insert at all."
		const grantOther = await orgAdmin.client
			.from('chiron_moderators')
			.insert({ user_id: reporter.id });
		expect(grantOther.error).not.toBeNull();
	}, 15_000);

	it('a Chiron moderator can unpublish a public-template lesson with a reason, logged in moderation_actions', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Moderator can unpublish');

		const { error } = await moderator.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: 'Contains content not appropriate for a lesson-plan sharing feature.'
		});

		expect(error).toBeNull();
		expect(await lessonVisibility(lessonId)).toBe('private');

		const { data: logRow } = await admin
			.from('moderation_actions')
			.select('lesson_id, lesson_title, moderator_id, action, reason')
			.eq('lesson_id', lessonId)
			.single();
		expect(logRow).toMatchObject({
			lesson_id: lessonId,
			lesson_title: 'Moderator can unpublish',
			moderator_id: moderator.id,
			action: 'unpublish',
			reason: 'Contains content not appropriate for a lesson-plan sharing feature.'
		});
	}, 20_000);

	it('unpublish_lesson requires a non-empty reason, even for a moderator', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Requires a reason');

		const { error } = await moderator.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: '   '
		});

		expect(error).not.toBeNull();
		expect(await lessonVisibility(lessonId)).toBe('public-template');
	}, 20_000);

	it('unpublish_lesson rejects a lesson that is not currently a public template', async () => {
		const { data: lessonId, error: createError } = await teacher.client.rpc('save_lesson', {
			p_title: 'Already private',
			p_subject_profile_id: 'science-lab',
			p_grade_level: null,
			p_visibility: 'private',
			p_org_id: null,
			p_source: 'paste',
			p_raw_text: 'Some private lesson text.',
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
		if (createError || !lessonId) throw createError ?? new Error('Failed to create lesson');
		lessonIdsCreatedThisTest.push(lessonId as string);

		const { error } = await moderator.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: 'should be rejected'
		});

		expect(error).not.toBeNull();
		expect(error?.message).toMatch(/not a public template/i);
	}, 20_000);

	it('any signed-in user can report a public-template lesson, but only a moderator can read reports', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Reportable lesson');

		const report = await reporter.client
			.from('lesson_reports')
			.insert({ lesson_id: lessonId, reporter_id: reporter.id, reason: 'inappropriate content' });
		expect(report.error).toBeNull();

		// The reporter themselves cannot read reports back (including
		// their own) — only moderators have a SELECT policy on this
		// table. Proves reports are private from ordinary users, not
		// just conveniently un-surfaced in the UI.
		const asReporter = await reporter.client
			.from('lesson_reports')
			.select('id')
			.eq('lesson_id', lessonId);
		expect(asReporter.data ?? []).toHaveLength(0);

		const asModerator = await moderator.client
			.from('lesson_reports')
			.select('id, reason, lesson_id')
			.eq('lesson_id', lessonId);
		expect(asModerator.data).toHaveLength(1);
		expect(asModerator.data?.[0].reason).toBe('inappropriate content');
	}, 20_000);

	it('a non-moderator cannot resolve a report; a moderator can dismiss one without unpublishing', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Report to dismiss');
		const inserted = await admin
			.from('lesson_reports')
			.insert({ lesson_id: lessonId, reporter_id: reporter.id, reason: 'minor concern' })
			.select('id')
			.single();
		if (inserted.error || !inserted.data) throw inserted.error ?? new Error('Setup failed');
		const reportId = inserted.data.id as string;

		const asOrdinary = await teacher.client.rpc('resolve_lesson_report', {
			target_report_id: reportId
		});
		expect(asOrdinary.error).not.toBeNull();

		const asModerator = await moderator.client.rpc('resolve_lesson_report', {
			target_report_id: reportId
		});
		expect(asModerator.error).toBeNull();

		// Dismissing a report never touches the lesson itself.
		expect(await lessonVisibility(lessonId)).toBe('public-template');

		const { data: resolved } = await admin
			.from('lesson_reports')
			.select('resolved_at, resolved_by')
			.eq('id', reportId)
			.single();
		expect(resolved?.resolved_at).not.toBeNull();
		expect(resolved?.resolved_by).toBe(moderator.id);

		// Resolving an already-resolved report is rejected, not a silent no-op.
		const again = await moderator.client.rpc('resolve_lesson_report', {
			target_report_id: reportId
		});
		expect(again.error).not.toBeNull();
	}, 20_000);

	it('unpublishing a lesson auto-resolves any open reports against it', async () => {
		const lessonId = await createPublicTemplateLesson(teacher, 'Unpublish auto-resolves reports');
		const inserted = await admin
			.from('lesson_reports')
			.insert({ lesson_id: lessonId, reporter_id: reporter.id, reason: 'should get auto-resolved' })
			.select('id')
			.single();
		if (inserted.error || !inserted.data) throw inserted.error ?? new Error('Setup failed');
		const reportId = inserted.data.id as string;

		const { error } = await moderator.client.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: 'resolving the open report by unpublishing'
		});
		expect(error).toBeNull();

		const { data: resolved } = await admin
			.from('lesson_reports')
			.select('resolved_at, resolved_by')
			.eq('id', reportId)
			.single();
		expect(resolved?.resolved_at).not.toBeNull();
		expect(resolved?.resolved_by).toBe(moderator.id);
	}, 20_000);

	it('is_chiron_moderator() correctly distinguishes the moderator from everyone else in the pool', async () => {
		const modCheck = await moderator.client.rpc('is_chiron_moderator');
		expect(modCheck.data).toBe(true);

		for (const nonModerator of [orgAdmin, teacher, reporter]) {
			const check = await nonModerator.client.rpc('is_chiron_moderator');
			expect(check.data).toBe(false);
		}
	}, 20_000);
});
