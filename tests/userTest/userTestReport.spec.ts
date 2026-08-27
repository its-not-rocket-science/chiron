import { describe, expect, it } from 'vitest';
import {
	buildCalibrationDataPoints,
	buildEvaluationDataPoints,
	buildUserTestReport,
	computeDispositionSummary,
	computeMeanConfidence,
	computeSignalFrequency,
	computeSurveyAggregates,
	computeTriageFlags,
	computeUpdateCriterionConsistencyDistribution,
	pseudonymizeTesters,
	type RawAttemptRow,
	type RawCheckinRow,
	type RawFeedbackRow,
	type RawSessionRow
} from './userTestReport';

function session(overrides: Partial<RawSessionRow> = {}): RawSessionRow {
	return {
		id: 's1',
		student_id: 'student-a',
		case_id: 'causal-inference-1',
		fsm_state: 'COMPLETE',
		revealed_evidence_ids: [],
		transcript: [],
		initial_judgment: { judgment: 'uncertain', confidence: 50, reasoning: 'x' },
		update_criterion_text: null,
		revised_judgment: { judgment: 'uncertain', confidence: 60, reasoning: 'y' },
		reflection_text: 'z',
		test_cohort: 'alpha-2026-08',
		created_at: '2026-08-27T00:00:00Z',
		...overrides
	};
}

function attempt(overrides: Partial<RawAttemptRow> = {}): RawAttemptRow {
	return {
		id: 'a1',
		student_id: 'student-a',
		case_id: 'causal-inference-1',
		session_id: 's1',
		initial_judgment: { judgment: 'uncertain', confidence: 50, reasoning: 'x' },
		update_criterion: null,
		revised_judgment: { judgment: 'uncertain', confidence: 60, reasoning: 'y' },
		scoring_events: [],
		initial_reasoning_signals: [],
		outcome: 'correct',
		created_at: '2026-08-27T00:00:00Z',
		...overrides
	};
}

describe('buildEvaluationDataPoints', () => {
	it('maps a session with a matching attempt, deriving present-signal id lists', () => {
		const s = session();
		const a = attempt({
			initial_reasoning_signals: [
				{ signal: 'names_confounder', present: true, confidence: 'high', evidenceQuote: 'x' },
				{
					signal: 'identifies_missing_evidence',
					present: false,
					confidence: 'low',
					evidenceQuote: ''
				}
			],
			scoring_events: [
				{
					id: 'e1',
					attemptId: 'a1',
					ruleId: null,
					signal: 'names_confounder',
					affectedSkills: ['analysis'],
					explanation: 'x',
					evidenceQuote: 'x',
					stage: 'SCORE_AND_RECORD',
					createdAt: '2026-08-27T00:00:00Z'
				},
				{
					id: 'e2',
					attemptId: 'a1',
					ruleId: 'r1',
					signal: null,
					affectedSkills: ['analysis'],
					explanation: 'matched rule',
					evidenceQuote: null,
					stage: 'SCORE_AND_RECORD',
					createdAt: '2026-08-27T00:00:00Z'
				}
			]
		});

		const [point] = buildEvaluationDataPoints([s], [a]);

		expect(point.initialSignalsPresent).toEqual(['names_confounder']);
		expect(point.revisedSignalsPresent).toEqual(['names_confounder']);
		expect(point.updateCriterionSupplied).toBe(false);
		expect(point.reflectionCompleted).toBe(true);
	});

	it('leaves signal fields null (not empty arrays) for a session with no attempt row', () => {
		const s = session({ id: 's2', fsm_state: 'AWAIT_CHALLENGE_RESPONSE', revised_judgment: null });

		const [point] = buildEvaluationDataPoints([s], []);

		expect(point.initialSignalsPresent).toBeNull();
		expect(point.revisedSignalsPresent).toBeNull();
		expect(point.revisedJudgment).toBeNull();
		expect(point.revisedConfidence).toBeNull();
	});

	it('leaves initialSignalsPresent null when an attempt exists but was never classified', () => {
		const s = session();
		const a = attempt({ initial_reasoning_signals: null });

		const [point] = buildEvaluationDataPoints([s], [a]);

		expect(point.initialSignalsPresent).toBeNull();
		// revisedSignalsPresent still resolves from scoring_events, independent of initial_reasoning_signals.
		expect(point.revisedSignalsPresent).toEqual([]);
	});
});

describe('buildCalibrationDataPoints', () => {
	it('includes only calibrationEligible cases', () => {
		const eligible = attempt({ case_id: 'causal-inference-1' });
		const ineligible = attempt({ id: 'a2', case_id: 'relative-risk-1' });

		const points = buildCalibrationDataPoints([eligible, ineligible]);

		expect(points).toHaveLength(1);
	});

	it('computes withinTargetRange against the case answerSpec', () => {
		// causal-inference-1's targetRange is somewhat_unsupported..uncertain.
		const inRange = attempt({
			revised_judgment: { judgment: 'uncertain', confidence: 70, reasoning: 'y' }
		});
		const outOfRange = attempt({
			id: 'a2',
			revised_judgment: { judgment: 'strongly_supported', confidence: 70, reasoning: 'y' }
		});

		const points = buildCalibrationDataPoints([inRange, outOfRange]);

		expect(points.find((p) => p.confidence === 70 && p.withinTargetRange)).toBeTruthy();
		expect(points.some((p) => !p.withinTargetRange)).toBe(true);
	});
});

