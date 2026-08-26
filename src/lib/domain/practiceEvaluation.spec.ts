import { describe, expect, it } from 'vitest';
import {
	computeCompletionRate,
	computeConfidenceShift,
	computeJudgmentDistribution,
	computeReflectionCompletionRate,
	computeSignalsAddedAfterChallenge,
	computeStageAbandonment,
	computeTutorActionDistribution,
	computeUpdateCriterionRate,
	type EvaluationDataPoint
} from './practiceEvaluation';

function point(overrides: Partial<EvaluationDataPoint> = {}): EvaluationDataPoint {
	return {
		sessionId: 'session-1',
		caseId: 'causal-inference-1',
		fsmState: 'COMPLETE',
		initialJudgment: 'uncertain',
		revisedJudgment: 'somewhat_unsupported',
		initialConfidence: 50,
		revisedConfidence: 50,
		updateCriterionSupplied: false,
		reflectionCompleted: true,
		tutorActions: ['ASK_FOR_REASONING'],
		initialSignalsPresent: [],
		revisedSignalsPresent: [],
		...overrides
	};
}

describe('computeCompletionRate', () => {
	it('returns null rate when there is no data at all', () => {
		expect(computeCompletionRate([])).toEqual({ count: 0, total: 0, rate: null });
	});

	it('computes a real rate from raw counts, unsuppressed regardless of n', () => {
		const points = [
			point({ fsmState: 'COMPLETE' }),
			point({ fsmState: 'AWAIT_CHALLENGE_RESPONSE' })
		];
		expect(computeCompletionRate(points)).toEqual({ count: 1, total: 2, rate: 0.5 });
	});
});

describe('computeStageAbandonment', () => {
	it('excludes completed sessions and groups the rest by their current stage, most common first', () => {
		const points = [
			point({ fsmState: 'COMPLETE' }),
			point({ fsmState: 'AWAIT_CHALLENGE_RESPONSE' }),
			point({ fsmState: 'AWAIT_CHALLENGE_RESPONSE' }),
			point({ fsmState: 'ASK_REFLECTION' })
		];
		expect(computeStageAbandonment(points)).toEqual([
			{ stage: 'AWAIT_CHALLENGE_RESPONSE', count: 2 },
			{ stage: 'ASK_REFLECTION', count: 1 }
		]);
	});

	it('returns an empty array when every session completed', () => {
		expect(computeStageAbandonment([point(), point()])).toEqual([]);
	});
});

describe('computeJudgmentDistribution', () => {
	it('tallies initial judgments, skipping points with none recorded', () => {
		const points = [
			point({ initialJudgment: 'uncertain' }),
			point({ initialJudgment: 'uncertain' }),
			point({ initialJudgment: 'somewhat_supported' }),
			point({ initialJudgment: null })
		];
		expect(computeJudgmentDistribution(points, 'initial')).toEqual({
			uncertain: 2,
			somewhat_supported: 1
		});
	});

	it('tallies revised judgments independently of initial', () => {
		const points = [
			point({ revisedJudgment: 'somewhat_unsupported' }),
			point({ revisedJudgment: 'somewhat_unsupported' })
		];
		expect(computeJudgmentDistribution(points, 'revised')).toEqual({
			somewhat_unsupported: 2
		});
	});
});

describe('computeUpdateCriterionRate', () => {
	it('computes the fraction of points that supplied an update criterion', () => {
		const points = [
			point({ updateCriterionSupplied: true }),
			point({ updateCriterionSupplied: false })
		];
		expect(computeUpdateCriterionRate(points)).toEqual({ count: 1, total: 2, rate: 0.5 });
	});
});

describe('computeReflectionCompletionRate', () => {
	it('computes the fraction of points with a completed reflection', () => {
		const points = [point({ reflectionCompleted: true }), point({ reflectionCompleted: true })];
		expect(computeReflectionCompletionRate(points)).toEqual({ count: 2, total: 2, rate: 1 });
	});
});

