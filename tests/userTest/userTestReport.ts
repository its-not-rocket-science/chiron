/**
 * Pure reduction/aggregation logic for the user-test export CLI
 * (chiron_calibration_feedback_and_automation_prompts.txt). Mirrors
 * `tests/calibration/evaluateCalibration.ts`'s split: this module knows
 * how to turn raw DB rows into the shapes `practiceEvaluation.ts`/
 * `practiceCalibration.ts` already expect, and how to aggregate/flag
 * them — `scripts/export-user-test.ts` only fetches rows and writes
 * files. Nothing here touches Supabase or the filesystem, so it's
 * testable with plain fixture objects.
 */
import {
	computeCalibrationReport,
	judgmentWithinTargetRange,
	type CalibrationDataPoint,
	type CalibrationReport
} from '../../src/lib/domain/practiceCalibration';
import {
	computeCompletionRate,
	computeConfidenceShift,
	computeJudgmentDistribution,
	computeReflectionCompletionRate,
	computeSignalsAddedAfterChallenge,
	computeStageAbandonment,
	computeTutorActionDistribution,
	computeUpdateCriterionRate,
	type ConfidenceShiftSummary,
	type EvaluationDataPoint,
	type RateSummary,
	type SignalDeltaEntry,
	type StageAbandonmentEntry
} from '../../src/lib/domain/practiceEvaluation';
import { getPracticeCase, practiceCases } from '../../src/lib/domain/practiceCases';
import type {
	EvidenceSupportJudgment,
	LearnerJudgment,
	ScoringEvent,
	SignalClassification,
	TutorActionId,
	TutorState,
	UpdateCriterionConsistencyStatus
} from '../../src/lib/domain/practiceSchemas';
import type { UpdateCriterionUnderstandable } from '../../src/lib/domain/userTestFeedback';

// ---------------------------------------------------------------------------
// Raw row shapes — exactly the columns the export script selects, jsonb
// columns typed `unknown` and narrowed by the reduction functions below,
// never trusted structurally beyond what's actually read.
// ---------------------------------------------------------------------------

export interface RawTranscriptTurn {
	action: { action: TutorActionId };
	questionText: string;
	response: string | null;
}

export interface RawSessionRow {
	id: string;
	student_id: string;
	case_id: string;
	fsm_state: TutorState;
	revealed_evidence_ids: string[];
	transcript: RawTranscriptTurn[];
	initial_judgment: LearnerJudgment | null;
	update_criterion_text: string | null;
	revised_judgment: LearnerJudgment | null;
	reflection_text: string | null;
	test_cohort: string | null;
	created_at: string;
}

export interface RawAttemptRow {
	id: string;
	student_id: string;
	case_id: string;
	session_id: string;
	initial_judgment: LearnerJudgment;
	update_criterion: {
		text: string;
		classification: SignalClassification | null;
		consistency: { status: UpdateCriterionConsistencyStatus; explanation: string };
	} | null;
	revised_judgment: LearnerJudgment;
	scoring_events: ScoringEvent[];
	initial_reasoning_signals: SignalClassification[] | null;
	outcome: 'correct' | 'incorrect';
	created_at: string;
}

export interface RawCheckinRow {
	id: string;
	student_id: string;
	attempt_id: string;
	disposition_item: string;
	response: number;
	created_at: string;
}

export interface RawFeedbackRow {
	id: string;
	student_id: string;
	test_cohort: string;
	cases_understandable: number;
	tutor_made_think: number;
	new_evidence_meaningful: number;
	tutor_repetitive: number;
	confidence_understandable: number;
	update_criterion_understandable: UpdateCriterionUnderstandable;
	perceived_steering: boolean;
	perceived_steering_explanation: string | null;
	would_continue: boolean;
	what_worked_best: string | null;
	what_needs_changing: string | null;
	created_at: string;
}

// ---------------------------------------------------------------------------
// EvaluationDataPoint / CalibrationDataPoint reduction
// ---------------------------------------------------------------------------

/**
 * One session per point, joined to its attempt (if any) by `session_id`
 * — same "don't zero-fill a stage never reached" discipline
 * `practiceEvaluation.ts`'s own doc comments require. A session with no
 * matching attempt contributes `null` for every attempt-only field, not
 * an empty array.
 */
