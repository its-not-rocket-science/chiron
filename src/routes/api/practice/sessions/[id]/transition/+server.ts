import { randomUUID } from 'node:crypto';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	advance,
	computeOutcome,
	MAX_CLASSIFIER_CALLS_PER_STAGE,
	type FsmEvent
} from '$lib/domain/practiceFsm';
import { computeScoringEvents, computePushFurtherHints } from '$lib/domain/scoringEvents';
import {
	computeUpdateCriterionConsistency,
	deriveUpdateCriterionSignals
} from '$lib/domain/updateCriterionConsistency';
import { getPracticeCase } from '$lib/domain/practiceCases';
import {
	ConfidenceRatingSchema,
	EvidenceSupportJudgmentSchema,
	FREE_TEXT_MAX_LENGTH,
	TutorActionSchema,
	getTeachingExplanation,
	reasoningSignalIds,
	signalClassificationSchemaFor,
	type ScoringEvent,
	type SignalClassification,
	type UpdateCriterionConsistencyResult
} from '$lib/domain/practiceSchemas';
import { DeepSeekTutorProvider } from '$lib/providers/DeepSeekTutorProvider';
import { DeepSeekReasoningClassifierProvider } from '$lib/providers/DeepSeekReasoningClassifierProvider';
import { checkRateLimit } from '$lib/server/rateLimit';
import { getServiceRoleClient } from '$lib/server/serviceRoleClient';
import {
	practiceSessionFromRow,
	practiceSessionToUpdateRow,
	type PracticeSessionRow
} from '$lib/server/practiceSessionRow';

const ClientEventSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('SUBMIT_INITIAL_JUDGMENT'),
		judgment: EvidenceSupportJudgmentSchema,
		reasoning: z.string().min(1).max(FREE_TEXT_MAX_LENGTH)
	}),
	z.object({ type: z.literal('SUBMIT_INITIAL_CONFIDENCE'), confidence: ConfidenceRatingSchema }),
	z.object({
		type: z.literal('SUBMIT_UPDATE_CRITERION'),
		text: z.string().min(1).max(FREE_TEXT_MAX_LENGTH)
	}),
	z.object({
		type: z.literal('SUBMIT_CHALLENGE_RESPONSE'),
		response: z.string().min(1).max(FREE_TEXT_MAX_LENGTH)
	}),
	z.object({
		type: z.literal('SUBMIT_REVISED_JUDGMENT'),
		judgment: EvidenceSupportJudgmentSchema,
		reasoning: z.string().min(1).max(FREE_TEXT_MAX_LENGTH)
	}),
	z.object({ type: z.literal('SUBMIT_REVISED_CONFIDENCE'), confidence: ConfidenceRatingSchema }),
	z.object({
		type: z.literal('SUBMIT_REFLECTION'),
		text: z.string().min(1).max(FREE_TEXT_MAX_LENGTH)
	}),
	z.object({
		type: z.literal('SUBMIT_DISPOSITION_CHECKIN'),
		dispositionItem: z.string().min(1),
		response: z.number().int().min(1).max(5)
	})
]);

const RATE_LIMIT = { requests: 60, windowMs: 10 * 60 * 1000 };

// A tighter, cost-focused limit distinct from the general request-rate
// limit above: this one only increments on an actual tutor or classifier
// call (not every transition request), directly protecting the two call
// types `prompts.txt` Prompt 31 names explicitly. ~9 LLM calls make up
// one full case playthrough (docs/SECURITY.md Section 9's own worked
// arithmetic) — 40/10min covers several playthroughs in a row without
// coming anywhere near the ~200-270/10min worst case that review flagged
// as too loose. Deliberately NOT a per-attempt cap (that's Prompt 32's
// job, on top of the existing MAX_CHALLENGE_ROUNDS FSM bound) — this is
// a per-user rate limit, the axis Prompt 31 itself owns.
const LLM_CALL_RATE_LIMIT = { requests: 40, windowMs: 10 * 60 * 1000 };

