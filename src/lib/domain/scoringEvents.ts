/**
 * Deterministic per-signal scoring-event emission (`docs/PHASE2.md`
 * Section 4, `prompts.txt` Prompt 25). `practiceFsm.ts`'s
 * `computeOutcome()` already decides the pass/fail `ScoringExplanation`
 * (docs/PHASE2A_IMPLEMENTATION.md's originally-planned
 * `reasoningRubricScoring.ts` module, absorbed into `practiceFsm.ts` in
 * Prompt 22 — see the comment there) — this module's distinct job is
 * turning that plus the full set of classified reasoning signals into
 * the richer, itemized `ScoringEvent[]` audit trail: one inspectable
 * record per demonstrated reasoning move, each naming exactly which
 * signal or rule caused it, which critical-thinking skill(s) it
 * touches, and a human-readable (case-author-written or statically
 * authored, never LLM-generated) explanation.
 *
 * Pure and deterministic given its inputs — no I/O, no provider calls.
 * `id` and `createdAt` are the only non-deterministic fields (a fresh
 * id/timestamp per call, same as every other domain object that carries
 * one); everything else about the emitted events is a pure function of
 * `detectedSignals`, `rubric`, and `matchedRuleId`.
 *
 * No LLM-generated points and no single fake-precision "critical
 * thinking score" here (`prompts.txt` Prompt 25's explicit
 * requirement) — every event is either "this authored rule was
 * satisfied" or "this specific, classifier-detected signal was
 * demonstrated," never a number. Skill aggregation across events, if
 * ever needed, stays categorical (Prompt 25: "insufficient evidence /
 * emerging evidence / repeated evidence"-style buckets) — not built
 * here, since nothing in Phase 2A yet consumes an aggregate view.
 *
 * Deliberately credit-only: there is no such thing as a negative
 * ScoringEvent. A signal that must never be rewarded —
 * `moves_goalposts_after_evidence` (docs/PHASE2.md's explicit
 * invariant: updating without the promised evidence appearing is not a
 * credit-worthy move) — is excluded from emission even if a future case
 * author mistakenly lists it as a `partialCreditSignal`, not merely
 * left out of the skill/description maps below.
 */
import { randomUUID } from 'node:crypto';
import type { CTSkillId } from './taxonomy';
import type {
	EvidenceSupportJudgment,
	ReasoningRubric,
	ScoringEvent,
	SignalClassification,
	TutorState
} from './practiceSchemas';

const NEVER_REWARDED_SIGNALS = new Set(['moves_goalposts_after_evidence']);

const DEFAULT_SKILLS: readonly CTSkillId[] = ['evaluation'];

/**
 * Which critical-thinking skill(s) a given reasoning signal touches.
 * Covers the cross-case vocabulary (`reasoningSignalIds` in
 * `practiceSchemas.ts`); a case's own per-case update-criterion signal
 * (e.g. `requests_comparison_street`) falls through to
 * `DEFAULT_SKILLS` — reasonable since any such signal is, by
 * construction, about recognizing what evidence would matter
 * (evaluation), and a case author naming a genuinely different skill
 * for their own custom signal is a future authoring concern, not one
 * this static map can anticipate.
 */
const SIGNAL_SKILLS: Record<string, readonly CTSkillId[]> = {
	identifies_missing_evidence: ['inference', 'evaluation'],
	distinguishes_correlation_from_causation: ['inference', 'analysis'],
	identifies_confounder: ['inference', 'analysis'],
	generates_alternative_hypothesis: ['inference'],
	identifies_source_problem: ['evaluation'],
	identifies_denominator_problem: ['analysis', 'evaluation'],
	identifies_base_rate_issue: ['analysis', 'evaluation'],
	acknowledges_uncertainty: ['self_regulation', 'evaluation'],
	updates_for_relevant_evidence: ['self_regulation'],
	resists_irrelevant_evidence: ['self_regulation', 'evaluation'],
	states_update_criterion: ['explanation', 'self_regulation'],
	relevant_update_criterion: ['evaluation', 'self_regulation'],
	follows_declared_update_criterion: ['self_regulation'],
	recognises_limit_of_available_evidence: ['evaluation', 'self_regulation']
};

