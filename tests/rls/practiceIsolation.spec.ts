/**
 * Adversarial tests for Phase 2A's practice tables (`prompts.txt`
 * Prompt 22). Runs against the REAL live Supabase project, same
 * discipline as tests/rls/orgIsolation.spec.ts — RLS correctness isn't
 * meaningfully testable against a mock. Covers the prompt's explicit
 * list (request future evidence; request answer-key metadata; alter
 * another user's attempt; access another user's transcript; jump
 * directly to completion) plus the write-blocking design ADR-020 added
 * after thinking through that last case adversarially.
 *
 * Skipped (not failed) when Supabase isn't configured, matching the
 * pattern used for orgIsolation.spec.ts and the live LLM tests.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { practiceCases } from '$lib/domain/practiceCases';
import { FREE_TEXT_MAX_LENGTH } from '$lib/domain/practiceSchemas';
import { POST as startSession } from '../../src/routes/api/practice/sessions/+server';
import { POST as transition } from '../../src/routes/api/practice/sessions/[id]/transition/+server';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

const causalCase = practiceCases.find((c) => c.id === 'causal-inference-1');
if (!causalCase) throw new Error('Fixture case causal-inference-1 not found');

function fakeRequestEvent(overrides: {
	user: { id: string; email: string | null };
	supabase: SupabaseClient;
	body?: unknown;
	params?: Record<string, string>;
}) {
	return {
		request: new Request('http://localhost/x', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(overrides.body ?? {})
		}),
		params: overrides.params ?? {},
		locals: { user: overrides.user, supabase: overrides.supabase },
		// The session-start route reads a cohort cookie
		// (chiron_calibration_feedback_and_automation_prompts.txt) — a
		// no-op stub here since this file isn't testing cohort behavior,
		// just needs `cookies.get` to exist rather than throw.
		cookies: { get: () => undefined },
		getClientAddress: () => `test-${randomUUID()}`
	};
}

describe.skipIf(!hasSupabase)(
	'Phase 2A practice-table isolation (adversarial, live Supabase)',
	() => {
		let admin: SupabaseClient;
		let userAClient: SupabaseClient;
		let userBClient: SupabaseClient;

		let userAId: string | undefined;
		let userBId: string | undefined;

		let userASessionId: string;
		let userAAttemptId: string;
		let userACheckinId: string;

		const runId = randomUUID().slice(0, 8);
		const emailFor = (label: string) => `chiron-practice-test-${label}-${runId}@example.com`;
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

			// Fixture data created via the admin/service-role client — this
			// is exactly the path the real transition route uses, and the
			// only path any authenticated client is permitted to reach at
			// all (ADR-020).
			const sessionInsert = await admin
				.from('practice_sessions')
				.insert({
					student_id: userAId,
					case_id: causalCase.id,
					fsm_state: 'ASK_REFLECTION',
					revealed_evidence_ids: causalCase.evidencePool.slice(0, 1).map((e) => e.id),
					transcript: [
						{ action: { action: 'ASK_FOR_REASONING' }, questionText: 'Why?', response: 'Because.' }
					],
					initial_judgment: { judgment: 'uncertain', confidence: 40, reasoning: 'Not sure yet.' },
					update_criterion_text: null,
					revised_judgment: {
						judgment: 'somewhat_unsupported',
						confidence: 60,
						reasoning: 'Comparison data.'
					},
					reflection_text: null
				})
				.select('id')
				.single();
			if (sessionInsert.error || !sessionInsert.data) {
				throw sessionInsert.error ?? new Error('Failed to create session fixture');
			}
			userASessionId = sessionInsert.data.id;

			const attemptInsert = await admin
				.from('practice_attempts')
				.insert({
					student_id: userAId,
					case_id: causalCase.id,
					session_id: userASessionId,
					initial_judgment: { judgment: 'uncertain', confidence: 40, reasoning: 'Not sure yet.' },
					update_criterion: null,
					revised_judgment: { judgment: 'somewhat_unsupported', confidence: 60, reasoning: 'x' },
					scoring_explanation: { detectedSignals: [], matchedRuleId: null, outcome: 'incorrect' },
					scoring_events: [],
					outcome: 'incorrect'
				})
				.select('id')
				.single();
			if (attemptInsert.error || !attemptInsert.data) {
				throw attemptInsert.error ?? new Error('Failed to create attempt fixture');
			}
			userAAttemptId = attemptInsert.data.id;

			const checkinInsert = await admin
				.from('disposition_checkins')
				.insert({
					student_id: userAId,
					attempt_id: userAAttemptId,
					disposition_item: 'Sticking with a hard problem',
					response: 4
				})
				.select('id')
				.single();
			if (checkinInsert.error || !checkinInsert.data) {
				throw checkinInsert.error ?? new Error('Failed to create disposition_checkins fixture');
			}
			userACheckinId = checkinInsert.data.id;
		}, 30_000);

		afterAll(async () => {
			if (userAId) await admin.auth.admin.deleteUser(userAId);
			if (userBId) await admin.auth.admin.deleteUser(userBId);
		});

		it("org B's user cannot read user A's session (access another user's transcript)", async () => {
			const { data } = await userBClient
				.from('practice_sessions')
				.select('id')
				.eq('id', userASessionId)
				.maybeSingle();
			expect(data).toBeNull();
		});

		it("user B cannot read user A's attempt", async () => {
			const { data } = await userBClient
				.from('practice_attempts')
				.select('id')
				.eq('id', userAAttemptId)
				.maybeSingle();
			expect(data).toBeNull();
		});

		it("user A can read their own session and attempt (sanity check the isolation above isn't just everything being blocked)", async () => {
			const session = await userAClient
				.from('practice_sessions')
				.select('id')
				.eq('id', userASessionId)
				.maybeSingle();
			expect(session.data?.id).toBe(userASessionId);

			const attempt = await userAClient
				.from('practice_attempts')
				.select('id')
				.eq('id', userAAttemptId)
				.maybeSingle();
			expect(attempt.data?.id).toBe(userAAttemptId);
		});

		it("user B cannot read user A's disposition checkin (prompts.txt Prompt 30 — this table had no isolation coverage until this review)", async () => {
			const { data } = await userBClient
				.from('disposition_checkins')
				.select('id')
				.eq('id', userACheckinId)
				.maybeSingle();
			expect(data).toBeNull();
		});

		it('user A can read their own disposition checkin', async () => {
			const { data } = await userAClient
				.from('disposition_checkins')
				.select('id')
				.eq('id', userACheckinId)
				.maybeSingle();
			expect(data?.id).toBe(userACheckinId);
		});

		it('user A cannot fabricate a disposition checkin via a direct client INSERT (only the service role can write this table, same ADR-020 reasoning as practice_attempts)', async () => {
			const { error, data } = await userAClient.from('disposition_checkins').insert({
				student_id: userAId,
				attempt_id: userAAttemptId,
				disposition_item: 'Sticking with a hard problem',
				response: 5
			});
			expect(error).not.toBeNull();
			expect(data).toBeNull();
		});

		it("user B cannot alter user A's disposition checkin via a direct UPDATE", async () => {
			await userBClient
				.from('disposition_checkins')
				.update({ response: 1 })
				.eq('id', userACheckinId);
			const stillOriginal = await admin
				.from('disposition_checkins')
				.select('response')
				.eq('id', userACheckinId)
				.single();
			expect(stillOriginal.data?.response).toBe(4);
		});

		it("user B cannot alter user A's attempt via a direct UPDATE (no policy grants it to anyone, not just other users)", async () => {
			await userBClient
				.from('practice_attempts')
				.update({ outcome: 'correct' })
				.eq('id', userAAttemptId);
			const stillOriginal = await admin
				.from('practice_attempts')
				.select('outcome')
				.eq('id', userAAttemptId)
				.single();
			expect(stillOriginal.data?.outcome).toBe('incorrect');
		});

		it('user A cannot jump their own session straight to COMPLETE via a direct client UPDATE (ADR-020)', async () => {
			await userAClient
				.from('practice_sessions')
				.update({ fsm_state: 'COMPLETE' })
				.eq('id', userASessionId);
			const stillUnchanged = await admin
				.from('practice_sessions')
				.select('fsm_state')
				.eq('id', userASessionId)
				.single();
			expect(stillUnchanged.data?.fsm_state).toBe('ASK_REFLECTION');
		});

		it('user A cannot fabricate a favorable practice_attempts row via a direct client INSERT (ADR-020)', async () => {
			const { error, data } = await userAClient.from('practice_attempts').insert({
				student_id: userAId,
				case_id: causalCase.id,
				session_id: userASessionId,
				initial_judgment: {
					judgment: 'strongly_supported',
					confidence: 100,
					reasoning: 'fabricated'
				},
				update_criterion: null,
				revised_judgment: {
					judgment: 'strongly_supported',
					confidence: 100,
					reasoning: 'fabricated'
				},
				scoring_explanation: {
					detectedSignals: [],
					matchedRuleId: 'fake-rule-id',
					outcome: 'correct'
				},
				scoring_events: [],
				outcome: 'correct'
			});
			expect(error).not.toBeNull();
			expect(data).toBeNull();
		});

		it('user A cannot create a brand-new practice_sessions row via a direct client INSERT either (only the service role can)', async () => {
			const { error, data } = await userAClient.from('practice_sessions').insert({
				student_id: userAId,
				case_id: causalCase.id,
				fsm_state: 'PRESENT_SCENARIO',
				revealed_evidence_ids: [],
				transcript: [],
				initial_judgment: null,
				update_criterion_text: null,
				revised_judgment: null,
				reflection_text: null
			});
			expect(error).not.toBeNull();
			expect(data).toBeNull();
		});

		it('the real session-start route never returns evidencePool or answerSpec (request answer-key metadata)', async () => {
			const response = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: causalCase.id }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const body = await response.json();
			expect(body.case).toBeDefined();
			expect(body.case).not.toHaveProperty('evidencePool');
			expect(body.case).not.toHaveProperty('answerSpec');
			expect(body.case).not.toHaveProperty('educatorNotes');
			const serialized = JSON.stringify(body);
			for (const item of causalCase.evidencePool) expect(serialized).not.toContain(item.text);
			for (const rule of causalCase.answerSpec.reasoningRubric.finalJudgmentRules) {
				expect(serialized).not.toContain(rule.explanation);
			}
		});

		it('the transition route never reveals more evidence than the FSM allows, and rejects a client trying to send a server-only event type (request future evidence)', async () => {
			// Fresh session at PRESENT_SCENARIO, created the only way a
			// client legitimately can — via the real route.
			const startResponse = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: causalCase.id }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const { sessionId } = await startResponse.json();

			// A client trying to send a server-only event type directly —
			// CHALLENGE_SELECTED and SCORED are not in ClientEventSchema at
			// all, so this must be rejected as a 400, never reach advance().
			const forgedResponse = await transition(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					params: { id: sessionId },
					body: {
						type: 'SCORED',
						explanation: { detectedSignals: [], matchedRuleId: null, outcome: 'correct' }
					}
				}) as unknown as Parameters<typeof transition>[0]
			);
			expect(forgedResponse.status).toBe(400);

			// A legitimate client event, in order, should never surface
			// evidence text beyond what was actually just revealed.
			const judgmentResponse = await transition(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					params: { id: sessionId },
					body: {
						type: 'SUBMIT_INITIAL_JUDGMENT',
						judgment: 'uncertain',
						reasoning: 'Not sure yet.'
					}
				}) as unknown as Parameters<typeof transition>[0]
			);
			const judgmentBody = await judgmentResponse.json();
			expect(judgmentBody).not.toHaveProperty('result');
			const laterEvidence = causalCase.evidencePool.filter((e) => e.revealOrder > 0);
			const serialized = JSON.stringify(judgmentBody);
			for (const item of laterEvidence) expect(serialized).not.toContain(item.text);
		}, 20_000);

		it('rejects a replayed, already-consumed transition event rather than reprocessing or silently ignoring it (prompts.txt Prompt 30 — "replay of old transitions")', async () => {
			const startResponse = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: causalCase.id }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const { sessionId } = await startResponse.json();

			const submitJudgment = () =>
				transition(
					fakeRequestEvent({
						user: { id: userAId!, email: null },
						supabase: userAClient,
						params: { id: sessionId },
						body: {
							type: 'SUBMIT_INITIAL_JUDGMENT',
							judgment: 'uncertain',
							reasoning: 'Not sure yet.'
						}
					}) as unknown as Parameters<typeof transition>[0]
				);

			const first = await submitJudgment();
			expect(first.status).toBe(200);

			// The session has now moved to ASK_INITIAL_CONFIDENCE — replaying
			// the exact same SUBMIT_INITIAL_JUDGMENT event a client already
			// sent (e.g. a duplicated request, or a deliberate replay attempt)
			// must be rejected, not silently reprocessed or allowed to
			// overwrite the judgment already recorded.
			const replay = await submitJudgment();
			expect(replay.status).toBe(400);

			const { data: row } = await admin
				.from('practice_sessions')
				.select('fsm_state, initial_judgment')
				.eq('id', sessionId)
				.single();
			expect(row?.fsm_state).toBe('ASK_INITIAL_CONFIDENCE');
			expect((row?.initial_judgment as { reasoning: string } | null)?.reasoning).toBe(
				'Not sure yet.'
			);
		}, 20_000);

		it('rejects a learner free-text field over FREE_TEXT_MAX_LENGTH before it ever reaches a session lookup or a provider call (prompts.txt Prompt 32 — "maximum learner free-text length")', async () => {
			const startResponse = await startSession(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					body: { caseId: causalCase.id }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			const { sessionId } = await startResponse.json();

			const oversizedResponse = await transition(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					params: { id: sessionId },
					body: {
						type: 'SUBMIT_INITIAL_JUDGMENT',
						judgment: 'uncertain',
						reasoning: 'x'.repeat(FREE_TEXT_MAX_LENGTH + 1)
					}
				}) as unknown as Parameters<typeof transition>[0]
			);
			expect(oversizedResponse.status).toBe(400);

			// The session must be untouched — rejected at schema-parse time,
			// before the session row is even read.
			const { data: row } = await admin
				.from('practice_sessions')
				.select('fsm_state, initial_judgment')
				.eq('id', sessionId)
				.single();
			expect(row?.fsm_state).toBe('PRESENT_SCENARIO');
			expect(row?.initial_judgment).toBeNull();

			// Exactly at the limit succeeds — this isn't rejecting all input,
			// only input past the named bound.
			const atLimitResponse = await transition(
				fakeRequestEvent({
					user: { id: userAId!, email: null },
					supabase: userAClient,
					params: { id: sessionId },
					body: {
						type: 'SUBMIT_INITIAL_JUDGMENT',
						judgment: 'uncertain',
						reasoning: 'x'.repeat(FREE_TEXT_MAX_LENGTH)
					}
				}) as unknown as Parameters<typeof transition>[0]
			);
			expect(atLimitResponse.status).toBe(200);
		}, 20_000);
	}
);
