/**
 * Adversarial tests for the lesson-detail route (prompt.txt Prompt D2):
 * a non-owner must get a 403/404 rather than the lesson's content or
 * write access, on both the page load and the underlying API/RPC calls —
 * checked at every layer (RLS, the route's own explicit ownership
 * checks, and the add_lesson_version RPC's own check), not just one.
 * Runs against the REAL live Supabase project, same rationale as
 * tests/rls/orgIsolation.spec.ts. Skipped (not failed) when Supabase
 * isn't configured. Requires migration
 * supabase/migrations/0019_add_lesson_version.sql to have been applied.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { ctSkillIds } from '$lib/domain/taxonomy';
import { load, actions } from '../../src/routes/lessons/[id]/+page.server';
import { POST as revise } from '../../src/routes/api/lessons/[id]/revise/+server';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

async function createLessonFixture(
	client: SupabaseClient,
	opts: { title: string; visibility: 'private' | 'public-template' }
): Promise<string> {
	const { data, error } = await client.rpc('save_lesson', {
		p_title: opts.title,
		p_subject_profile_id: 'science-lab',
		p_grade_level: null,
		p_visibility: opts.visibility,
		p_org_id: null,
		p_source: 'paste',
		p_raw_text: 'Some lesson text used for a D2 adversarial test.',
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

function fakeLoadEvent(
	id: string,
	user: { id: string; email: string | null },
	supabase: SupabaseClient
) {
	return {
		params: { id },
		locals: { user, supabase }
	} as unknown as Parameters<typeof load>[0];
}

function fakeDeleteEvent(
	id: string,
	user: { id: string; email: string | null },
	supabase: SupabaseClient
) {
	return {
		params: { id },
		locals: { user, supabase },
		request: new Request('http://localhost/x', { method: 'POST' })
	} as unknown as Parameters<typeof actions.delete>[0];
}

function fakeReviseEvent(
	id: string,
	user: { id: string; email: string | null },
	supabase: SupabaseClient,
	body: unknown
) {
	return {
		params: { id },
		locals: { user, supabase },
		request: new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		})
	} as unknown as Parameters<typeof revise>[0];
}

describe.skipIf(!hasSupabase)('RLS — lesson detail access (adversarial, live Supabase)', () => {
	let admin: SupabaseClient;
	let ownerClient: SupabaseClient;
	let otherClient: SupabaseClient;
	let ownerId: string | undefined;
	let otherId: string | undefined;

	let privateLessonId: string;
	let publicLessonId: string;

	const runId = randomUUID().slice(0, 8);
	const emailFor = (label: string) => `chiron-rls-test-lesson-detail-${label}-${runId}@example.com`;
	const password = 'Test-Password-123!';

	beforeAll(async () => {
		const url = env.PUBLIC_SUPABASE_URL!;
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
		admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

		const owner = await admin.auth.admin.createUser({
			email: emailFor('owner'),
			password,
			email_confirm: true
		});
		if (owner.error || !owner.data.user) throw owner.error ?? new Error('Failed to create owner');
		ownerId = owner.data.user.id;

		const other = await admin.auth.admin.createUser({
			email: emailFor('other'),
			password,
			email_confirm: true
		});
		if (other.error || !other.data.user)
			throw other.error ?? new Error('Failed to create other user');
		otherId = other.data.user.id;

		ownerClient = createClient(url, anonKey, NO_PERSIST);
		await ownerClient.auth.signInWithPassword({ email: emailFor('owner'), password });

		otherClient = createClient(url, anonKey, NO_PERSIST);
		await otherClient.auth.signInWithPassword({ email: emailFor('other'), password });

		privateLessonId = await createLessonFixture(ownerClient, {
			title: `D2 RLS private ${runId}`,
			visibility: 'private'
		});
		publicLessonId = await createLessonFixture(ownerClient, {
			title: `D2 RLS public ${runId}`,
			visibility: 'public-template'
		});
	}, 30_000);

	afterAll(async () => {
		if (privateLessonId) await admin.from('lessons').delete().eq('id', privateLessonId);
		if (publicLessonId) await admin.from('lessons').delete().eq('id', publicLessonId);
		if (ownerId) await admin.auth.admin.deleteUser(ownerId);
		if (otherId) await admin.auth.admin.deleteUser(otherId);
	});

	it('the owner can load their own private lesson, with isOwner true', async () => {
		const result = (await load(
			fakeLoadEvent(privateLessonId, { id: ownerId!, email: null }, ownerClient)
		)) as { lesson: { id: string }; isOwner: boolean };
		expect(result.lesson.id).toBe(privateLessonId);
		expect(result.isOwner).toBe(true);
	});

	it('a non-owner loading another user’s PRIVATE lesson gets a 404, not its content (RLS hides the row entirely)', async () => {
		await expect(
			load(fakeLoadEvent(privateLessonId, { id: otherId!, email: null }, otherClient))
		).rejects.toMatchObject({ status: 404 });
	});

	it('a non-owner CAN load a public-template lesson (read access respected) but isOwner is false', async () => {
		const result = (await load(
			fakeLoadEvent(publicLessonId, { id: otherId!, email: null }, otherClient)
		)) as { lesson: { id: string }; isOwner: boolean };
		expect(result.lesson.id).toBe(publicLessonId);
		expect(result.isOwner).toBe(false);
	});

	it('a non-owner cannot delete another user’s lesson via the delete action, even a public-template one they can read', async () => {
		const result = (await actions.delete(
			fakeDeleteEvent(publicLessonId, { id: otherId!, email: null }, otherClient)
		)) as unknown as { status: number; data: { error: string } };
		expect(result.status).toBe(403);

		// Still there afterward, proving the action didn't just fail to
		// report an error while actually deleting it.
		const { data: stillExists } = await admin
			.from('lessons')
			.select('id')
			.eq('id', publicLessonId)
			.maybeSingle();
		expect(stillExists?.id).toBe(publicLessonId);
	});

	it('a non-owner cannot revise another user’s lesson via the revise API route, even a public-template one they can read', async () => {
		const response = await revise(
			fakeReviseEvent(publicLessonId, { id: otherId!, email: null }, otherClient, {
				subjectProfileId: 'science-lab',
				gradeLevel: null,
				source: 'paste',
				lessonText: 'A hostile rewrite attempt.',
				scoringResult: {
					score: {
						id: randomUUID(),
						lessonVersionId: randomUUID(),
						dialogueScore: 3,
						dialogueJustification: 'x',
						authenticityScore: 3,
						authenticityJustification: 'x',
						mentoringScore: 3,
						mentoringJustification: 'x',
						modelId: 'test-model',
						promptVersion: 'test-prompt-v1',
						createdAt: new Date().toISOString()
					},
					// ScoringResultSchema requires exactly 6 skillCoverage entries —
					// a genuinely valid body, so this test actually reaches (and
					// is blocked by) the ownership check, not zod's earlier 400.
					skillCoverage: ctSkillIds.map((skill) => ({
						id: randomUUID(),
						scoreId: randomUUID(),
						skill,
						covered: false,
						confidence: 'low' as const,
						justification: 'x'
					})),
					suggestions: []
				}
			})
		);
		expect(response.status).toBe(403);
	});

	it('the owner CAN revise their own lesson: add_lesson_version creates a new version and updates current_version_id', async () => {
		const { data: before } = await admin
			.from('lessons')
			.select('current_version_id')
			.eq('id', publicLessonId)
			.single();

		const { data: newVersionId, error } = await ownerClient.rpc('add_lesson_version', {
			p_lesson_id: publicLessonId,
			p_subject_profile_id: 'science-lab',
			p_grade_level: '9',
			p_source: 'paste',
			p_raw_text: 'A genuine revision by the real owner.',
			p_dialogue_score: 2,
			p_dialogue_justification: 'x',
			p_authenticity_score: 2,
			p_authenticity_justification: 'x',
			p_mentoring_score: 2,
			p_mentoring_justification: 'x',
			p_model_id: 'test-model',
			p_prompt_version: 'test-prompt-v1',
			p_skill_coverage: [],
			p_suggestions: []
		});
		expect(error).toBeNull();
		expect(newVersionId).toBeTruthy();
		expect(newVersionId).not.toBe(before?.current_version_id);

		const { data: after } = await admin
			.from('lessons')
			.select('current_version_id, grade_level')
			.eq('id', publicLessonId)
			.single();
		expect(after?.current_version_id).toBe(newVersionId);
		expect(after?.grade_level).toBe('9');

		const { data: versions } = await admin
			.from('lesson_versions')
			.select('id, version_number')
			.eq('lesson_id', publicLessonId)
			.order('version_number', { ascending: true });
		// Both the original save_lesson version and this new one still
		// exist — revising creates a new version, it never edits history
		// (matching lesson_versions/scores' append-only design, same
		// comment as the RLS policy file).
		expect(versions?.length).toBe(2);
		expect(versions?.[1].id).toBe(newVersionId);
	});

	it('a non-owner cannot call add_lesson_version directly against another user’s lesson either (RPC-level check, not just the route)', async () => {
		const { data, error } = await otherClient.rpc('add_lesson_version', {
			p_lesson_id: privateLessonId,
			p_subject_profile_id: 'science-lab',
			p_grade_level: null,
			p_source: 'paste',
			p_raw_text: 'A hostile rewrite attempt via the RPC directly.',
			p_dialogue_score: 3,
			p_dialogue_justification: 'x',
			p_authenticity_score: 3,
			p_authenticity_justification: 'x',
			p_mentoring_score: 3,
			p_mentoring_justification: 'x',
			p_model_id: 'test-model',
			p_prompt_version: 'test-prompt-v1',
			p_skill_coverage: [],
			p_suggestions: []
		});
		expect(error).not.toBeNull();
		expect(data).toBeNull();
	});

	it('the owner can delete their own lesson, cascading to its versions and scores', async () => {
		const toDelete = await createLessonFixture(ownerClient, {
			title: `D2 RLS delete-me ${runId}`,
			visibility: 'private'
		});
		const { data: version } = await admin
			.from('lessons')
			.select('current_version_id')
			.eq('id', toDelete)
			.single();

		// A successful delete throws a redirect (SvelteKit's `redirect()`) —
		// it surfaces here as a rejected promise carrying {status, location},
		// not a plain return value.
		await expect(
			actions.delete(fakeDeleteEvent(toDelete, { id: ownerId!, email: null }, ownerClient))
		).rejects.toMatchObject({ status: 303, location: '/lessons' });

		const { data: lessonRow } = await admin
			.from('lessons')
			.select('id')
			.eq('id', toDelete)
			.maybeSingle();
		expect(lessonRow).toBeNull();
		const { data: versionRow } = await admin
			.from('lesson_versions')
			.select('id')
			.eq('id', version!.current_version_id!)
			.maybeSingle();
		expect(versionRow).toBeNull();
	});
});
