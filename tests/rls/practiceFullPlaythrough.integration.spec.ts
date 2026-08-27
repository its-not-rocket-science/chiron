/**
 * A single live, full-session playthrough of the real transition route
 * against the real Supabase project and real DeepSeek models —
 * `prompts.txt` Prompt 28 discovered (while wiring the student UI that
 * depends on it) that `disposition_checkins` had a table and RLS
 * policy (migration 0009) but no writer anywhere: `SUBMIT_DISPOSITION_CHECKIN`
 * drove the FSM to `COMPLETE` but silently discarded the
 * (dispositionItem, response) pair. That fix, and the transition
 * route's newly-richer end-of-case `result` payload, have no coverage
 * anywhere else — `tests/rls/practiceIsolation.spec.ts`'s adversarial
 * tests never drive a session past the first judgment. This test
 * drives one all the way to `COMPLETE` and checks both.
 *
 * Gated on both live Supabase AND a live DeepSeek key (real tutor +
 * classifier calls happen along the way) — skipped, not failed,
 * otherwise. Uses `source-provenance-1` (no update-criterion mechanic)
 * to keep the round-trip count, and cost, to the minimum needed to
 * reach COMPLETE.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';
import { practiceCases } from '$lib/domain/practiceCases';
import { POST as startSession } from '../../src/routes/api/practice/sessions/+server';
import { POST as transition } from '../../src/routes/api/practice/sessions/[id]/transition/+server';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);
const hasApiKey = Boolean(env.DEEPSEEK_API_KEY);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

const sourceCase = practiceCases.find((c) => c.id === 'source-provenance-1');
if (!sourceCase) throw new Error('Fixture case source-provenance-1 not found');

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

describe.skipIf(!hasSupabase || !hasApiKey)(
	'Phase 2A full session playthrough (live Supabase + live DeepSeek)',
	() => {
		let admin: SupabaseClient;
		let userClient: SupabaseClient;
		let userId: string | undefined;

		const runId = randomUUID().slice(0, 8);
		const email = `chiron-practice-playthrough-${runId}@example.com`;
		const password = 'Test-Password-123!';

		beforeAll(async () => {
			const url = env.PUBLIC_SUPABASE_URL!;
			const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
			admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

			const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
			if (created.error || !created.data.user)
				throw created.error ?? new Error('Failed to create user');
			userId = created.data.user.id;

			userClient = createClient(url, anonKey, NO_PERSIST);
			await userClient.auth.signInWithPassword({ email, password });
		}, 30_000);

		afterAll(async () => {
			if (userId) await admin.auth.admin.deleteUser(userId);
		});

		it('drives a full session from start to COMPLETE, persists scoring data, and writes the disposition checkin', async () => {
			const startResponse = await startSession(
				fakeRequestEvent({
					user: { id: userId!, email: null },
					supabase: userClient,
					body: { caseId: sourceCase.id }
				}) as unknown as Parameters<typeof startSession>[0]
			);
			expect(startResponse.status).toBe(200);
			const { sessionId } = await startResponse.json();
			expect(sessionId).toBeTruthy();

			async function send(body: unknown) {
				const response = await transition(
					fakeRequestEvent({
						user: { id: userId!, email: null },
						supabase: userClient,
						params: { id: sessionId },
						body
					}) as unknown as Parameters<typeof transition>[0]
				);
				const json = await response.json();
				expect(
					response.status,
					`unexpected status for ${JSON.stringify(body)}: ${JSON.stringify(json)}`
				).toBe(200);
				return json;
			}

			await send({
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: 'somewhat_supported',
				reasoning: 'Lots of outlets are reporting it, so it seems believable.'
			});
			let latest = await send({ type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 70 });
			expect(latest.fsmState).toBe('AWAIT_CHALLENGE_RESPONSE');

			let guard = 0;
			while (latest.fsmState === 'AWAIT_CHALLENGE_RESPONSE' && guard < 10) {
				guard += 1;
				latest = await send({
					type: 'SUBMIT_CHALLENGE_RESPONSE',
					response: 'I think the outlets are independently confirming it, but I am not fully sure.'
				});
			}
			expect(latest.fsmState).toBe('ASK_REVISED_JUDGMENT');

			await send({
				type: 'SUBMIT_REVISED_JUDGMENT',
				judgment: 'somewhat_unsupported',
				reasoning:
					'It turns out the outlets all trace back to one aquarium press release, not independent sources, and the sighting was never peer reviewed.'
			});
			await send({ type: 'SUBMIT_REVISED_CONFIDENCE', confidence: 65 });
			latest = await send({
				type: 'SUBMIT_REFLECTION',
				text: 'I changed my mind once I saw the outlets all traced back to one press release.'
			});

			// This is the response that resolves SCORE_AND_RECORD — the richer
			// end-of-case payload the student UI depends on should be here.
			expect(latest.fsmState).toBe('DISPOSITION_SELF_CHECK');
			expect(latest.result).toBeDefined();
			expect(latest.result.outcome === 'correct' || latest.result.outcome === 'incorrect').toBe(
				true
			);
			expect(typeof latest.result.teachingExplanation).toBe('string');
			expect(latest.result.teachingExplanation.length).toBeGreaterThan(0);
			expect(latest.result.initialJudgment.judgment).toBe('somewhat_supported');
			expect(latest.result.revisedJudgment.judgment).toBe('somewhat_unsupported');
			expect(Array.isArray(latest.result.scoringEvents)).toBe(true);
			// source-provenance-1 has usesUpdateCriterion: false.
			expect(latest.result.updateCriterion).toBeNull();
			// prompts.txt Prompt 29's "where you could push further" — derived
			// from the real rubric + real classifier output, not a live-model
			// call of its own, but only exercised end-to-end via this route.
			expect(Array.isArray(latest.result.pushFurtherHints)).toBe(true);
			for (const hint of latest.result.pushFurtherHints) {
				expect(typeof hint).toBe('string');
				expect(hint.length).toBeGreaterThan(0);
			}

			latest = await send({
				type: 'SUBMIT_DISPOSITION_CHECKIN',
				dispositionItem: 'Being diligent about seeking out relevant information',
				response: 4
			});
			expect(latest.fsmState).toBe('COMPLETE');
			// No attemptInsertPending on this final request — the client is
			// expected to have retained the result from the previous response.
			expect(latest.result).toBeUndefined();

			const { data: attemptRow } = await admin
				.from('practice_attempts')
				.select('id, scoring_events, initial_reasoning_signals, outcome')
				.eq('session_id', sessionId)
				.maybeSingle();
			expect(attemptRow).toBeTruthy();
			expect(Array.isArray(attemptRow!.scoring_events)).toBe(true);

			// prompts.txt Prompt 34 — the classifier's real pass over the
			// INITIAL reasoning (never classified before this prompt) landed
			// on the row, in the shape practiceEvaluation.ts expects: one
			// SignalClassification-like entry per candidate signal.
			expect(Array.isArray(attemptRow!.initial_reasoning_signals)).toBe(true);
			expect((attemptRow!.initial_reasoning_signals as unknown[]).length).toBeGreaterThan(0);
			for (const classification of attemptRow!.initial_reasoning_signals as Array<{
				signal: string;
				present: boolean;
			}>) {
				expect(typeof classification.signal).toBe('string');
				expect(typeof classification.present).toBe('boolean');
			}

			const { data: checkinRow } = await admin
				.from('disposition_checkins')
				.select('id, attempt_id, disposition_item, response')
				.eq('attempt_id', attemptRow!.id)
				.maybeSingle();
			expect(checkinRow).toBeTruthy();
			expect(checkinRow!.disposition_item).toBe(
				'Being diligent about seeking out relevant information'
			);
			expect(checkinRow!.response).toBe(4);

			// prompts.txt Prompt 32 — "add tests proving the FSM cannot be
			// abused to trigger unlimited calls." A completed session is
			// exactly where an attacker gains nothing by resubmitting: try it
			// anyway, against the real route, and confirm SCORE_AND_RECORD
			// (and the classifier calls it makes) cannot be re-triggered —
			// no second practice_attempts row, no real HTTP request even
			// reaching a provider (this returns 400 well before that point).
			const replay = await transition(
				fakeRequestEvent({
					user: { id: userId!, email: null },
					supabase: userClient,
					params: { id: sessionId },
					body: {
						type: 'SUBMIT_DISPOSITION_CHECKIN',
						dispositionItem: 'Being diligent about seeking out relevant information',
						response: 4
					}
				}) as unknown as Parameters<typeof transition>[0]
			);
			expect(replay.status).toBe(400);

			const { data: attemptRowsAfterReplay } = await admin
				.from('practice_attempts')
				.select('id')
				.eq('session_id', sessionId);
			expect(attemptRowsAfterReplay).toHaveLength(1);
		}, 120_000);
	}
);