export function buildEvaluationDataPoints(
	sessions: readonly RawSessionRow[],
	attempts: readonly RawAttemptRow[]
): EvaluationDataPoint[] {
	const attemptBySession = new Map(attempts.map((a) => [a.session_id, a]));

	return sessions.map((session) => {
		const attempt = attemptBySession.get(session.id) ?? null;

		return {
			sessionId: session.id,
			caseId: session.case_id,
			fsmState: session.fsm_state,
			initialJudgment: session.initial_judgment?.judgment ?? null,
			revisedJudgment: session.revised_judgment?.judgment ?? null,
			initialConfidence: session.initial_judgment?.confidence ?? null,
			revisedConfidence: session.revised_judgment?.confidence ?? null,
			updateCriterionSupplied: session.update_criterion_text !== null,
			reflectionCompleted: session.reflection_text !== null,
			tutorActions: session.transcript.map((turn) => turn.action.action),
			initialSignalsPresent:
				attempt === null || attempt.initial_reasoning_signals === null
					? null
					: attempt.initial_reasoning_signals.filter((s) => s.present).map((s) => s.signal),
			revisedSignalsPresent:
				attempt === null
					? null
					: attempt.scoring_events.filter((e) => e.signal !== null).map((e) => e.signal as string)
		};
	});
}

/** Only attempts on `calibrationEligible` cases, reduced to (confidence, withinTargetRange) — same filter `docs/CALIBRATION.md` requires. */
export function buildCalibrationDataPoints(
	attempts: readonly RawAttemptRow[]
): CalibrationDataPoint[] {
	const points: CalibrationDataPoint[] = [];
	for (const attempt of attempts) {
		const practiceCase = getPracticeCase(attempt.case_id);
		if (!practiceCase || !practiceCase.answerSpec.calibrationEligible) continue;
		points.push({
			confidence: attempt.revised_judgment.confidence,
			withinTargetRange: judgmentWithinTargetRange(
				attempt.revised_judgment.judgment,
				practiceCase.answerSpec.targetRange
			)
		});
	}
	return points;
}

/** Frequency of each individual signal being `present: true`, across every point that was classified on that side — the raw counterpart to `computeSignalsAddedAfterChallenge`'s diff. */
export function computeSignalFrequency(
	points: readonly EvaluationDataPoint[],
	which: 'initial' | 'revised'
): SignalDeltaEntry[] {
	const counts = new Map<string, number>();
	for (const p of points) {
		const signals = which === 'initial' ? p.initialSignalsPresent : p.revisedSignalsPresent;
		if (!signals) continue;
		for (const signal of signals) {
			counts.set(signal, (counts.get(signal) ?? 0) + 1);
		}
	}
	return [...counts.entries()]
		.map(([signal, count]) => ({ signal, count }))
		.sort((a, b) => b.count - a.count);
}

export interface MeanConfidenceSummary {
	initial: { count: number; mean: number | null };
	revised: { count: number; mean: number | null };
}

