/**
 * Adversarial test for `get_org_score_benchmark()` (prompts.txt Prompt
 * P6): proves a caller only ever sees their own org's aggregate, and
 * that there's no way to pass or coerce the function into returning
 * another org's data — it takes zero arguments, so "coercing" it means
 * attempting to call it WITH an argument and confirming that fails
 * rather than silently being accepted as a filter. Runs against the
 * REAL live Supabase project, same pattern as orgIsolation.spec.ts —
 * RLS/SECURITY DEFINER correctness isn't meaningfully testable against
 * a mock (docs/ARCHITECTURE.md Section 8, ADR-010).
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

interface OrgBenchmarkRow {
	dialogue_avg: number | null;
	authenticity_avg: number | null;
	mentoring_avg: number | null;
	lesson_count: number;
}

async function createScoredLesson(
	client: SupabaseClient,
	opts: {
		orgId: string;
		dialogueScore: number;
		authenticityScore: number;
		mentoringScore: number;
	}
): Promise<string> {
	const { data, error } = await client.rpc('save_lesson', {
		p_title: `Benchmark test lesson ${randomUUID().slice(0, 8)}`,
		p_subject_profile_id: 'science-lab',
		p_grade_level: null,
		p_visibility: 'org-shared',
		p_org_id: opts.orgId,
		p_source: 'paste',
		p_raw_text: 'Some lesson text used for the org benchmark adversarial test.',
		p_dialogue_score: opts.dialogueScore,
		p_dialogue_justification: 'x',
		p_authenticity_score: opts.authenticityScore,
		p_authenticity_justification: 'x',
		p_mentoring_score: opts.mentoringScore,
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
	if (error || !data) throw error ?? new Error('Failed to create scored lesson fixture');
	return data as string;
}

describe.skipIf(!hasSupabase)('RLS — org score benchmark (adversarial, live Supabase)', () => {
	let admin: SupabaseClient;
	let orgA1Client: SupabaseClient;
	let orgA2Client: SupabaseClient;
	let orgB1Client: SupabaseClient;
	let orgB2Client: SupabaseClient;
	let outsiderClient: SupabaseClient;

	let orgAId: string;
	let orgBId: string;
	let orgA1Id: string | undefined;
	let orgA2Id: string | undefined;
	let orgB1Id: string | undefined;
	let orgB2Id: string | undefined;
	let outsiderId: string | undefined;

	const runId = randomUUID().slice(0, 8);
	const emailFor = (label: string) => `chiron-benchmark-test-${label}-${runId}@example.com`;
	const password = 'Test-Password-123!';

	beforeAll(async () => {
		const url = env.PUBLIC_SUPABASE_URL!;
		const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
		admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

		async function makeUser(label: string) {
			const { data, error } = await admin.auth.admin.createUser({
				email: emailFor(label),
				password,
				email_confirm: true
			});
			if (error || !data.user) throw error ?? new Error(`Failed to create ${label}`);
			const client = createClient(url, anonKey, NO_PERSIST);
			await client.auth.signInWithPassword({ email: emailFor(label), password });
			return { id: data.user.id, client };
		}

		const orgA1 = await makeUser('org-a-1');
		orgA1Id = orgA1.id;
		orgA1Client = orgA1.client;

		const orgA2 = await makeUser('org-a-2');
		orgA2Id = orgA2.id;
		orgA2Client = orgA2.client;

		const orgB1 = await makeUser('org-b-1');
		orgB1Id = orgB1.id;
		orgB1Client = orgB1.client;

		const orgB2 = await makeUser('org-b-2');
		orgB2Id = orgB2.id;
		orgB2Client = orgB2.client;

		const outsider = await makeUser('outsider');
		outsiderId = outsider.id;
		outsiderClient = outsider.client;

		const orgA = await orgA1Client.rpc('create_org', { org_name: `Benchmark Test Org A ${runId}` });
		if (orgA.error || !orgA.data) throw orgA.error ?? new Error('Failed to create org A');
		orgAId = (orgA.data as { id: string }).id;

		const orgB = await orgB1Client.rpc('create_org', { org_name: `Benchmark Test Org B ${runId}` });
		if (orgB.error || !orgB.data) throw orgB.error ?? new Error('Failed to create org B');
		orgBId = (orgB.data as { id: string }).id;

		// Admin-inserted membership, not the invite flow — this test is about
		// the benchmark function, not invite acceptance, and the >= 2
		// distinct-owner threshold in get_org_score_benchmark() needs a
		// second real member per org to produce non-null averages.
		const { error: membershipAError } = await admin
			.from('memberships')
			.insert({ user_id: orgA2Id, org_id: orgAId, role: 'teacher' });
		if (membershipAError) throw membershipAError;

		const { error: membershipBError } = await admin
			.from('memberships')
			.insert({ user_id: orgB2Id, org_id: orgBId, role: 'teacher' });
		if (membershipBError) throw membershipBError;

		// Org A: scores average to dialogue=2, authenticity=2, mentoring=2.
		await createScoredLesson(orgA1Client, {
			orgId: orgAId,
			dialogueScore: 3,
			authenticityScore: 3,
			mentoringScore: 3
		});
		await createScoredLesson(orgA2Client, {
			orgId: orgAId,
			dialogueScore: 1,
			authenticityScore: 1,
			mentoringScore: 1
		});

		// Org B: scores average to dialogue=3, authenticity=0, mentoring=0 —
		// deliberately distinct from org A's averages on every pillar, so a
		// leak would be unmistakable rather than a coincidental match.
		await createScoredLesson(orgB1Client, {
			orgId: orgBId,
			dialogueScore: 3,
			authenticityScore: 0,
			mentoringScore: 0
		});
		await createScoredLesson(orgB2Client, {
			orgId: orgBId,
			dialogueScore: 3,
			authenticityScore: 0,
			mentoringScore: 0
		});
	}, 30_000);

	afterAll(async () => {
		if (orgAId) await admin.from('orgs').delete().eq('id', orgAId);
		if (orgBId) await admin.from('orgs').delete().eq('id', orgBId);
		if (orgA1Id) await admin.auth.admin.deleteUser(orgA1Id);
		if (orgA2Id) await admin.auth.admin.deleteUser(orgA2Id);
		if (orgB1Id) await admin.auth.admin.deleteUser(orgB1Id);
		if (orgB2Id) await admin.auth.admin.deleteUser(orgB2Id);
		if (outsiderId) await admin.auth.admin.deleteUser(outsiderId);
	});

	it("an org A member's benchmark reflects only org A's scores", async () => {
		const { data, error } = await orgA1Client.rpc('get_org_score_benchmark');
		expect(error).toBeNull();
		const row = (data as OrgBenchmarkRow[])[0];
		expect(row.lesson_count).toBe(2);
		expect(row.dialogue_avg).toBe(2);
		expect(row.authenticity_avg).toBe(2);
		expect(row.mentoring_avg).toBe(2);
	});

	it("an org B member's benchmark reflects only org B's scores, never org A's", async () => {
		const { data, error } = await orgB1Client.rpc('get_org_score_benchmark');
		expect(error).toBeNull();
		const row = (data as OrgBenchmarkRow[])[0];
		expect(row.lesson_count).toBe(2);
		expect(row.dialogue_avg).toBe(3);
		expect(row.authenticity_avg).toBe(0);
		expect(row.mentoring_avg).toBe(0);
	});

	it("an outsider with no org membership gets an empty aggregate, never another org's data", async () => {
		const { data, error } = await outsiderClient.rpc('get_org_score_benchmark');
		expect(error).toBeNull();
		const row = (data as OrgBenchmarkRow[])[0];
		expect(row.lesson_count).toBe(0);
		expect(row.dialogue_avg).toBeNull();
		expect(row.authenticity_avg).toBeNull();
		expect(row.mentoring_avg).toBeNull();
	});

	it('there is no org_id parameter to pass — calling with one is rejected, not silently applied', async () => {
		const asOutsider = await outsiderClient.rpc('get_org_score_benchmark', { org_id: orgAId });
		expect(asOutsider.error).not.toBeNull();

		const asOrgB = await orgB1Client.rpc('get_org_score_benchmark', { org_id: orgAId });
		expect(asOrgB.error).not.toBeNull();
	});
});
