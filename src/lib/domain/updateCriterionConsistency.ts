/**
 * Deterministic "What would change your mind?" consistency checking
 * (`docs/PHASE2.md` Section 3, `prompts.txt` Prompt 26). Pure and
 * deterministic given its inputs — no I/O, no provider calls. The LLM's
 * only role anywhere near this mechanic is the ordinary
 * `ReasoningClassifierProvider` call (already made by the transition
 * route) that classifies the learner's stated criterion text against
 * this case's `updateCriteria` signals; everything from there —
 * relevance, whether the promised evidence appeared, whether the
 * learner updated consistently — is decided here, by application code
 * reading structural session data (ADR-015's boundary, applied to this
 * mechanic specifically).
 *
 * Five possible outcomes (`UpdateCriterionConsistencyStatusSchema` in
 * `practiceSchemas.ts`), matching Prompt 26's own test list:
 *   - criterion_met_and_followed — promised evidence appeared, learner updated
 *   - criterion_met_no_update — promised evidence appeared, learner did not update
 *   - criterion_not_met_no_update — promised evidence never appeared, learner held firm
 *   - criterion_not_met_updated — promised evidence never appeared, learner updated anyway
 *   - criterion_not_relevant — the stated criterion wasn't classified as
 *     relevant to any of this case's updateCriteria at all (too vague to
 *     score)
 *
 * No "moved goalposts" status. Prompt 26 explicitly asks to be
 * conservative about that determination — this module never accuses;
 * `criterion_not_met_updated`'s explanation states the two relevant
 * facts (evidence didn't appear; judgment changed anyway) and stops
 * there, exactly the register `docs/PHASE2.md` Section 3 specifies
 * ("Your earlier criterion said X would matter. When X appeared, your
 * confidence did not change." — never "You are biased.").
 */
import type {
	LearnerJudgment,
	SignalClassification,
	UpdateCriterion,
	UpdateCriterionConsistencyResult,
	UpdateCriterionConsistencyStatus
} from './practiceSchemas';

/**
 * A confidence change smaller than this is treated as noise, not a
 * genuine update — an arbitrary but documented threshold (0-100 scale),
 * consistent with not wanting single-point drift to count as "changed
 * their mind."
 */
export const SIGNIFICANT_CONFIDENCE_DELTA = 10;

export interface ComputeUpdateCriterionConsistencyInput {
	updateCriteria: readonly UpdateCriterion[];
	/** The full classification result for the learner's stated criterion text against `updateCriteria.map(c => c.signal)` — not pre-filtered to "the first schema-valid one" (that discarded `present: false` results indiscriminately). */
	criterionClassifications: readonly SignalClassification[];
	revealedEvidenceIds: readonly string[];
	initialJudgment: LearnerJudgment;
	revisedJudgment: LearnerJudgment;
}

export interface UpdateCriterionConsistencyComputation {
	result: UpdateCriterionConsistencyResult;
	/** The classification that matched, or null when nothing in `criterionClassifications` was found present and relevant (`criterion_not_relevant`). */
	matchedClassification: SignalClassification | null;
}

function judgmentWasUpdated(initial: LearnerJudgment, revised: LearnerJudgment): boolean {
	return (
		revised.judgment !== initial.judgment ||
		Math.abs(revised.confidence - initial.confidence) >= SIGNIFICANT_CONFIDENCE_DELTA
	);
}

function explanationFor(
	status: UpdateCriterionConsistencyStatus,
	criterionQuote: string | null
): string {
	switch (status) {
		case 'criterion_met_and_followed':
			return `Your earlier criterion said "${criterionQuote}" would matter. That evidence appeared, and your judgment or confidence changed accordingly.`;
		case 'criterion_met_no_update':
			return `Your earlier criterion said "${criterionQuote}" would matter. When that evidence appeared, your judgment and confidence did not change.`;
		case 'criterion_not_met_no_update':
			return `Your earlier criterion said "${criterionQuote}" would matter. That evidence did not appear in this case, and your judgment and confidence did not change either.`;
		case 'criterion_not_met_updated':
			return `Your earlier criterion said "${criterionQuote}" would matter. That evidence did not appear in this case, yet your judgment or confidence changed anyway.`;
		case 'criterion_not_relevant':
			return "We couldn't reliably connect your stated criterion to the evidence in this case, so it isn't reflected in your update-consistency feedback.";
	}
}