function meanOf(values: readonly number[]): number | null {
	return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

/** Mean initial and mean revised confidence, each over only the points that reached that stage — distinct from `computeConfidenceShift`, which only counts points with BOTH present. */
export function computeMeanConfidence(
	points: readonly EvaluationDataPoint[]
): MeanConfidenceSummary {
	const initialValues = points
		.map((p) => p.initialConfidence)
		.filter((c): c is number => c !== null);
	const revisedValues = points
		.map((p) => p.revisedConfidence)
		.filter((c): c is number => c !== null);
	return {
		initial: { count: initialValues.length, mean: meanOf(initialValues) },
		revised: { count: revisedValues.length, mean: meanOf(revisedValues) }
	};
}

export interface DispositionItemSummary {
	item: string;
	count: number;
	mean: number | null;
}

/** Mean response (1-5) per distinct disposition item checked in — "disposition check-ins" per Section 4. */
export function computeDispositionSummary(
	checkins: readonly RawCheckinRow[]
): DispositionItemSummary[] {
	const byItem = new Map<string, number[]>();
	for (const c of checkins) {
		const list = byItem.get(c.disposition_item) ?? [];
		list.push(c.response);
		byItem.set(c.disposition_item, list);
	}
	return [...byItem.entries()]
		.map(([item, values]) => ({ item, count: values.length, mean: meanOf(values) }))
		.sort((a, b) => b.count - a.count);
}

export interface UpdateCriterionConsistencyDistribution {
	[status: string]: number;
}

/** Status distribution across every attempt that actually used the update-criterion mechanic (only `causal-inference-1` today). */
export function computeUpdateCriterionConsistencyDistribution(
	attempts: readonly RawAttemptRow[]
): UpdateCriterionConsistencyDistribution {
	const counts: UpdateCriterionConsistencyDistribution = {};
	for (const attempt of attempts) {
		const status = attempt.update_criterion?.consistency.status;
		if (!status) continue;
		counts[status] = (counts[status] ?? 0) + 1;
	}
	return counts;
}

// ---------------------------------------------------------------------------
// Survey aggregates
// ---------------------------------------------------------------------------

export interface RatingSummary {
	count: number;
	mean: number | null;
}

function ratingSummary(values: readonly number[]): RatingSummary {
	return {
		count: values.length,
		mean: values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : null
	};
}

export interface SurveyAggregates {
	respondentCount: number;
	casesUnderstandable: RatingSummary;
	tutorMadeThink: RatingSummary;
	newEvidenceMeaningful: RatingSummary;
	tutorRepetitive: RatingSummary;
	confidenceUnderstandable: RatingSummary;
	updateCriterionUnderstandable: Record<UpdateCriterionUnderstandable, number>;
	perceivedSteeringCount: number;
	perceivedSteeringExplanations: { studentId: string; explanation: string }[];
	wouldContinueRate: RateSummary;
}

export function computeSurveyAggregates(feedback: readonly RawFeedbackRow[]): SurveyAggregates {
	const updateCriterionUnderstandable: Record<UpdateCriterionUnderstandable, number> = {
		yes: 0,
		mostly: 0,
		no: 0,
		not_applicable: 0
	};
	for (const f of feedback) {
		updateCriterionUnderstandable[f.update_criterion_understandable] += 1;
	}

	return {
		respondentCount: feedback.length,
		casesUnderstandable: ratingSummary(feedback.map((f) => f.cases_understandable)),
		tutorMadeThink: ratingSummary(feedback.map((f) => f.tutor_made_think)),
		newEvidenceMeaningful: ratingSummary(feedback.map((f) => f.new_evidence_meaningful)),
		tutorRepetitive: ratingSummary(feedback.map((f) => f.tutor_repetitive)),
		confidenceUnderstandable: ratingSummary(feedback.map((f) => f.confidence_understandable)),
		updateCriterionUnderstandable,
		perceivedSteeringCount: feedback.filter((f) => f.perceived_steering).length,
		perceivedSteeringExplanations: feedback
			.filter((f) => f.perceived_steering && f.perceived_steering_explanation)
			.map((f) => ({ studentId: f.student_id, explanation: f.perceived_steering_explanation! })),
		wouldContinueRate: {
			count: feedback.filter((f) => f.would_continue).length,
			total: feedback.length,
			rate:
				feedback.length > 0
					? feedback.filter((f) => f.would_continue).length / feedback.length
					: null
		}
	};
}

// ---------------------------------------------------------------------------
// Pseudonymization
// ---------------------------------------------------------------------------

/**
 * Deterministic within one export run only — "Tester 001" is whichever
 * distinct student id sorts first, not a stable identity across runs
 * (the prompt explicitly says the mapping doesn't need to be persisted).
 * Sorting by raw id string (not by e.g. first-seen order) keeps this a
 * pure function of the input set, independent of row ordering.
 */
export function pseudonymizeTesters(studentIds: readonly string[]): Map<string, string> {
	const distinct = [...new Set(studentIds)].sort();
	const map = new Map<string, string>();
	distinct.forEach((id, index) => {
		map.set(id, `Tester ${String(index + 1).padStart(3, '0')}`);
	});
	return map;
}

// ---------------------------------------------------------------------------
// Triage flags (Section 8) — descriptive heuristics, not efficacy claims.
// ---------------------------------------------------------------------------

export interface TriageFlags {
	critical: string[];
	high: string[];
	medium: string[];
}

export function computeTriageFlags(input: {
	completionRate: RateSummary;
	wouldContinueRate: RateSummary;
	tutorMadeThink: RatingSummary;
	newEvidenceMeaningful: RatingSummary;
	tutorRepetitive: RatingSummary;
	confidenceUnderstandable: RatingSummary;
	updateCriterionUnderstandable: Record<UpdateCriterionUnderstandable, number>;
	perceivedSteeringCount: number;
	signalsAddedAfterChallenge: readonly SignalDeltaEntry[];
	pointsWithBothSignalSets: number;
}): TriageFlags {
	const flags: TriageFlags = { critical: [], high: [], medium: [] };

	if (input.perceivedSteeringCount > 0) {
		flags.critical.push(
			`${input.perceivedSteeringCount} tester(s) reported apparent answer steering — investigate before drawing any other conclusion from this cohort.`
		);
	}

	if (input.completionRate.rate !== null && input.completionRate.rate < 0.7) {
		flags.high.push(
			`Completion rate ${(input.completionRate.rate * 100).toFixed(0)}% is below 70% (${input.completionRate.count}/${input.completionRate.total}).`
		);
	}
	if (input.wouldContinueRate.rate !== null && input.wouldContinueRate.rate < 0.5) {
		flags.high.push(
			`Voluntary-continuation rate ${(input.wouldContinueRate.rate * 100).toFixed(0)}% is below 50%.`
		);
	}
	if (input.tutorMadeThink.mean !== null && input.tutorMadeThink.mean < 3) {
		flags.high.push(
			`"Tutor made me think more carefully" mean ${input.tutorMadeThink.mean.toFixed(2)} is below 3/5.`
		);
	}
	if (input.newEvidenceMeaningful.mean !== null && input.newEvidenceMeaningful.mean < 3) {
		flags.high.push(
			`"New evidence felt meaningful" mean ${input.newEvidenceMeaningful.mean.toFixed(2)} is below 3/5.`
		);
	}

	if (input.tutorRepetitive.mean !== null && input.tutorRepetitive.mean > 3.5) {
		flags.medium.push(
			`"Tutor felt repetitive" mean ${input.tutorRepetitive.mean.toFixed(2)} is above 3.5/5.`
		);
	}
	if (input.confidenceUnderstandable.mean !== null && input.confidenceUnderstandable.mean < 3.5) {
		flags.medium.push(
			`"Confidence percentages understandable" mean ${input.confidenceUnderstandable.mean.toFixed(2)} is below 3.5/5.`
		);
	}
	const ucTotal = Object.values(input.updateCriterionUnderstandable).reduce((a, b) => a + b, 0);
	const ucApplicable = ucTotal - input.updateCriterionUnderstandable.not_applicable;
	const ucYesOrMostly =
		input.updateCriterionUnderstandable.yes + input.updateCriterionUnderstandable.mostly;
	if (ucApplicable > 0 && ucYesOrMostly / ucApplicable < 0.7) {
		flags.medium.push(
			`Update-criterion understanding ${((ucYesOrMostly / ucApplicable) * 100).toFixed(0)}% ("yes"+"mostly") is below 70% of applicable responses.`
		);
	}
	if (
		input.pointsWithBothSignalSets > 0 &&
		input.signalsAddedAfterChallenge.reduce((sum, s) => sum + s.count, 0) /
			input.pointsWithBothSignalSets <
			0.3
	) {
		flags.medium.push(
			'Fewer than 30% of completed cases show at least one newly detected reasoning signal after challenge.'
		);
	}

	return flags;
}

// ---------------------------------------------------------------------------
// Full report assembly
// ---------------------------------------------------------------------------

export interface PerCaseMetrics {
	caseId: string;
	completionRate: RateSummary;
	judgmentDistributionInitial: Partial<Record<EvidenceSupportJudgment, number>>;
	judgmentDistributionRevised: Partial<Record<EvidenceSupportJudgment, number>>;
	confidenceShift: ConfidenceShiftSummary;
}

export interface UserTestReport {
	cohort: string;
	generatedAt: string;
	commitSha: string;
	dirty: boolean;
	testerCount: number;
	pseudonymMap: Map<string, string>;
	completionRate: RateSummary;
	stageAbandonment: StageAbandonmentEntry[];
	judgmentDistributionInitial: Partial<Record<EvidenceSupportJudgment, number>>;
	judgmentDistributionRevised: Partial<Record<EvidenceSupportJudgment, number>>;
	meanConfidence: MeanConfidenceSummary;
	confidenceShift: ConfidenceShiftSummary;
	updateCriterionRate: RateSummary;
	updateCriterionConsistency: UpdateCriterionConsistencyDistribution;
	reflectionCompletionRate: RateSummary;
	tutorActionDistribution: Partial<Record<TutorActionId, number>>;
	initialSignalFrequency: SignalDeltaEntry[];
	revisedSignalFrequency: SignalDeltaEntry[];
	signalsAddedAfterChallenge: SignalDeltaEntry[];
	dispositionSummary: DispositionItemSummary[];
	calibration: CalibrationReport;
	perCase: PerCaseMetrics[];
	survey: SurveyAggregates;
	triage: TriageFlags;
	dispositionCheckinCount: number;
	points: EvaluationDataPoint[];
	sessions: RawSessionRow[];
	attempts: RawAttemptRow[];
	checkins: RawCheckinRow[];
	feedback: RawFeedbackRow[];
}

export function buildUserTestReport(input: {
	cohort: string;
	generatedAt: string;
	commitSha: string;
	dirty: boolean;
	sessions: readonly RawSessionRow[];
	attempts: readonly RawAttemptRow[];
	checkins: readonly RawCheckinRow[];
	feedback: readonly RawFeedbackRow[];
	/**
	 * Precomputed pseudonym map, e.g. from the full unfiltered cohort —
	 * pass this when building a report scoped to one `--tester`/`--case`
	 * filter, so that tester's label stays the same as in the full
	 * cohort report rather than being renumbered from a smaller set.
	 */
	pseudonymOverride?: Map<string, string>;
}): UserTestReport {
	const points = buildEvaluationDataPoints(input.sessions, input.attempts);
	const calibrationPoints = buildCalibrationDataPoints(input.attempts);
	const signalsAddedAfterChallenge = computeSignalsAddedAfterChallenge(points);
	const pointsWithBothSignalSets = points.filter(
		(p) => p.initialSignalsPresent !== null && p.revisedSignalsPresent !== null
	).length;
	const survey = computeSurveyAggregates(input.feedback);
	const completionRate = computeCompletionRate(points);

	const perCase: PerCaseMetrics[] = practiceCases.map((c) => {
		const casePoints = points.filter((p) => p.caseId === c.id);
		return {
			caseId: c.id,
			completionRate: computeCompletionRate(casePoints),
			judgmentDistributionInitial: computeJudgmentDistribution(casePoints, 'initial'),
			judgmentDistributionRevised: computeJudgmentDistribution(casePoints, 'revised'),
			confidenceShift: computeConfidenceShift(casePoints)
		};
	});

	const triage = computeTriageFlags({
		completionRate,
		wouldContinueRate: survey.wouldContinueRate,
		tutorMadeThink: survey.tutorMadeThink,
		newEvidenceMeaningful: survey.newEvidenceMeaningful,
		tutorRepetitive: survey.tutorRepetitive,
		confidenceUnderstandable: survey.confidenceUnderstandable,
		updateCriterionUnderstandable: survey.updateCriterionUnderstandable,
		perceivedSteeringCount: survey.perceivedSteeringCount,
		signalsAddedAfterChallenge,
		pointsWithBothSignalSets
	});

	const studentIds = [
		...input.sessions.map((s) => s.student_id),
		...input.feedback.map((f) => f.student_id)
	];

	return {
		cohort: input.cohort,
		generatedAt: input.generatedAt,
		commitSha: input.commitSha,
		dirty: input.dirty,
		testerCount: new Set(studentIds).size,
		pseudonymMap: input.pseudonymOverride ?? pseudonymizeTesters(studentIds),
		completionRate,
		stageAbandonment: computeStageAbandonment(points),
		judgmentDistributionInitial: computeJudgmentDistribution(points, 'initial'),
		judgmentDistributionRevised: computeJudgmentDistribution(points, 'revised'),
		meanConfidence: computeMeanConfidence(points),
		confidenceShift: computeConfidenceShift(points),
		updateCriterionRate: computeUpdateCriterionRate(
			points.filter((p) => getPracticeCase(p.caseId)?.usesUpdateCriterion)
		),
		updateCriterionConsistency: computeUpdateCriterionConsistencyDistribution(input.attempts),
		reflectionCompletionRate: computeReflectionCompletionRate(points),
		tutorActionDistribution: computeTutorActionDistribution(points),
		initialSignalFrequency: computeSignalFrequency(points, 'initial'),
		revisedSignalFrequency: computeSignalFrequency(points, 'revised'),
		signalsAddedAfterChallenge,
		dispositionSummary: computeDispositionSummary(input.checkins),
		calibration: computeCalibrationReport(calibrationPoints),
		perCase,
		survey,
		triage,
		dispositionCheckinCount: input.checkins.length,
		points,
		sessions: [...input.sessions],
		attempts: [...input.attempts],
		checkins: [...input.checkins],
		feedback: [...input.feedback]
	};
}
