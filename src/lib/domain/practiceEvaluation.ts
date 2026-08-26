/**
 * Educational-validity instrumentation (`prompts.txt` Prompt 34,
 * `docs/EVALUATION_PLAN.md`). Pure functions over already-stored
 * `practice_sessions`/`practice_attempts` data — same discipline as
 * `practiceCalibration.ts` (Prompt 27): the caller does the DB
 * query/reduction into `EvaluationDataPoint[]`, this module does the
 * arithmetic, nothing here touches Supabase or an LLM directly.
 *
 * These are product-engagement and learning-*process* metrics, not
 * evidence of learning outcomes — `docs/EVALUATION_PLAN.md` draws that
 * line explicitly and this module doesn't blur it. Nothing here
 * computes or implies a "critical thinking score."
 *
 * Unlike `practiceCalibration.ts`'s `MIN_SAMPLE_SIZE` gating (which
 * hides an *inferential* accuracy claim — "is this observed rate close
 * to the true rate" — until there's enough data to say anything), the
 * rates here are plain descriptive counts (what fraction of sessions
 * reached COMPLETE, out of how many). Suppressing a rate computed from
 * `n=2` wouldn't make it less true, just less visible — so every
 * function below returns the raw counts alongside the rate rather than
 * hiding small-`n` numbers, with `rate: null` reserved only for the
 * genuine divide-by-zero case (no data at all).
 */
import type { EvidenceSupportJudgment, TutorActionId, TutorState } from './practiceSchemas';

/**
 * One session's already-reduced evaluation-relevant facts. The caller
 * is responsible for the join between `practice_sessions` and
 * `practice_attempts` (a session with no matching attempt row never
 * reached `SCORE_AND_RECORD` — `revisedJudgment`,
 * `revisedSignalsPresent` etc. are `null` for it, not zero-filled, so
 * "never got that far" stays distinguishable from "got there and had
 * none").
 */
export interface EvaluationDataPoint {
	sessionId: string;
	caseId: string;
	/** The session's current (if abandoned) or terminal (if `'COMPLETE'`) FSM state. */
	fsmState: TutorState;
	initialJudgment: EvidenceSupportJudgment | null;
	revisedJudgment: EvidenceSupportJudgment | null;
	/** 0-100, the same value `practiceCalibration.ts` reads from `initialJudgment.confidence`. `null` under the same "never reached that stage" condition as the judgment fields. */
	initialConfidence: number | null;
	/** 0-100, from `revisedJudgment.confidence`. `null` under the same condition. */
	revisedConfidence: number | null;
	updateCriterionSupplied: boolean;
	/** Whether `SUBMIT_REFLECTION` was ever recorded for this session. */
	reflectionCompleted: boolean;
	/** One entry per challenge round actually presented, in order — from `practice_sessions.transcript`. */
	tutorActions: readonly TutorActionId[];
	/**
	 * `present: true` signal ids from the classifier's pass over the
	 * INITIAL reasoning (`practice_attempts.initial_reasoning_signals`,
	 * Prompt 34). `null` when there's no attempt row at all (session
	 * never reached `SCORE_AND_RECORD`) — distinct from an empty array
	 * (classified, genuinely zero signals present).
	 */
	initialSignalsPresent: readonly string[] | null;
	/**
	 * `present: true` signal ids implied by the REVISED reasoning's
	 * stored `scoring_events` (every event with a non-null `signal`
	 * field is one present signal — the rule-summary event, `signal:
	 * null`, is excluded). `null` under the same condition as
	 * `initialSignalsPresent`. Note this is scoped to whatever
	 * `computeScoringEvents` actually emits: a signal in
	 * `NEVER_REWARDED_SIGNALS` (`moves_goalposts_after_evidence`) would
	 * never appear here even if the classifier detected it present —
	 * a known, accepted gap in this one signal's evaluation coverage,
	 * not worth a new column just for it.
	 */
	revisedSignalsPresent: readonly string[] | null;
}

export interface RateSummary {
	count: number;
	total: number;
	/** `null` only when `total === 0` — otherwise always a real, unsuppressed number, see this module's header comment. */
	rate: number | null;
}

function rateOf(count: number, total: number): RateSummary {
	return { count, total, rate: total > 0 ? count / total : null };
}

/** Product engagement — "do users finish cases?" */
export function computeCompletionRate(points: readonly EvaluationDataPoint[]): RateSummary {
	return rateOf(points.filter((p) => p.fsmState === 'COMPLETE').length, points.length);
}

export interface StageAbandonmentEntry {
	stage: TutorState;
	count: number;
}

/**
 * Where non-completed sessions actually stall, grouped by their current
 * `fsmState` — sorted most-common first, since "which single stage
 * loses the most students" is usually the actionable question.
 * Deliberately includes every non-`'COMPLETE'` point regardless of how
 * recently it was touched — recency-based "is this truly abandoned, or
 * just in progress right now" filtering is a query-time/caller concern
 * (it needs a live cutoff decision this pure function has no business
 * making), not something baked in here.
 */