describe('computeTutorActionDistribution', () => {
	it('tallies every action across every session, not just one per session', () => {
		const points = [
			point({ tutorActions: ['ASK_FOR_REASONING', 'ASK_ABOUT_CAUSALITY'] }),
			point({ tutorActions: ['ASK_FOR_REASONING'] })
		];
		expect(computeTutorActionDistribution(points)).toEqual({
			ASK_FOR_REASONING: 2,
			ASK_ABOUT_CAUSALITY: 1
		});
	});

	it('returns an empty distribution for sessions with no challenge rounds', () => {
		expect(computeTutorActionDistribution([point({ tutorActions: [] })])).toEqual({});
	});
});

describe('computeSignalsAddedAfterChallenge', () => {
	it('counts a signal only when present in revised but absent from initial', () => {
		const points = [
			point({
				initialSignalsPresent: ['acknowledges_uncertainty'],
				revisedSignalsPresent: ['acknowledges_uncertainty', 'identifies_confounder']
			})
		];
		expect(computeSignalsAddedAfterChallenge(points)).toEqual([
			{ signal: 'identifies_confounder', count: 1 }
		]);
	});

	it('never counts a signal that regressed (present initially, absent from revised)', () => {
		const points = [
			point({
				initialSignalsPresent: ['acknowledges_uncertainty'],
				revisedSignalsPresent: []
			})
		];
		expect(computeSignalsAddedAfterChallenge(points)).toEqual([]);
	});

	it('excludes sessions that never reached SCORE_AND_RECORD (either side null) rather than treating them as adding nothing', () => {
		const points = [
			point({ initialSignalsPresent: null, revisedSignalsPresent: null }),
			point({
				initialSignalsPresent: [],
				revisedSignalsPresent: ['identifies_confounder']
			})
		];
		expect(computeSignalsAddedAfterChallenge(points)).toEqual([
			{ signal: 'identifies_confounder', count: 1 }
		]);
	});

	it('sorts by count descending across multiple sessions and signals', () => {
		const points = [
			point({ initialSignalsPresent: [], revisedSignalsPresent: ['identifies_confounder'] }),
			point({ initialSignalsPresent: [], revisedSignalsPresent: ['identifies_confounder'] }),
			point({ initialSignalsPresent: [], revisedSignalsPresent: ['acknowledges_uncertainty'] })
		];
		expect(computeSignalsAddedAfterChallenge(points)).toEqual([
			{ signal: 'identifies_confounder', count: 2 },
			{ signal: 'acknowledges_uncertainty', count: 1 }
		]);
	});
});

describe('computeConfidenceShift', () => {
	it('returns null meanShift and zero count when there is no data at all', () => {
		expect(computeConfidenceShift([])).toEqual({
			count: 0,
			meanShift: null,
			movedMoreThanOneBand: 0
		});
	});

	it('excludes points missing either confidence value rather than treating them as zero shift', () => {
		const points = [
			point({ initialConfidence: null, revisedConfidence: 60 }),
			point({ initialConfidence: 40, revisedConfidence: null })
		];
		expect(computeConfidenceShift(points)).toEqual({
			count: 0,
			meanShift: null,
			movedMoreThanOneBand: 0
		});
	});

	it('computes the mean shift, positive when confidence rose on average', () => {
		const points = [
			point({ initialConfidence: 35, revisedConfidence: 65 }),
			point({ initialConfidence: 50, revisedConfidence: 50 })
		];
		expect(computeConfidenceShift(points)).toEqual({
			count: 2,
			meanShift: 15,
			movedMoreThanOneBand: 1
		});
	});

	it('computes a negative mean shift when confidence fell on average', () => {
		const points = [point({ initialConfidence: 80, revisedConfidence: 30 })];
		const result = computeConfidenceShift(points);
		expect(result.meanShift).toBe(-50);
		expect(result.movedMoreThanOneBand).toBe(1);
	});

	it('does not count a shift of exactly one band width (20) as "moved more than one band"', () => {
		const points = [point({ initialConfidence: 40, revisedConfidence: 60 })];
		expect(computeConfidenceShift(points).movedMoreThanOneBand).toBe(0);
	});

	it('a mean near zero can still hide real movement in both directions, shown via movedMoreThanOneBand', () => {
		const points = [
			point({ initialConfidence: 20, revisedConfidence: 70 }),
			point({ initialConfidence: 70, revisedConfidence: 20 })
		];
		const result = computeConfidenceShift(points);
		expect(result.meanShift).toBe(0);
		expect(result.movedMoreThanOneBand).toBe(2);
	});
});