describe('computeUpdateCriterionConsistencyDistribution', () => {
	it('counts statuses across attempts, skipping attempts that never used the mechanic', () => {
		const withMechanic = attempt({
			update_criterion: {
				text: 'x',
				classification: null,
				consistency: { status: 'criterion_met_and_followed', explanation: 'x' }
			}
		});
		const withoutMechanic = attempt({ id: 'a2', update_criterion: null });

		const distribution = computeUpdateCriterionConsistencyDistribution([
			withMechanic,
			withoutMechanic
		]);

		expect(distribution).toEqual({ criterion_met_and_followed: 1 });
	});
});

describe('computeSignalFrequency', () => {
	it('counts each signal independently for initial vs revised', () => {
		const points = buildEvaluationDataPoints(
			[session()],
			[
				attempt({
					initial_reasoning_signals: [
						{ signal: 'names_confounder', present: true, confidence: 'high', evidenceQuote: 'x' }
					],
					scoring_events: [
						{
							id: 'e1',
							attemptId: 'a1',
							ruleId: null,
							signal: 'acknowledges_uncertainty',
							affectedSkills: ['analysis'],
							explanation: 'x',
							evidenceQuote: 'x',
							stage: 'SCORE_AND_RECORD',
							createdAt: '2026-08-27T00:00:00Z'
						}
					]
				})
			]
		);

		expect(computeSignalFrequency(points, 'initial')).toEqual([
			{ signal: 'names_confounder', count: 1 }
		]);
		expect(computeSignalFrequency(points, 'revised')).toEqual([
			{ signal: 'acknowledges_uncertainty', count: 1 }
		]);
	});
});

describe('computeMeanConfidence', () => {
	it('computes independent means for initial and revised, ignoring missing values', () => {
		const points = buildEvaluationDataPoints(
			[
				session({
					id: 's1',
					initial_judgment: { judgment: 'uncertain', confidence: 40, reasoning: 'x' }
				}),
				session({
					id: 's2',
					initial_judgment: { judgment: 'uncertain', confidence: 60, reasoning: 'x' },
					revised_judgment: null
				})
			],
			[]
		);

		const summary = computeMeanConfidence(points);
		expect(summary.initial.mean).toBe(50);
		expect(summary.initial.count).toBe(2);
		expect(summary.revised.count).toBe(1);
	});

	it('returns null mean with zero count when no data is present', () => {
		expect(computeMeanConfidence([]).initial).toEqual({ count: 0, mean: null });
	});
});

describe('computeDispositionSummary', () => {
	it('groups by disposition item and computes the mean response', () => {
		const checkins: RawCheckinRow[] = [
			{
				id: 'c1',
				student_id: 'student-a',
				attempt_id: 'a1',
				disposition_item: 'Sticking with a hard problem',
				response: 4,
				created_at: '2026-08-27T00:00:00Z'
			},
			{
				id: 'c2',
				student_id: 'student-b',
				attempt_id: 'a2',
				disposition_item: 'Sticking with a hard problem',
				response: 2,
				created_at: '2026-08-27T00:00:00Z'
			}
		];

		const summary = computeDispositionSummary(checkins);

		expect(summary).toEqual([{ item: 'Sticking with a hard problem', count: 2, mean: 3 }]);
	});
});

function feedback(overrides: Partial<RawFeedbackRow> = {}): RawFeedbackRow {
	return {
		id: 'f1',
		student_id: 'student-a',
		test_cohort: 'alpha-2026-08',
		cases_understandable: 4,
		tutor_made_think: 4,
		new_evidence_meaningful: 4,
		tutor_repetitive: 2,
		confidence_understandable: 4,
		update_criterion_understandable: 'yes',
		perceived_steering: false,
		perceived_steering_explanation: null,
		would_continue: true,
		what_worked_best: null,
		what_needs_changing: null,
		created_at: '2026-08-27T00:00:00Z',
		...overrides
	};
}

describe('computeSurveyAggregates', () => {
	it('computes rating means and counts across respondents', () => {
		const aggregates = computeSurveyAggregates([
			feedback({ tutor_made_think: 4 }),
			feedback({ id: 'f2', student_id: 'student-b', tutor_made_think: 2 })
		]);

		expect(aggregates.respondentCount).toBe(2);
		expect(aggregates.tutorMadeThink.mean).toBe(3);
	});

	it('only includes explanations for testers who both reported steering and gave one', () => {
		const aggregates = computeSurveyAggregates([
			feedback({
				perceived_steering: true,
				perceived_steering_explanation: 'It hinted at the answer.'
			}),
			feedback({ id: 'f2', student_id: 'student-b', perceived_steering: true }),
			feedback({ id: 'f3', student_id: 'student-c', perceived_steering: false })
		]);

		expect(aggregates.perceivedSteeringCount).toBe(2);
		expect(aggregates.perceivedSteeringExplanations).toEqual([
			{ studentId: 'student-a', explanation: 'It hinted at the answer.' }
		]);
	});

	it('handles zero feedback rows without throwing', () => {
		const aggregates = computeSurveyAggregates([]);
		expect(aggregates.respondentCount).toBe(0);
		expect(aggregates.tutorMadeThink.mean).toBeNull();
		expect(aggregates.wouldContinueRate.rate).toBeNull();
	});
});