export function computeStageAbandonment(
	points: readonly EvaluationDataPoint[]
): StageAbandonmentEntry[] {
	const counts = new Map<TutorState, number>();
	for (const p of points) {
		if (p.fsmState === 'COMPLETE') continue;
		counts.set(p.fsmState, (counts.get(p.fsmState) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([stage, count]) => ({ stage, count }))
		.sort((a, b) => b.count - a.count);
}

/** Distribution of initial or revised judgments across sessions that reached that stage — "do confidence/judgement patterns look proportionate," per `docs/EVALUATION_PLAN.md`'s learning-process questions. */
export function computeJudgmentDistribution(
	points: readonly EvaluationDataPoint[],
	which: 'initial' | 'revised'
): Record<EvidenceSupportJudgment, number> {
	const counts: Partial<Record<EvidenceSupportJudgment, number>> = {};
	for (const p of points) {
		const judgment = which === 'initial' ? p.initialJudgment : p.revisedJudgment;
		if (!judgment) continue;
		counts[judgment] = (counts[judgment] ?? 0) + 1;
	}
	return counts as Record<EvidenceSupportJudgment, number>;
}

/** Whether students engage with the `COMMIT_UPDATE_CRITERION` mechanic when a case offers it. Only meaningful over points from cases with `usesUpdateCriterion: true` — the caller filters, this module has no case-lookup capability of its own (same discipline as `practiceCalibration.ts`). */
export function computeUpdateCriterionRate(points: readonly EvaluationDataPoint[]): RateSummary {
	return rateOf(points.filter((p) => p.updateCriterionSupplied).length, points.length);
}

/** "Whether final reflection was completed" — one of Prompt 34's explicitly-named metrics. */
export function computeReflectionCompletionRate(
	points: readonly EvaluationDataPoint[]
): RateSummary {
	return rateOf(points.filter((p) => p.reflectionCompleted).length, points.length);
}

/** How often each pedagogical move gets selected, across every challenge round in every session — "tutor action categories," per Prompt 34's list. */
export function computeTutorActionDistribution(
	points: readonly EvaluationDataPoint[]
): Record<TutorActionId, number> {
	const counts: Partial<Record<TutorActionId, number>> = {};
	for (const p of points) {
		for (const action of p.tutorActions) {
			counts[action] = (counts[action] ?? 0) + 1;
		}
	}
	return counts as Record<TutorActionId, number>;
}

export interface SignalDeltaEntry {
	signal: string;
	/** How many sessions newly demonstrated this signal in their revised reasoning, having not demonstrated it initially. */
	count: number;
}

/**
 * "Reasoning signals added after challenge" — Prompt 34's explicitly-
 * named metric, and the one requiring new instrumentation
 * (`initial_reasoning_signals`, migration 0012) to answer honestly:
 * before this, only the revised reasoning was ever classified, so there
 * was no baseline to diff against. Only counts points where BOTH sides
 * were actually classified (`initialSignalsPresent` and
 * `revisedSignalsPresent` both non-null) — a session that never reached
 * `SCORE_AND_RECORD` contributes nothing here, correctly, rather than
 * being silently treated as "added nothing."
 */
export function computeSignalsAddedAfterChallenge(
	points: readonly EvaluationDataPoint[]
): SignalDeltaEntry[] {
	const counts = new Map<string, number>();
	for (const p of points) {
		if (!p.initialSignalsPresent || !p.revisedSignalsPresent) continue;
		const initialSet = new Set(p.initialSignalsPresent);
		for (const signal of p.revisedSignalsPresent) {
			if (!initialSet.has(signal)) {
				counts.set(signal, (counts.get(signal) ?? 0) + 1);
			}
		}
	}
	return [...counts.entries()]
		.map(([signal, count]) => ({ signal, count }))
		.sort((a, b) => b.count - a.count);
}

export interface ConfidenceShiftSummary {
	count: number;
	/** Mean of (revisedConfidence - initialConfidence) across included points — positive means confidence rose on average, negative means it fell. `null` when there's no data at all. */
	meanShift: number | null;
	/** How many sessions moved by more than 20 points (one confidence band, `practiceCalibration.ts`'s `CONFIDENCE_BANDS` width) in either direction — a coarse "did evidence actually move this student" count, alongside the mean. */
	movedMoreThanOneBand: number;
}

/**
 * "Changes in confidence after material evidence" — one of `prompts.txt`
 * Prompt 36's proposed behavioural indicators. Only counts points with
 * both confidence values present (a session that never reached the
 * revised-confidence stage contributes nothing, same "don't zero-fill a
 * missing stage" discipline as `computeSignalsAddedAfterChallenge`).
 * Deliberately reports a mean AND a coarser "moved by a real band"
 * count together, not just the mean alone — a mean near zero could
 * hide a genuine mix of students swinging confidently in both
 * directions, which the mean alone would misleadingly read as "nobody
 * changed their mind."
 */
export function computeConfidenceShift(
	points: readonly EvaluationDataPoint[]
): ConfidenceShiftSummary {
	const shifts = points
		.filter((p) => p.initialConfidence !== null && p.revisedConfidence !== null)
		.map((p) => p.revisedConfidence! - p.initialConfidence!);

	return {
		count: shifts.length,
		meanShift: shifts.length > 0 ? shifts.reduce((sum, s) => sum + s, 0) / shifts.length : null,
		movedMoreThanOneBand: shifts.filter((s) => Math.abs(s) > 20).length
	};
}