/** Statically authored, never LLM-generated — same discipline as `ReasoningRule.explanation` (case-authored) and Phase 1's rubric text. */
const SIGNAL_DESCRIPTIONS: Record<string, string> = {
	identifies_missing_evidence:
		'You identified specific evidence that would be needed to settle this more confidently, rather than treating what was shown as the whole picture.',
	distinguishes_correlation_from_causation:
		'You distinguished an observed association from an established causal link, rather than treating the two as the same thing.',
	identifies_confounder:
		'You identified a plausible alternative explanation for the outcome, not just the one being tested.',
	generates_alternative_hypothesis:
		'You generated an alternative explanation before settling on one, rather than accepting the first explanation offered.',
	identifies_source_problem:
		'You questioned whether the sources were actually independent of one another, rather than treating repetition as corroboration.',
	identifies_denominator_problem:
		'You looked past the headline relative figure to what it means in absolute terms.',
	identifies_base_rate_issue:
		'You considered the underlying base rate rather than taking the reported figure at face value.',
	acknowledges_uncertainty:
		'You acknowledged genuine uncertainty rather than overstating how settled the evidence is.',
	updates_for_relevant_evidence:
		'You revised your judgment in response to evidence that was actually relevant to it.',
	resists_irrelevant_evidence:
		'You held your judgment steady in the face of evidence that did not actually bear on it.',
	states_update_criterion: 'You stated, in advance, what evidence would change your mind.',
	relevant_update_criterion:
		'The criterion you stated was one that would genuinely bear on this claim.',
	follows_declared_update_criterion:
		'Your final judgment was consistent with the standard you committed to earlier.',
	recognises_limit_of_available_evidence:
		'You recognized what the currently available evidence can, and cannot, establish.'
};

function describeSignal(signal: string): string {
	return SIGNAL_DESCRIPTIONS[signal] ?? `You demonstrated ${signal.replace(/_/g, ' ')}.`;
}

/**
 * Statically authored, phrased as a prospective invitation rather than
 * a past-tense credit statement — `computePushFurtherHints`'s "where
 * you could push further" (`prompts.txt` Prompt 29) shows these for
 * signals the case's rubric cares about that weren't detected as
 * present, never as accusatory ("you failed to...") language.
 */
const PUSH_FURTHER_PHRASING: Record<string, string> = {
	identifies_missing_evidence:
		'What additional evidence would you still want to see before settling on this?',
	distinguishes_correlation_from_causation:
		'Worth naming explicitly: does this evidence show correlation, causation, or something short of that?',
	identifies_confounder:
		'Is there a plausible alternative cause for this outcome, beyond the one being tested?',
	generates_alternative_hypothesis:
		'What is at least one other explanation that could account for this, before settling on the first one?',
	identifies_source_problem:
		'Are these really independent sources, or do they trace back to one origin?',
	identifies_denominator_problem:
		'What does this look like in absolute terms, not just relative terms?',
	identifies_base_rate_issue:
		'What is the underlying base rate here, and does it change how you read this figure?',
	acknowledges_uncertainty:
		'Is there a part of this you are genuinely unsure about, worth naming directly?',
	updates_for_relevant_evidence:
		'Did any of the evidence you saw actually call for updating your view?',
	resists_irrelevant_evidence:
		'Is there evidence here that looks relevant but, on a closer look, does not actually bear on the claim?',
	states_update_criterion: 'What evidence, if it had appeared, would have changed your mind?',
	relevant_update_criterion: 'Would the criterion you stated have actually mattered to this claim?',
	follows_declared_update_criterion:
		'Did your final judgement follow through on what you said would change your mind?',
	recognises_limit_of_available_evidence:
		'What can, and cannot, the evidence shown here actually establish?'
};

function pushFurtherPhrasing(signal: string): string {
	return PUSH_FURTHER_PHRASING[signal] ?? `Consider: ${signal.replace(/_/g, ' ')}.`;
}

export interface ComputeScoringEventsInput {
	attemptId: string;
	stage: TutorState;
	rubric: ReasoningRubric;
	/** From `ScoringExplanation.matchedRuleId` (`computeOutcome` in `practiceFsm.ts`) — null when no rule was satisfied. */
	matchedRuleId: string | null;
	detectedSignals: readonly SignalClassification[];
}