describe('pseudonymizeTesters', () => {
	it('assigns deterministic, sorted, zero-padded labels to distinct ids', () => {
		const map = pseudonymizeTesters(['student-b', 'student-a', 'student-b']);
		expect(map.get('student-a')).toBe('Tester 001');
		expect(map.get('student-b')).toBe('Tester 002');
		expect(map.size).toBe(2);
	});
});

describe('computeTriageFlags', () => {
	function baseInput() {
		return {
			completionRate: { count: 9, total: 10, rate: 0.9 },
			wouldContinueRate: { count: 9, total: 10, rate: 0.9 },
			tutorMadeThink: { mean: 4, count: 10 },
			newEvidenceMeaningful: { mean: 4, count: 10 },
			tutorRepetitive: { mean: 2, count: 10 },
			confidenceUnderstandable: { mean: 4, count: 10 },
			updateCriterionUnderstandable: { yes: 8, mostly: 0, no: 2, not_applicable: 0 } as Record<
				'yes' | 'mostly' | 'no' | 'not_applicable',
				number
			>,
			perceivedSteeringCount: 0,
			signalsAddedAfterChallenge: [{ signal: 'x', count: 5 }],
			pointsWithBothSignalSets: 10
		};
	}

	it('raises no flags for a healthy cohort', () => {
		expect(computeTriageFlags(baseInput())).toEqual({ critical: [], high: [], medium: [] });
	});

	it('raises CRITICAL whenever any tester reports perceived steering, regardless of other metrics', () => {
		const flags = computeTriageFlags({ ...baseInput(), perceivedSteeringCount: 1 });
		expect(flags.critical).toHaveLength(1);
	});

	it('raises HIGH for completion below 70%', () => {
		const flags = computeTriageFlags({
			...baseInput(),
			completionRate: { count: 5, total: 10, rate: 0.5 }
		});
		expect(flags.high.some((f) => f.includes('Completion rate'))).toBe(true);
	});

	it('raises MEDIUM when update-criterion understanding is below 70% of applicable responses, ignoring not_applicable', () => {
		const flags = computeTriageFlags({
			...baseInput(),
			updateCriterionUnderstandable: { yes: 1, mostly: 0, no: 4, not_applicable: 20 }
		});
		expect(flags.medium.some((f) => f.includes('Update-criterion understanding'))).toBe(true);
	});

	it('raises MEDIUM when fewer than 30% of eligible cases show a newly added signal', () => {
		const flags = computeTriageFlags({
			...baseInput(),
			signalsAddedAfterChallenge: [{ signal: 'x', count: 1 }],
			pointsWithBothSignalSets: 10
		});
		expect(flags.medium.some((f) => f.includes('newly detected reasoning signal'))).toBe(true);
	});
});

describe('buildUserTestReport', () => {
	it('counts distinct testers across sessions and feedback, and does not throw on a minimal input', () => {
		const report = buildUserTestReport({
			cohort: 'alpha-2026-08',
			generatedAt: '2026-08-27T00:00:00Z',
			commitSha: 'abc123',
			dirty: false,
			sessions: [session()],
			attempts: [attempt()],
			checkins: [],
			feedback: [feedback()]
		});

		expect(report.testerCount).toBe(1);
		expect(report.pseudonymMap.get('student-a')).toBe('Tester 001');
	});

	it('handles a tester who only attempted one of the three canonical cases, and zero feedback', () => {
		const report = buildUserTestReport({
			cohort: 'alpha-2026-08',
			generatedAt: '2026-08-27T00:00:00Z',
			commitSha: 'abc123',
			dirty: false,
			sessions: [session({ fsm_state: 'AWAIT_CHALLENGE_RESPONSE', revised_judgment: null })],
			attempts: [],
			checkins: [],
			feedback: []
		});

		expect(report.completionRate.rate).toBe(0);
		expect(report.survey.respondentCount).toBe(0);
	});

	it('honors a pseudonymOverride so a filtered report keeps the full-cohort label', () => {
		const override = new Map([['student-a', 'Tester 007']]);
		const report = buildUserTestReport({
			cohort: 'alpha-2026-08',
			generatedAt: '2026-08-27T00:00:00Z',
			commitSha: 'abc123',
			dirty: false,
			sessions: [session()],
			attempts: [attempt()],
			checkins: [],
			feedback: [],
			pseudonymOverride: override
		});

		expect(report.pseudonymMap.get('student-a')).toBe('Tester 007');
	});
});
