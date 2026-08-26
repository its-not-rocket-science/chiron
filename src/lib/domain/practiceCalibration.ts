/**
 * Confidence-calibration computation (`docs/CALIBRATION.md`,
 * `prompts.txt` Prompt 27). Pure functions over already-stored
 * `PracticeAttempt` data — no new table, no new persisted field. Every
 * design choice here is explained in `docs/CALIBRATION.md`; this
 * comment only summarizes the two corrections that matter most for
 * reading the code correctly (see ADR-023 for the full rationale):
 *
 * 1. Calibration is checked against "did the revised judgment land
 *    within the case's authored `targetRange`" — NOT the rubric-credit
 *    `outcome` (`'correct' | 'incorrect'`) `computeOutcome` produces.
 *    Those are different questions: `outcome` also depends on whether
 *    the student *articulated* the required reasoning signals, which
 *    the confidence question ("how confident are you that this is the
 *    best-supported judgement") never asked about. Using `outcome`
 *    would penalize a well-calibrated student for an articulation gap,
 *    not a calibration one.
 * 2. Only attempts on `calibrationEligible` cases are ever included —
 *    a case with a deliberately wide `targetRange` (Case 2 — see
 *    `practiceCases.ts`) makes "landed in range" too easy to hit for
 *    "in range" to mean anything about calibration.
 *
 * No LLM involvement anywhere in this module — everything here is
 * arithmetic over structured data the classifier/tutor never touch.
 */
import { evidenceSupportJudgmentOrder, type EvidenceSupportJudgment } from './practiceSchemas';

/** The five-level judgment falls within `targetRange` (inclusive) — the calibration-relevant "was this the best-supported judgement" event. */
export function judgmentWithinTargetRange(
	judgment: EvidenceSupportJudgment,
	targetRange: { min: EvidenceSupportJudgment; max: EvidenceSupportJudgment }
): boolean {
	const rank = evidenceSupportJudgmentOrder.indexOf(judgment);
	const minRank = evidenceSupportJudgmentOrder.indexOf(targetRange.min);
	const maxRank = evidenceSupportJudgmentOrder.indexOf(targetRange.max);
	return rank >= minRank && rank <= maxRank;
}

/**
 * One (confidence, was-this-the-best-supported-judgement) pair, already
 * reduced from a `PracticeAttempt` + its case's `targetRange` via
 * `judgmentWithinTargetRange` above — the caller is responsible for
 * having already filtered to `calibrationEligible` cases only, since
 * this module has no case-lookup capability of its own (kept a pure
 * function of exactly the data it needs, nothing more).
 */
export interface CalibrationDataPoint {
	/** `revisedJudgment.confidence`, 0-100. */
	confidence: number;
	withinTargetRange: boolean;
}

/**
 * Five 20-point bands, not the ten deciles `docs/PHASE2.md` Section 4
 * originally sketched (ADR-023) — Phase 2A's realistic attempt volume
 * (a handful of cases per student) would leave nearly every decile
 * bucket sitting below any reasonable sample-size threshold. Coarser
 * bands make "insufficient data" the exception rather than the default
 * for every real student in the near term.
 */
export const CONFIDENCE_BANDS: readonly { min: number; max: number; label: string }[] = [
	{ min: 0, max: 20, label: '0-20%' },
	{ min: 20, max: 40, label: '20-40%' },
	{ min: 40, max: 60, label: '40-60%' },
	{ min: 60, max: 80, label: '60-80%' },
	{ min: 80, max: 100, label: '80-100%' }
];

/**
 * Below this many data points, a band's observed accuracy (or the
 * overall Brier score) is reported as `null` ("insufficient data")
 * rather than a real number — `prompts.txt` Prompt 27's explicit "do
 * not display fake precision for small sample sizes" requirement. 5 is
 * a deliberately low bar (Phase 2A's realistic volume is small), not a
 * statistically rigorous threshold — see `docs/CALIBRATION.md` for the
 * reasoning.
 */
export const MIN_SAMPLE_SIZE = 5;

export interface ConfidenceBandResult {
	label: string;
	min: number;
	max: number;
	attemptCount: number;
	/** Fraction (0-1) of this band's attempts that landed within their case's targetRange — `null` when `attemptCount < MIN_SAMPLE_SIZE`. */
	observedAccuracy: number | null;
}

export interface CalibrationReport {
	eligibleAttemptCount: number;
	/** Mean squared error between stated confidence (as a 0-1 probability) and the within-range outcome (0 or 1) — `null` when `eligibleAttemptCount < MIN_SAMPLE_SIZE`. Lower is better; 0 is perfect, 1 is maximally wrong. */
	brierScore: number | null;
	bands: ConfidenceBandResult[];
}

function bandFor(confidence: number): (typeof CONFIDENCE_BANDS)[number] {
	// The top band is the only one whose upper bound is inclusive (a
	// confidence of exactly 100 must land somewhere).
	return (
		CONFIDENCE_BANDS.find((b) => confidence >= b.min && (confidence < b.max || b.max === 100)) ??
		CONFIDENCE_BANDS[CONFIDENCE_BANDS.length - 1]
	);
}

/**
 * Computes the full calibration report from already-eligibility-filtered
 * data points. Every reported number is either genuinely meaningful or
 * explicitly `null` — never a percentage computed from a handful of
 * attempts presented as if it were reliable.
 */
export function computeCalibrationReport(
	points: readonly CalibrationDataPoint[]
): CalibrationReport {
	const bands: ConfidenceBandResult[] = CONFIDENCE_BANDS.map((band) => {
		const inBand = points.filter((p) => bandFor(p.confidence) === band);
		const attemptCount = inBand.length;
		const observedAccuracy =
			attemptCount >= MIN_SAMPLE_SIZE
				? inBand.filter((p) => p.withinTargetRange).length / attemptCount
				: null;
		return { label: band.label, min: band.min, max: band.max, attemptCount, observedAccuracy };
	});

	const brierScore =
		points.length >= MIN_SAMPLE_SIZE
			? points.reduce((sum, p) => {
					const predicted = p.confidence / 100;
					const actual = p.withinTargetRange ? 1 : 0;
					return sum + (predicted - actual) ** 2;
				}, 0) / points.length
			: null;

	return { eligibleAttemptCount: points.length, brierScore, bands };
}