/** Returns a 429 Response if the user has exceeded the LLM-call rate limit, otherwise null. */
async function checkLlmCallLimit(userId: string): Promise<Response | null> {
	const rateLimit = await checkRateLimit(
		`practice-llm-calls:${userId}`,
		LLM_CALL_RATE_LIMIT.requests,
		LLM_CALL_RATE_LIMIT.windowMs
	);
	if (rateLimit.allowed) return null;
	return json(
		{ error: { message: 'Too many AI-assisted requests. Please wait a bit and try again.' } },
		{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
	);
}

// The three cross-case, mechanic-level signals updateCriterionConsistency.ts
// can synthesize (ADR-022) — credited whenever usesUpdateCriterion is on,
// not gated by whether a case author happened to list them in their own
// rubric.partialCreditSignals (unlike every other signal, which is).
const UPDATE_CRITERION_MECHANIC_SIGNALS = [
	'states_update_criterion',
	'relevant_update_criterion',
	'follows_declared_update_criterion'
];

// Both real now (ADR-008's vendor choice) — constructed once per
// module, same lazy-client pattern as DeepSeekScoringProvider.
const tutorProvider = new DeepSeekTutorProvider();
const classifierProvider = new DeepSeekReasoningClassifierProvider();

/**
 * Advances a Phase 2A practice session by exactly one client-originated
 * event, then internally resolves any server-only auto-states
 * (PRESENT_CHALLENGE, SCORE_AND_RECORD) before returning — the client
 * never drives those transitions itself (docs/PHASE2.md Section 3).
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
	if (!locals.user || !locals.supabase) {
		return json({ error: { message: 'You must be signed in.' } }, { status: 401 });
	}

	// Keyed by user id, not IP — same school-shared-IP reasoning as the
	// session-start route (Prompt 31).
	const rateLimit = await checkRateLimit(
		`practice-transition:${locals.user.id}`,
		RATE_LIMIT.requests,
		RATE_LIMIT.windowMs
	);
	if (!rateLimit.allowed) {
		return json(
			{ error: { message: 'Too many requests. Please wait a bit and try again.' } },
			{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
		);
	}

	const sessionId = params.id;
	if (!sessionId) return json({ error: { message: 'Missing session id.' } }, { status: 400 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { message: 'Request body must be JSON.' } }, { status: 400 });
	}
	const parsedEvent = ClientEventSchema.safeParse(body);
	if (!parsedEvent.success) {
		return json({ error: { message: 'Invalid request.' } }, { status: 400 });
	}

	// RLS already scopes this to the caller's own session — a request for
	// someone else's session id returns zero rows, not another user's data.
	const { data: row } = await locals.supabase
		.from('practice_sessions')
		.select(
			'id, student_id, case_id, fsm_state, revealed_evidence_ids, transcript, initial_judgment, update_criterion_text, revised_judgment, reflection_text, created_at, updated_at'
		)
		.eq('id', sessionId)
		.maybeSingle()
		.overrideTypes<PracticeSessionRow>();
	if (!row) {
		return json({ error: { message: 'Session not found.' } }, { status: 404 });
	}

	let session = practiceSessionFromRow(row);
	const practiceCase = getPracticeCase(session.caseId);
	if (!practiceCase) {
		return json(
			{ error: { message: 'This session references an unknown case.' } },
			{ status: 500 }
		);
	}

	const clientEvent = parsedEvent.data as FsmEvent;
	let result = advance(session, practiceCase, clientEvent);
	if (!result.ok) {
		return json({ error: { message: result.error } }, { status: 400 });
	}
	session = result.session;

	let revealedEvidenceText: string | null = null;
	if (result.ok && result.revealedEvidenceItemId) {
		const revealedId = result.revealedEvidenceItemId;
		const item = practiceCase.evidencePool.find((e) => e.id === revealedId);
		revealedEvidenceText = item?.text ?? null;
	}

	// Not persisted — derived, ephemeral feedback (prompts.txt Prompt 29),
	// not part of the stored scoring audit trail. Computed alongside
	// attemptInsertPending below and carried to the same response.
	let pushFurtherHintsForResponse: string[] = [];

	let attemptInsertPending: {
		id: string;
		initial_judgment: unknown;
		update_criterion: unknown;
		revised_judgment: unknown;
		scoring_explanation: unknown;
		scoring_events: unknown;
		// prompts.txt Prompt 34 — the classifier's raw output for the
		// student's INITIAL reasoning, analysis-only (never read by this
		// route's own response, so it can't leak into student-facing
		// feedback). Lets practiceEvaluation.ts compute a real before/after
		// "signals added after challenge" diff instead of a documented gap.
		initial_reasoning_signals: unknown;
		outcome: 'correct' | 'incorrect';
	} | null = null;

	// Resolve server-only auto-states in a loop until we hit a state that
	// genuinely needs the next client input, or COMPLETE. A single
	// client-originated event can only ever land the FSM at one
	// auto-state that itself needs one more resolution (PRESENT_CHALLENGE
	// or SCORE_AND_RECORD, each needing exactly one `continue`) before
	// reaching a stable state — MAX_AUTO_STATE_RESOLUTIONS (4) is a
	// generous margin over that true worst case of ~2, not an arbitrary
	// number (prompts.txt Prompt 32 — "no recursive autonomous model
	// loops"): tight enough that a future bug in advance() introducing an
	// actual cycle fails fast instead of silently permitting many extra
	// real LLM calls.
	const MAX_AUTO_STATE_RESOLUTIONS = 4;
	for (let guard = 0; guard < MAX_AUTO_STATE_RESOLUTIONS; guard++) {
		if (session.fsmState === 'PRESENT_CHALLENGE') {
			if (!session.initialJudgment) {
				return json(
					{ error: { message: 'Missing initial judgment at PRESENT_CHALLENGE.' } },
					{ status: 500 }
				);
			}
			const revealedTexts = practiceCase.evidencePool
				.filter((e) => session.revealedEvidenceIds.includes(e.id))
				.sort((a, b) => a.revealOrder - b.revealOrder)
				.map((e) => e.text);

			const tutorLimitResponse = await checkLlmCallLimit(locals.user.id);
			if (tutorLimitResponse) return tutorLimitResponse;

			const challenge = await tutorProvider.selectAndPhraseChallenge({
				transcript: session.transcript,
				revealedEvidenceTexts: revealedTexts,
				scenario: practiceCase.scenario,
				claim: practiceCase.claim,
				learnerJudgment: session.initialJudgment.judgment,
				learnerConfidence: session.initialJudgment.confidence,
				learnerReasoning: session.initialJudgment.reasoning,
				targetSkillTags: practiceCase.skillTags
			});

			// tutorCore.ts already schema-validates and applies the
			// no-invented-facts heuristic before returning — this is a second,
			// cheap defense-in-depth check at the route boundary, same
			// discipline as every other LLM-adjacent output in this codebase
			// (never trust a provider's return value on its own say-so).
			const validated = TutorActionSchema.safeParse(challenge.action);
			const action = validated.success ? validated.data : { action: 'ASK_FOR_REASONING' as const };

			result = advance(session, practiceCase, {
				type: 'CHALLENGE_SELECTED',
				action,
				questionText: challenge.questionText
			});
			if (!result.ok) {
				return json({ error: { message: result.error } }, { status: 500 });
			}
			session = result.session;
			continue;
		}

		if (session.fsmState === 'SCORE_AND_RECORD') {
			if (!session.initialJudgment || !session.revisedJudgment) {
				return json(
					{ error: { message: 'Missing initial or revised judgment at SCORE_AND_RECORD.' } },
					{ status: 500 }
				);
			}
			const attemptId = randomUUID();

			// Explicit, checked counter for MAX_CLASSIFIER_CALLS_PER_STAGE
			// (prompts.txt Prompt 32, extended by Prompt 34) — this stage
			// makes at most three classifier calls: main (revised) signals,
			// update-criterion signals only if the case uses that mechanic,
			// and the initial-reasoning signals Prompt 34 added. The
			// assertion below is tautological given the code as written
			// today, same as MAX_CHALLENGE_ROUNDS's own "defense in depth,
			// not the primary stop condition" — it exists to catch a future
			// change that adds a fourth call here without updating the named
			// bound, not because this path can currently exceed it.
			let classifierCallCount = 0;

			// Union of finalJudgmentRules.requiredSignals AND
			// partialCreditSignals — not just the former. A signal that's
			// only ever a partialCreditSignal (e.g. 'acknowledges_uncertainty'
			// in two of the three canonical cases) must still be classified
			// here, or computeScoringEvents below can never observe it as
			// present regardless of what the student actually wrote.
			const candidateSignals = [
				...new Set([
					...practiceCase.answerSpec.reasoningRubric.finalJudgmentRules.flatMap(
						(r) => r.requiredSignals
					),
					...practiceCase.answerSpec.reasoningRubric.partialCreditSignals
				])
			].filter((s): s is (typeof reasoningSignalIds)[number] =>
				(reasoningSignalIds as readonly string[]).includes(s)
			);
			const reasoningText = [session.revisedJudgment.reasoning, session.reflectionText]
				.filter(Boolean)
				.join(' ');
			const revealedTextsForScoring = practiceCase.evidencePool
				.filter((e) => session.revealedEvidenceIds.includes(e.id))
				.sort((a, b) => a.revealOrder - b.revealOrder)
				.map((e) => e.text);

			const classifierLimitResponse = await checkLlmCallLimit(locals.user.id);
			if (classifierLimitResponse) return classifierLimitResponse;

			classifierCallCount += 1;
			if (classifierCallCount > MAX_CLASSIFIER_CALLS_PER_STAGE) {
				return json(
					{ error: { message: 'This stage has exceeded its maximum classifier calls.' } },
					{ status: 500 }
				);
			}
			const rawSignals = await classifierProvider.classifySignals({
				freeText: reasoningText,
				scenario: practiceCase.scenario,
				claim: practiceCase.claim,
				revealedEvidenceTexts: revealedTextsForScoring,
				candidateSignals
			});
			const detectedSignals: SignalClassification[] = rawSignals.filter(
				(s) => signalClassificationSchemaFor(candidateSignals).safeParse(s).success
			);

			// prompts.txt Prompt 34 — classify the student's INITIAL reasoning
			// too (never classified anywhere else), against the same
			// candidateSignals set as the revised-reasoning call above, so the
			// two results are directly comparable set-wise. Analysis-only:
			// stored on the attempt row (initial_reasoning_signals) but never
			// read by this route's own response, so it never reaches the
			// student-facing feedback screens — only practiceEvaluation.ts
			// (docs/EVALUATION_PLAN.md) consumes it, to compute "reasoning
			// signals added after challenge" as a real diff.
			//
			// revealedEvidenceTexts is deliberately [] here, not
			// revealedTextsForScoring — the FSM never reveals any evidence
			// before the initial judgment (the first reveal happens resolving
			// the student's first challenge response, well after
			// ASK_INITIAL_JUDGMENT/ASK_INITIAL_CONFIDENCE), so passing the
			// case's full final evidence set as this call's context would
			// misrepresent what the student could actually have known when
			// they wrote this text — the classifier could credit
			// evidence-grounded reasoning the student had no way to produce
			// yet.
			const initialLimitResponse = await checkLlmCallLimit(locals.user.id);
			if (initialLimitResponse) return initialLimitResponse;

			classifierCallCount += 1;
			if (classifierCallCount > MAX_CLASSIFIER_CALLS_PER_STAGE) {
				return json(
					{ error: { message: 'This stage has exceeded its maximum classifier calls.' } },
					{ status: 500 }
				);
			}
			const rawInitialSignals = await classifierProvider.classifySignals({
				freeText: session.initialJudgment.reasoning,
				scenario: practiceCase.scenario,
				claim: practiceCase.claim,
				revealedEvidenceTexts: [],
				candidateSignals
			});
			const initialDetectedSignals: SignalClassification[] = rawInitialSignals.filter(
				(s) => signalClassificationSchemaFor(candidateSignals).safeParse(s).success
			);

			let updateCriterionResult: {
				text: string;
				classification: SignalClassification | null;
				consistency: UpdateCriterionConsistencyResult;
			} | null = null;
			let updateCriterionScoringEvents: ScoringEvent[] = [];
			if (
				practiceCase.usesUpdateCriterion &&
				session.updateCriterionText &&
				practiceCase.updateCriteria
			) {
				const ucSignals = practiceCase.updateCriteria.map((c) => c.signal);

				const ucLimitResponse = await checkLlmCallLimit(locals.user.id);
				if (ucLimitResponse) return ucLimitResponse;

				classifierCallCount += 1;
				if (classifierCallCount > MAX_CLASSIFIER_CALLS_PER_STAGE) {
					return json(
						{ error: { message: 'This stage has exceeded its maximum classifier calls.' } },
						{ status: 500 }
					);
				}
				const ucClassifications = await classifierProvider.classifySignals({
					freeText: session.updateCriterionText,
					scenario: practiceCase.scenario,
					claim: practiceCase.claim,
					revealedEvidenceTexts: revealedTextsForScoring,
					candidateSignals: ucSignals
				});
				const validUcClassifications = ucClassifications.filter(
					(c) => signalClassificationSchemaFor(ucSignals).safeParse(c).success
				);

				const { result: consistency, matchedClassification } = computeUpdateCriterionConsistency({
					updateCriteria: practiceCase.updateCriteria,
					criterionClassifications: validUcClassifications,
					revealedEvidenceIds: session.revealedEvidenceIds,
					initialJudgment: session.initialJudgment,
					revisedJudgment: session.revisedJudgment
				});
				updateCriterionResult = {
					text: session.updateCriterionText,
					classification: matchedClassification,
					consistency
				};

				const updateCriterionSignals = deriveUpdateCriterionSignals(
					consistency,
					matchedClassification?.evidenceQuote ?? null
				);
				if (updateCriterionSignals.length > 0) {
					updateCriterionScoringEvents = computeScoringEvents({
						attemptId,
						stage: 'SCORE_AND_RECORD',
						rubric: {
							finalJudgmentRules: [],
							partialCreditSignals: UPDATE_CRITERION_MECHANIC_SIGNALS
						},
						matchedRuleId: null,
						detectedSignals: updateCriterionSignals
					});
				}
			}

			const explanation = computeOutcome(
				session.revisedJudgment.judgment,
				detectedSignals,
				practiceCase.answerSpec.reasoningRubric
			);

			pushFurtherHintsForResponse = computePushFurtherHints(
				session.revisedJudgment.judgment,
				practiceCase.answerSpec.reasoningRubric,
				detectedSignals
			);

			const scoringEvents = [
				...computeScoringEvents({
					attemptId,
					stage: 'SCORE_AND_RECORD',
					rubric: practiceCase.answerSpec.reasoningRubric,
					matchedRuleId: explanation.matchedRuleId,
					detectedSignals
				}),
				...updateCriterionScoringEvents
			];

			attemptInsertPending = {
				id: attemptId,
				initial_judgment: session.initialJudgment,
				update_criterion: updateCriterionResult,
				revised_judgment: session.revisedJudgment,
				scoring_explanation: explanation,
				scoring_events: scoringEvents,
				initial_reasoning_signals: initialDetectedSignals,
				outcome: explanation.outcome
			};

			result = advance(session, practiceCase, { type: 'SCORED', explanation });
			if (!result.ok) {
				return json({ error: { message: result.error } }, { status: 500 });
			}
			session = result.session;
			continue;
		}

		break;
	}

	// Writes go through the service-role client, not locals.supabase —
	// ADR-020: no RLS policy grants authenticated clients INSERT/UPDATE
	// on practice_sessions/practice_attempts at all, so FSM integrity
	// can't be bypassed via a direct REST call — this route, having
	// already run advance()/computeOutcome() above, is the only writer.
	// `session` was loaded via the RLS-scoped read above, which already
	// confirmed it belongs to this caller before any of this ran.
	const serviceRole = getServiceRoleClient();

	await serviceRole
		.from('practice_sessions')
		.update(practiceSessionToUpdateRow(session))
		.eq('id', session.id);

	let outcomeForResponse: {
		outcome: 'correct' | 'incorrect';
		teachingExplanation: string;
		initialJudgment: unknown;
		revisedJudgment: unknown;
		scoringEvents: unknown;
		updateCriterion: unknown;
		pushFurtherHints: string[];
	} | null = null;

	if (attemptInsertPending) {
		const { error: attemptError } = await serviceRole.from('practice_attempts').insert({
			student_id: locals.user.id,
			case_id: practiceCase.id,
			session_id: session.id,
			...attemptInsertPending
		});
		if (attemptError) {
			return json({ error: { message: 'Could not record this attempt.' } }, { status: 500 });
		}

		// This request is exactly the one that just resolved SCORE_AND_RECORD
		// (landing at DISPOSITION_SELF_CHECK) — the richest point to hand the
		// client transparent end-of-case feedback data (Prompt 28's "transparent
		// feedback; reasoning events; confidence/update summary" screens). The
		// later SUBMIT_DISPOSITION_CHECKIN request that actually reaches COMPLETE
		// has no attemptInsertPending of its own (the attempt was already written
		// here), so the client is expected to retain this payload from this
		// response rather than expect it again on the final request.
		outcomeForResponse = {
			outcome: attemptInsertPending.outcome,
			teachingExplanation: getTeachingExplanation(practiceCase),
			initialJudgment: attemptInsertPending.initial_judgment,
			revisedJudgment: attemptInsertPending.revised_judgment,
			scoringEvents: attemptInsertPending.scoring_events,
			updateCriterion: attemptInsertPending.update_criterion,
			pushFurtherHints: pushFurtherHintsForResponse
		};
	}

	// The one write this route was missing entirely until now: a client's
	// SUBMIT_DISPOSITION_CHECKIN was validated and drove the FSM to COMPLETE,
	// but the (dispositionItem, response) pair itself was never persisted —
	// disposition_checkins existed as a table (migration 0009) with no writer.
	// Found while wiring the actual student UI (Prompt 28), same shape as the
	// update-criterion classification bug ADR-022 found the same way.
	if (clientEvent.type === 'SUBMIT_DISPOSITION_CHECKIN' && session.fsmState === 'COMPLETE') {
		const { data: attemptRow } = await serviceRole
			.from('practice_attempts')
			.select('id')
			.eq('session_id', session.id)
			.maybeSingle();
		if (attemptRow) {
			await serviceRole.from('disposition_checkins').insert({
				student_id: locals.user.id,
				attempt_id: attemptRow.id,
				disposition_item: clientEvent.dispositionItem,
				response: clientEvent.response
			});
		}
	}

	const latestTurn = session.transcript[session.transcript.length - 1];
	return json({
		sessionId: session.id,
		fsmState: session.fsmState,
		revealedEvidenceText,
		tutorQuestion:
			session.fsmState === 'AWAIT_CHALLENGE_RESPONSE' && latestTurn
				? latestTurn.questionText
				: null,
		...(outcomeForResponse ? { result: outcomeForResponse } : {})
	});
};
