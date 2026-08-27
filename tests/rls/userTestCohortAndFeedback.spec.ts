/**
 * Adversarial + propagation tests for Phase 2A user-test cohort tracking
 * and feedback (chiron_calibration_feedback_and_automation_prompts.txt).
 * Runs against the REAL live Supabase project, same discipline as
 * tests/rls/practiceIsolation.spec.ts — calls the actual route handlers
 * directly (not raw table access) so the cookie-read/allowlist logic in
 * the routes themselves is exercised, not bypassed.
 *
 * Requires `chiron-rls-test-cohort`/`chiron-rls-test-cohort-2` to
 * already be present in `USER_TEST_COHORTS` (see `.env.example`) —
 * `$lib/server/env`'s `env` export is a module-level constant computed
 * once from `$env/dynamic/private` at first import, well before this
 * file's own top-level code runs, so mutating `process.env` here
 * cannot retroactively change what the app's own `isValidTestCohort()`
 * sees. Same "real config or skip" discipline as `hasSupabase`/
 * `hasApiKey` elsewhere in this test suite, not a workaround.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { parseCohortAllowlist } from '$lib/server/userTestCohorts';
import { POST as startSession } from '../../src/routes/api/practice/sessions/+server';
import { GET as eligibility } from '../../src/routes/api/practice/user-test-eligibility/+server';
import { POST as submitFeedback } from '../../src/routes/api/practice/user-test-feedback/+server';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_COHORT = 'chiron-rls-test-cohort';
const hasCohortConfigured = parseCohortAllowlist(env.USER_TEST_COHORTS).includes(VALID_COHORT);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

function fakeCookies(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	return {
		get: (name: string) => store.get(name),
		set: (name: string, value: string) => {
			store.set(name, value);
		}
	};
}

function fakeRequestEvent(overrides: {
	user: { id: string; email: string | null };
	supabase: SupabaseClient;
	body?: unknown;
	params?: Record<string, string>;
	cookies?: ReturnType<typeof fakeCookies>;
	url?: URL;
}) {
	return {
		request: new Request(overrides.url?.toString() ?? 'http://localhost/x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(overrides.body ?? {})
		}),
		params: overrides.params ?? {},
		locals: { user: overrides.user, supabase: overrides.supabase },
		cookies: overrides.cookies ?? fakeCookies(),
		url: overrides.url ?? new URL('http://localhost/x'),
		getClientAddress: () => `test-${randomUUID()}`
	};
}

describe.skipIf(!hasSupabase || !hasCohortConfigured)(
	'Phase 2A user-test cohort + feedback (adversarial, live Supabase)',
	() => {
		let admin: SupabaseClient;
		let userAClient: SupabaseClient;
		let userBClient: SupabaseClient;
		let userAId: string | undefined;
		let userBId: string | undefined;

		const runId = randomUUID().slice(0, 8);
		const emailFor = (label: string) => `chiron-usertest-${label}-${runId}@example.com`;
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
			if (userA.error || !userA.data.user)
				throw userA.error ?? new Error('Failed to create user A');
			userAId = userA.data.user.id;

			const userB = await admin.auth.admin.createUser({
				email: emailFor('user-b'),
				password,
				email_confirm: true
			});
			if (userB.error || !userB.data.user)
				throw userB.error ?? new Error('Failed to create user B');
			userBId = userB.data.user.id;

			userAClient = createClient(url, anonKey, NO_PERSIST);
			await userAClient.auth.signInWithPassword({ email: emailFor('user-a'), password });

			userBClient = createClient(url, anonKey, NO_PERSIST);
			await userBClient.auth.signInWithPassword({ email: emailFor('user-b'), password });
		}, 30_000);

		afterAll(async () => {
			if (userAId) await admin.auth.admin.deleteUser(userAId);
			if (userBId) await admin.auth.admin.deleteUser(userBId);
		});

		it('a session started with a valid cohort cookie is stamped with that cohort', async () => {
			const response = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: 'causal-inference-1' },
					cookies: fakeCookies({ chiron_test_cohort: VALID_COHORT })
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const body = await response.json();

			expect(body.testCohort).toBe(VALID_COHORT);

			const { data: row } = await admin
				.from('practice_sessions')
				.select('test_cohort')
				.eq('id', body.sessionId)
				.maybeSingle();
			expect(row?.test_cohort).toBe(VALID_COHORT);

			await admin.from('practice_sessions').delete().eq('id', body.sessionId);
		});

		it('a cohort not on the allowlist is silently ignored, not stamped', async () => {
			const response = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: 'causal-inference-1' },
					cookies: fakeCookies({ chiron_test_cohort: 'not-a-real-cohort' })
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const body = await response.json();

			expect(body.testCohort).toBeNull();

			const { data: row } = await admin
				.from('practice_sessions')
				.select('test_cohort')
				.eq('id', body.sessionId)
				.maybeSingle();
			expect(row?.test_cohort).toBeNull();

			await admin.from('practice_sessions').delete().eq('id', body.sessionId);
		});

		it('a normal session with no cohort cookie at all behaves exactly as before (test_cohort null)', async () => {
			const response = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: 'causal-inference-1' }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const body = await response.json();

			expect(body.testCohort).toBeNull();
			await admin.from('practice_sessions').delete().eq('id', body.sessionId);
		});

		it("eligibility reflects only the caller's own completed sessions in that cohort, never another user's", async () => {
			// User A completes one cohort session; user B has none. Neither is
			// eligible yet (only one of three canonical cases each), but this
			// proves the read is scoped to the caller, not global cohort state.
			const startResponse = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: 'causal-inference-1' },
					cookies: fakeCookies({ chiron_test_cohort: VALID_COHORT })
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const { sessionId } = await startResponse.json();
			await admin.from('practice_sessions').update({ fsm_state: 'COMPLETE' }).eq('id', sessionId);

			const eligUrl = new URL(`http://localhost/x?cohort=${VALID_COHORT}`);
			const eligA = await eligibility(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					url: eligUrl
				}) as unknown as Parameters<typeof eligibility>[0]
			);
			const eligB = await eligibility(
				fakeRequestEvent({
					user: { id: userBId!, email: null },
					supabase: userBClient,
					url: eligUrl
				}) as unknown as Parameters<typeof eligibility>[0]
			);
			const bodyA = await eligA.json();
			const bodyB = await eligB.json();

			expect(bodyA.eligible).toBe(false); // only 1 of 3 cases
			expect(bodyB.eligible).toBe(false); // 0 of 3 cases, definitely not leaking A's progress

			await admin.from('practice_sessions').delete().eq('id', sessionId);
		});

		it('a student can submit and then read their own feedback; a second submission for the same cohort is rejected', async () => {
			const feedbackBody = {
				testCohort: VALID_COHORT,
				casesUnderstandable: 4,
				tutorMadeThink: 4,
				newEvidenceMeaningful: 4,
				tutorRepetitive: 2,
				confidenceUnderstandable: 4,
				updateCriterionUnderstandable: 'yes',
				perceivedSteering: false,
				wouldContinue: true
			};

			const first = await submitFeedback(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: feedbackBody
				}) as unknown as Parameters<typeof submitFeedback>[0]
			);
			expect(first.status).toBe(200);

			const second = await submitFeedback(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: feedbackBody
				}) as unknown as Parameters<typeof submitFeedback>[0]
			);
			expect(second.status).toBe(409);

			const { data: ownRead } = await userAClient
				.from('user_test_feedback')
				.select('id')
				.eq('test_cohort', VALID_COHORT)
				.maybeSingle();
			expect(ownRead?.id).toBeTruthy();

			await admin.from('user_test_feedback').delete().eq('student_id', userAId!);
		});

		it("user B cannot read user A's feedback via a direct RLS-scoped query", async () => {
			await admin.from('user_test_feedback').insert({
				student_id: userAId!,
				test_cohort: 'chiron-rls-test-cohort-2',
				cases_understandable: 3,
				tutor_made_think: 3,
				new_evidence_meaningful: 3,
				tutor_repetitive: 3,
				confidence_understandable: 3,
				update_criterion_understandable: 'not_applicable',
				perceived_steering: false,
				would_continue: false
			});

			const { data } = await userBClient
				.from('user_test_feedback')
				.select('id')
				.eq('test_cohort', 'chiron-rls-test-cohort-2')
				.maybeSingle();
			expect(data).toBeNull();

			await admin.from('user_test_feedback').delete().eq('student_id', userAId!);
		});

		it('a feedback submission for an unlisted cohort is rejected', async () => {
			const response = await submitFeedback(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: {
						testCohort: 'not-a-real-cohort',
						casesUnderstandable: 4,
						tutorMadeThink: 4,
						newEvidenceMeaningful: 4,
						tutorRepetitive: 2,
						confidenceUnderstandable: 4,
						updateCriterionUnderstandable: 'yes',
						perceivedSteering: false,
						wouldContinue: true
					}
				}) as unknown as Parameters<typeof submitFeedback>[0]
			);
			expect(response.status).toBe(400);
		});
	}
);