/**
 * Finds the first classification that is both `present: true` and
 * actually names one of this case's own `updateCriteria` signals — not
 * merely "the first schema-valid entry regardless of `present`," which
 * is what the transition route did before this module existed (a real
 * bug: it could store a `present: false` classification as if it were
 * a meaningful match).
 */
export function computeUpdateCriterionConsistency(
	input: ComputeUpdateCriterionConsistencyInput
): UpdateCriterionConsistencyComputation {
	const criteriaBySignal = new Map(input.updateCriteria.map((c) => [c.signal, c]));

	const matchedClassification =
		input.criterionClassifications.find((c) => c.present && criteriaBySignal.has(c.signal)) ?? null;

	if (!matchedClassification) {
		return {
			matchedClassification: null,
			result: {
				status: 'criterion_not_relevant',
				explanation: explanationFor('criterion_not_relevant', null),
				matchedCriterionId: null,
				evidenceAppeared: null,
				judgmentUpdated: null
			}
		};
	}

	const criterion = criteriaBySignal.get(matchedClassification.signal)!;
	const evidenceAppeared = criterion.relevantEvidenceItemIds.every((id) =>
		input.revealedEvidenceIds.includes(id)
	);
	const judgmentUpdated = judgmentWasUpdated(input.initialJudgment, input.revisedJudgment);

	let status: UpdateCriterionConsistencyStatus;
	if (evidenceAppeared && judgmentUpdated) status = 'criterion_met_and_followed';
	else if (evidenceAppeared && !judgmentUpdated) status = 'criterion_met_no_update';
	else if (!evidenceAppeared && !judgmentUpdated) status = 'criterion_not_met_no_update';
	else status = 'criterion_not_met_updated';

	return {
		matchedClassification,
		result: {
			status,
			explanation: explanationFor(status, matchedClassification.evidenceQuote),
			matchedCriterionId: criterion.id,
			evidenceAppeared,
			judgmentUpdated
		}
	};
}

/**
 * Maps a consistency result to the deterministic, mechanic-level
 * credit it earns — `states_update_criterion` / `relevant_update_criterion`
 * whenever a genuinely relevant criterion was stated at all, plus
 * `follows_declared_update_criterion` only for the one status where the
 * learner's behavior actually matched their own earlier commitment.
 * These are fed into `computeScoringEvents` (`scoringEvents.ts`)
 * alongside a synthetic mechanic-only rubric by the transition route —
 * not gated by whether a case author happened to list these three
 * cross-case signals in their own `partialCreditSignals`, since the
 * mechanic is universal whenever `usesUpdateCriterion` is on, not a
 * per-case authoring choice (see ADR-022).
 *
 * Deliberately does not synthesize `updates_for_relevant_evidence` —
 * that signal stays purely classifier-driven from the case's own
 * general reasoning text (a case lists it in `partialCreditSignals` if
 * it wants that credit), keeping "did you commit to and follow a
 * specific stated criterion" (this mechanic) separate from "did you
 * update reasonably in general" (ordinary signal classification).
 *
 * Never synthesizes `moves_goalposts_after_evidence` — that signal must
 * never be rewarded (`scoringEvents.ts`'s `NEVER_REWARDED_SIGNALS`) and
 * this module doesn't even attempt to detect it, per Prompt 26's
 * conservatism instruction.
 */
export function deriveUpdateCriterionSignals(
	result: UpdateCriterionConsistencyResult,
	criterionQuote: string | null
): SignalClassification[] {
	if (result.status === 'criterion_not_relevant' || !criterionQuote) return [];

	const signals: SignalClassification[] = [
		{
			signal: 'states_update_criterion',
			present: true,
			confidence: 'high',
			evidenceQuote: criterionQuote
		},
		{
			signal: 'relevant_update_criterion',
			present: true,
			confidence: 'high',
			evidenceQuote: criterionQuote
		}
	];

	if (result.status === 'criterion_met_and_followed') {
		signals.push({
			signal: 'follows_declared_update_criterion',
			present: true,
			confidence: 'high',
			evidenceQuote: criterionQuote
		});
	}

	return signals;
}
