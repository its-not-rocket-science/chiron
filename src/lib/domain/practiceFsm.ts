/**
 * The Phase 2A tutor state machine (`docs/PHASE2.md` Section 3,
 * `docs/PHASE2A_IMPLEMENTATION.md` Section 8, `prompts.txt` Prompt 22).
 * Pure domain logic: no I/O, no provider calls, no Supabase client.
 *
 * States that need an LLM (`PRESENT_CHALLENGE` needs a `TutorProvider`
 * challenge; `SCORE_AND_RECORD` needs a `ReasoningClassifierProvider`
 * classification) do NOT resolve themselves here — `advance()` lands
 * the session at that state and returns control to the caller (a route
 * handler), which calls the relevant provider and feeds the result back
 * in as the next event (`CHALLENGE_SELECTED`, `SCORED`). This is what
 * keeps this module provider-free and exhaustively unit-testable
 * without a live LLM: every transition here is driven by an explicit,
 * caller-supplied event, never by this module reaching out to anything.
 *
 * The client never determines progression — `advance()` is the only
 * thing that decides the next state, and it only accepts the one event
 * type valid for the session's *current* state, rejecting anything
 * else (including "the LLM tried to skip ahead") as a safe, typed
 * failure rather than silently doing something unexpected.
 */
import {
	deriveCaseStages,
	type ConfidenceRating,
	type EvidenceSupportJudgment,
	type LearnerJudgment,
	type PracticeCase,
	type PracticeSession,
	type ReasoningRubric,
	type ScoringExplanation,
	type SignalClassification,
	type TutorAction,
	type TutorState
} from './practiceSchemas';

/** Safety bound on challenge rounds, independent of evidence count — defense in depth against a runaway loop, not the primary stop condition (that's "no more evidence left"). */
export const MAX_CHALLENGE_ROUNDS = 6;

/**
 * `prompts.txt` Prompt 32's "maximum classifier calls per stage" —
 * `SCORE_AND_RECORD` is the only FSM stage that ever calls a
 * `ReasoningClassifierProvider`, and it does so at most three times: the
 * main (revised) reasoning signals; the update-criterion signals, only
 * if the case uses that mechanic (`practiceCase.usesUpdateCriterion`);
 * and, since `prompts.txt` Prompt 34, the student's INITIAL reasoning
 * signals — classified so "reasoning signals added after challenge"
 * (one of Prompt 34's named evaluation metrics) is a real before/after
 * diff, not a documented gap (see `docs/EVALUATION_PLAN.md`,
 * `practiceEvaluation.ts`). Named here (rather than left as an implicit
 * fact about the route) so the bound is documented next to
 * `MAX_CHALLENGE_ROUNDS`, not just true by accident of how the route
 * happens to be written. `SCORE_AND_RECORD` itself is reachable at most
 * once per session — `advance()`'s switch only transitions into it from
 * `ASK_REFLECTION`, and once a session has moved past it
 * (`DISPOSITION_SELF_CHECK`/`COMPLETE`), no event type accepted by
 * either of those states can re-enter it. Verified live:
 * `tests/rls/practiceFullPlaythrough.integration.spec.ts` submits a
 * duplicate post-`COMPLETE` event and confirms it's rejected without
 * creating a second `practice_attempts` row.
 */
export const MAX_CLASSIFIER_CALLS_PER_STAGE = 3;

/**
 * The full worst-case model-call budget for one completed attempt:
 * every tutor call (bounded by `MAX_CHALLENGE_ROUNDS`) plus every
 * classifier call (bounded by `MAX_CLASSIFIER_CALLS_PER_STAGE`, and
 * only ever at the one-time `SCORE_AND_RECORD` stage). Documented in
 * `docs/DECISIONS.md` ADR-006's Prompt 32 update and
 * `docs/SECURITY.md` Section 9 alongside the per-user rate limit
 * (`prompts.txt` Prompt 31) that separately bounds how often this
 * budget can be spent.
 */
export const MAX_MODEL_CALLS_PER_ATTEMPT = MAX_CHALLENGE_ROUNDS + MAX_CLASSIFIER_CALLS_PER_STAGE;

export type FsmEvent =
	| { type: 'SUBMIT_INITIAL_JUDGMENT'; judgment: EvidenceSupportJudgment; reasoning: string }
	| { type: 'SUBMIT_INITIAL_CONFIDENCE'; confidence: ConfidenceRating }
	| { type: 'SUBMIT_UPDATE_CRITERION'; text: string }
	| { type: 'CHALLENGE_SELECTED'; action: TutorAction; questionText: string }
	| { type: 'SUBMIT_CHALLENGE_RESPONSE'; response: string }
	| { type: 'SUBMIT_REVISED_JUDGMENT'; judgment: EvidenceSupportJudgment; reasoning: string }
	| { type: 'SUBMIT_REVISED_CONFIDENCE'; confidence: ConfidenceRating }
	| { type: 'SUBMIT_REFLECTION'; text: string }
	| { type: 'SCORED'; explanation: ScoringExplanation }
	| { type: 'SUBMIT_DISPOSITION_CHECKIN'; dispositionItem: string; response: number };