/**
 * Produces one `ScoringEvent` per demonstrated, rubric-relevant
 * reasoning signal, plus (when `matchedRuleId` is set) one additional
 * rule-summary event carrying the case author's own `explanation` for
 * why the final judgment earned credit. A signal is "rubric-relevant"
 * if it appears in any `finalJudgmentRule.requiredSignals` or in
 * `rubric.partialCreditSignals` — signals outside that set produce no
 * event even if `present: true`, since nothing in this case's authored
 * rubric assigns them meaning (and, in the real pipeline, the
 * classifier is never even asked about signals outside this set — see
 * the transition route's `candidateSignals` construction).
 */
export function computeScoringEvents(input: ComputeScoringEventsInput): ScoringEvent[] {
	const { attemptId, stage, rubric, matchedRuleId, detectedSignals } = input;

	const relevantSignals = new Set<string>([
		...rubric.finalJudgmentRules.flatMap((r) => r.requiredSignals),
		...rubric.partialCreditSignals
	]);

	const events: ScoringEvent[] = [];

	const matchedRule = matchedRuleId
		? rubric.finalJudgmentRules.find((r) => r.id === matchedRuleId)
		: undefined;
	if (matchedRule) {
		const firstSatisfyingSignal = detectedSignals.find(
			(s) => s.present && matchedRule.requiredSignals.includes(s.signal)
		);
		const skills = [
			...new Set(matchedRule.requiredSignals.flatMap((s) => SIGNAL_SKILLS[s] ?? DEFAULT_SKILLS))
		];
		events.push({
			id: randomUUID(),
			attemptId,
			ruleId: matchedRule.id,
			signal: null,
			affectedSkills: skills.length > 0 ? skills : [...DEFAULT_SKILLS],
			explanation: matchedRule.explanation,
			evidenceQuote: firstSatisfyingSignal?.evidenceQuote ?? null,
			stage,
			createdAt: new Date().toISOString()
		});
	}

	for (const classification of detectedSignals) {
		if (!classification.present) continue;
		if (NEVER_REWARDED_SIGNALS.has(classification.signal)) continue;
		if (!relevantSignals.has(classification.signal)) continue;

		events.push({
			id: randomUUID(),
			attemptId,
			ruleId: null,
			signal: classification.signal,
			affectedSkills: [...(SIGNAL_SKILLS[classification.signal] ?? DEFAULT_SKILLS)],
			explanation: describeSignal(classification.signal),
			evidenceQuote: classification.evidenceQuote,
			stage,
			createdAt: new Date().toISOString()
		});
	}

	return events;
}

/**
 * "Where you could push further" (`prompts.txt` Prompt 29) — derived
 * entirely from the case's own authored `rubric` and the classifier's
 * full per-candidate-signal evaluation (`detectedSignals` includes a
 * `present: true` *or* `present: false` entry for every signal it was
 * asked about — see `classifierPrompt.ts`'s "include exactly one entry
 * per candidate signal" instruction), never from a fresh LLM call of
 * its own. Scoped to what's actually relevant to the judgement the
 * student landed on:
 *   - the `requiredSignals` of whichever `finalJudgmentRules` accept
 *     `revisedJudgment` (there may be more than one — a case can have
 *     several creditable rules for the same judgement band), so a
 *     suggestion is never "go earn a completely different final
 *     answer";
 *   - `rubric.partialCreditSignals`, which apply regardless of final
 *     judgement.
 * Never suggests `moves_goalposts_after_evidence` — that signal must
 * never be invited toward, only `scoringEvents.ts`'s existing
 * `NEVER_REWARDED_SIGNALS` guard applies here too.
 */
export function computePushFurtherHints(
	revisedJudgment: EvidenceSupportJudgment,
	rubric: ReasoningRubric,
	detectedSignals: readonly SignalClassification[]
): string[] {
	const presentSignals = new Set(detectedSignals.filter((s) => s.present).map((s) => s.signal));

	const applicableRules = rubric.finalJudgmentRules.filter((r) =>
		r.acceptedJudgments.includes(revisedJudgment)
	);

	const candidateMissing = new Set<string>();
	for (const rule of applicableRules) {
		for (const signal of rule.requiredSignals) {
			if (!presentSignals.has(signal)) candidateMissing.add(signal);
		}
	}
	for (const signal of rubric.partialCreditSignals) {
		if (!presentSignals.has(signal)) candidateMissing.add(signal);
	}

	return [...candidateMissing]
		.filter((signal) => !NEVER_REWARDED_SIGNALS.has(signal))
		.map(pushFurtherPhrasing);
}