export interface FsmStepOk {
	ok: true;
	session: PracticeSession;
	/** Set only on the step that reveals a new evidence item (part of the same transition as SUBMIT_CHALLENGE_RESPONSE, when more evidence remains) — the id the caller should show the student. */
	revealedEvidenceItemId?: string;
}
export interface FsmStepErr {
	ok: false;
	error: string;
}
export type FsmStepResult = FsmStepOk | FsmStepErr;

function err(message: string): FsmStepErr {
	return { ok: false, error: message };
}

function touch(session: PracticeSession, patch: Partial<PracticeSession>): PracticeSession {
	return { ...session, ...patch, updatedAt: new Date().toISOString() };
}

/**
 * Advances a session by exactly one caller-supplied event. Rejects any
 * event that doesn't match the session's current state — this is the
 * enforcement point for "the LLM/client cannot skip FSM states": there
 * is no code path from any state to any other state except the ones
 * listed below, and every one of them requires the specific event that
 * state is actually waiting for.
 */
export function advance(
	session: PracticeSession,
	practiceCase: PracticeCase,
	event: FsmEvent
): FsmStepResult {
	if (practiceCase.id !== session.caseId) {
		return err('event does not belong to this session’s case');
	}

	switch (session.fsmState) {
		case 'PRESENT_SCENARIO':
		case 'ASK_INITIAL_JUDGMENT': {
			if (event.type !== 'SUBMIT_INITIAL_JUDGMENT') return err('expected SUBMIT_INITIAL_JUDGMENT');
			if (session.initialJudgment !== null) return err('initial judgment already recorded');
			// Confidence is collected next (ASK_INITIAL_CONFIDENCE); stash
			// judgment+reasoning now, complete the LearnerJudgment record
			// once confidence arrives.
			return {
				ok: true,
				session: touch(session, {
					fsmState: 'ASK_INITIAL_CONFIDENCE',
					// Partial — confidence filled in by the next transition.
					// Stored with confidence 0 as a placeholder; never read
					// before ASK_INITIAL_CONFIDENCE completes it.
					initialJudgment: { judgment: event.judgment, confidence: 0, reasoning: event.reasoning }
				})
			};
		}

		case 'ASK_INITIAL_CONFIDENCE': {
			if (event.type !== 'SUBMIT_INITIAL_CONFIDENCE')
				return err('expected SUBMIT_INITIAL_CONFIDENCE');
			if (!session.initialJudgment)
				return err('no initial judgment recorded to attach confidence to');
			const initialJudgment: LearnerJudgment = {
				...session.initialJudgment,
				confidence: event.confidence
			};
			const nextState: TutorState = practiceCase.usesUpdateCriterion
				? 'COMMIT_UPDATE_CRITERION'
				: 'PRESENT_CHALLENGE';
			return { ok: true, session: touch(session, { fsmState: nextState, initialJudgment }) };
		}

		case 'COMMIT_UPDATE_CRITERION': {
			if (!practiceCase.usesUpdateCriterion)
				return err('this case does not use the update-criterion mechanic');
			if (event.type !== 'SUBMIT_UPDATE_CRITERION') return err('expected SUBMIT_UPDATE_CRITERION');
			return {
				ok: true,
				session: touch(session, { fsmState: 'PRESENT_CHALLENGE', updateCriterionText: event.text })
			};
		}

		case 'PRESENT_CHALLENGE': {
			// Reached here either from ASK_INITIAL_CONFIDENCE/COMMIT_UPDATE_CRITERION,
			// or looped back from a SUBMIT_CHALLENGE_RESPONSE that revealed
			// more evidence. Waits for the caller to have already called
			// TutorProvider and supply its result — this module never
			// selects a challenge itself.
			if (event.type !== 'CHALLENGE_SELECTED') return err('expected CHALLENGE_SELECTED');
			return {
				ok: true,
				session: touch(session, {
					fsmState: 'AWAIT_CHALLENGE_RESPONSE',
					transcript: [
						...session.transcript,
						{ action: event.action, questionText: event.questionText, response: null }
					]
				})
			};
		}

		case 'AWAIT_CHALLENGE_RESPONSE': {
			if (event.type !== 'SUBMIT_CHALLENGE_RESPONSE')
				return err('expected SUBMIT_CHALLENGE_RESPONSE');
			const lastTurn = session.transcript[session.transcript.length - 1];
			if (!lastTurn || lastTurn.response !== null) {
				return err('no pending challenge to respond to');
			}
			const transcript = [
				...session.transcript.slice(0, -1),
				{ ...lastTurn, response: event.response }
			];

			const stages = deriveCaseStages(practiceCase.evidencePool);
			const challengeRounds = transcript.length;
			const nextStage = stages[session.revealedEvidenceIds.length];
			const moreEvidence = Boolean(nextStage) && challengeRounds < MAX_CHALLENGE_ROUNDS;

			if (moreEvidence && nextStage) {
				return {
					ok: true,
					session: touch(session, {
						fsmState: 'PRESENT_CHALLENGE',
						transcript,
						revealedEvidenceIds: [...session.revealedEvidenceIds, nextStage.evidenceItemId]
					}),
					revealedEvidenceItemId: nextStage.evidenceItemId
				};
			}
			return {
				ok: true,
				session: touch(session, { fsmState: 'ASK_REVISED_JUDGMENT', transcript })
			};
		}

		case 'ASK_REVISED_JUDGMENT': {
			if (event.type !== 'SUBMIT_REVISED_JUDGMENT') return err('expected SUBMIT_REVISED_JUDGMENT');
			// "No change" is a fully legitimate revised judgment — nothing
			// here compares it to the initial one or treats agreement
			// specially. Same for either direction of a real change.
			return {
				ok: true,
				session: touch(session, {
					fsmState: 'ASK_REVISED_CONFIDENCE',
					// Same partial-then-complete pattern as initialJudgment —
					// confidence filled in by the next transition.
					revisedJudgment: { judgment: event.judgment, confidence: 0, reasoning: event.reasoning }
				})
			};
		}

		case 'ASK_REVISED_CONFIDENCE': {
			if (event.type !== 'SUBMIT_REVISED_CONFIDENCE')
				return err('expected SUBMIT_REVISED_CONFIDENCE');
			if (!session.revisedJudgment)
				return err('no revised judgment recorded to attach confidence to');
			return {
				ok: true,
				session: touch(session, {
					fsmState: 'ASK_REFLECTION',
					revisedJudgment: { ...session.revisedJudgment, confidence: event.confidence }
				})
			};
		}

		case 'ASK_REFLECTION': {
			if (event.type !== 'SUBMIT_REFLECTION') return err('expected SUBMIT_REFLECTION');
			return {
				ok: true,
				session: touch(session, { fsmState: 'SCORE_AND_RECORD', reflectionText: event.text })
			};
		}

		case 'SCORE_AND_RECORD': {
			// Waits for the caller to have already run the classifier and
			// the deterministic outcome algorithm (computeOutcome below) —
			// this module never decides scoring.
			if (event.type !== 'SCORED') return err('expected SCORED');
			return { ok: true, session: touch(session, { fsmState: 'DISPOSITION_SELF_CHECK' }) };
		}

		case 'DISPOSITION_SELF_CHECK': {
			if (event.type !== 'SUBMIT_DISPOSITION_CHECKIN')
				return err('expected SUBMIT_DISPOSITION_CHECKIN');
			return { ok: true, session: touch(session, { fsmState: 'COMPLETE' }) };
		}

		case 'PRESENT_NEW_EVIDENCE':
			// Named in TutorStateSchema (matching prompts.txt Prompt 22's
			// state list) but never actually persisted as session.fsmState
			// under this implementation: evidence reveal is deterministic
			// and needs no external input, so AWAIT_CHALLENGE_RESPONSE's
			// own transition folds straight through it to PRESENT_CHALLENGE
			// (see revealedEvidenceItemId above) rather than stopping here
			// for a round-trip nothing needs. Reachable only if something
			// outside this module wrote this value into a session row.
			return err('PRESENT_NEW_EVIDENCE is not a state advance() ever persists a session in');

		case 'COMPLETE':
			return err('this session has already completed — no further transitions accepted');
	}
}

/**
 * The deterministic outcome algorithm (`docs/PHASE2.md` Section 4,
 * ADR-018) — implemented here (not deferred to `prompts.txt` Prompt 25)
 * because `advance()`'s SCORE_AND_RECORD step needs a real
 * ScoringExplanation to be genuinely testable end-to-end now, and the
 * algorithm itself is small and was already fully specified. Prompt
 * 25's remaining, distinct job is the fuller per-signal ScoringEvent
 * audit-record system (skill mapping, stage-tagged events) — this
 * function only produces the outcome + matched-rule record, not that
 * richer audit trail.
 */
export function computeOutcome(
	revisedJudgment: EvidenceSupportJudgment,
	detectedSignals: readonly SignalClassification[],
	rubric: ReasoningRubric
): ScoringExplanation {
	for (const rule of rubric.finalJudgmentRules) {
		if (!rule.acceptedJudgments.includes(revisedJudgment)) continue;
		const presentCount = detectedSignals.filter(
			(s) => rule.requiredSignals.includes(s.signal) && s.present
		).length;
		if (presentCount >= rule.minimumRequired) {
			return { detectedSignals: [...detectedSignals], matchedRuleId: rule.id, outcome: 'correct' };
		}
	}
	return { detectedSignals: [...detectedSignals], matchedRuleId: null, outcome: 'incorrect' };
}
