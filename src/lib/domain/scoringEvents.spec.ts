import { describe, expect, it } from 'vitest';
import { computePushFurtherHints, computeScoringEvents } from './scoringEvents';
import type { ReasoningRubric, SignalClassification } from './practiceSchemas';

const ATTEMPT_ID = 'attempt-1';
const STAGE = 'SCORE_AND_RECORD' as const;

function signal(overrides: Partial<SignalClassification> = {}): SignalClassification {
	return {
		signal: 'identifies_confounder',
		present: true,
		confidence: 'high',
		evidenceQuote: 'x',
		...overrides
	};
}

/** Strips the two genuinely non-deterministic fields (`id`, `createdAt`) before comparing events for content-equality. */
function stripSurrogateFields(events: ReturnType<typeof computeScoringEvents>) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	return events.map(({ id, createdAt, ...rest }) => rest);
}

describe('computeScoringEvents', () => {
	it('produces content-identical events for identical structured inputs (id/createdAt aside)', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'A confounder undercuts confident causal attribution.'
				}
			],
			partialCreditSignals: ['acknowledges_uncertainty']
		};
		const detectedSignals = [
			signal({
				signal: 'identifies_confounder',
				present: true,
				evidenceQuote: 'the bypass opened'
			}),
			signal({ signal: 'acknowledges_uncertainty', present: true, evidenceQuote: 'I am not sure' })
		];

		const first = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: 'rule-a',
			detectedSignals
		});
		const second = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: 'rule-a',
			detectedSignals
		});

		expect(stripSurrogateFields(first)).toEqual(stripSurrogateFields(second));
		// ids themselves are still real, distinct, non-deterministic values —
		// not silently identical or empty.
		expect(first[0].id).not.toBe(second[0].id);
	});

	it("emits a rule-summary event carrying the rule's own authored explanation and a satisfying evidenceQuote", () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'A confounder undercuts confident causal attribution.'
				}
			],
			partialCreditSignals: []
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: 'rule-a',
			detectedSignals: [
				signal({
					signal: 'identifies_confounder',
					present: true,
					evidenceQuote: 'the bypass opened at the same time'
				})
			]
		});

		const ruleEvent = events.find((e) => e.ruleId === 'rule-a');
		expect(ruleEvent).toBeDefined();
		expect(ruleEvent?.signal).toBeNull();
		expect(ruleEvent?.explanation).toBe('A confounder undercuts confident causal attribution.');
		expect(ruleEvent?.evidenceQuote).toBe('the bypass opened at the same time');
		expect(ruleEvent?.affectedSkills.length).toBeGreaterThan(0);
	});

	it('credits alternative reasoning paths — a different rule, satisfied a different way, still earns its own rule event', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-uncertain',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'Uncertainty is well-reasoned here.'
				},
				{
					id: 'rule-somewhat-unsupported',
					acceptedJudgments: ['somewhat_unsupported'],
					requiredSignals: ['distinguishes_correlation_from_causation'],
					minimumRequired: 1,
					explanation: 'Correlation-vs-causation reasoning is well-reasoned here too.'
				}
			],
			partialCreditSignals: []
		};

		const viaSecondRule = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: 'rule-somewhat-unsupported',
			detectedSignals: [
				signal({ signal: 'distinguishes_correlation_from_causation', present: true })
			]
		});

		expect(viaSecondRule.some((e) => e.ruleId === 'rule-somewhat-unsupported')).toBe(true);
		expect(viaSecondRule.find((e) => e.ruleId)?.explanation).toBe(
			'Correlation-vs-causation reasoning is well-reasoned here too.'
		);
	});

	it('disagreement with the authored preferred judgment is not automatically penalised — genuinely demonstrated partial-credit signals still earn events even when no rule matched', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: ['identifies_missing_evidence']
		};

		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null, // e.g. the student's final judgment disagreed and matched no rule
			detectedSignals: [
				signal({ signal: 'identifies_confounder', present: false }),
				signal({
					signal: 'identifies_missing_evidence',
					present: true,
					evidenceQuote: 'we never saw X'
				})
			]
		});

		expect(events.some((e) => e.ruleId !== null)).toBe(false); // no rule-summary event — nothing matched
		const partialCredit = events.find((e) => e.signal === 'identifies_missing_evidence');
		expect(partialCredit).toBeDefined(); // but the genuinely demonstrated signal still earns its event
		expect(partialCredit?.evidenceQuote).toBe('we never saw X');
	});

	it('unjustified certainty earns no calibration event — acknowledges_uncertainty absent produces nothing, regardless of confidence', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['acknowledges_uncertainty']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [signal({ signal: 'acknowledges_uncertainty', present: false })]
		});
		expect(events.find((e) => e.signal === 'acknowledges_uncertainty')).toBeUndefined();
	});

	it('genuine acknowledgement of uncertainty does earn a calibration event when actually detected', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['acknowledges_uncertainty']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [
				signal({
					signal: 'acknowledges_uncertainty',
					present: true,
					evidenceQuote: 'I am not fully sure'
				})
			]
		});
		expect(events.find((e) => e.signal === 'acknowledges_uncertainty')).toBeDefined();
	});

	it("changing one's mind without a detected relevant-evidence signal earns no belief-revision credit", () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['updates_for_relevant_evidence']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			// The classifier looked and did not find genuine relevant-evidence
			// updating in the student's text, even though (by hypothesis, at
			// the caller level) their judgment did change between initial and
			// revised — the event system only ever credits what was actually
			// classified as demonstrated, never the raw fact "judgment changed."
			detectedSignals: [signal({ signal: 'updates_for_relevant_evidence', present: false })]
		});
		expect(events.find((e) => e.signal === 'updates_for_relevant_evidence')).toBeUndefined();
	});

	it('maintaining a view despite irrelevant evidence earns appropriate resistance credit when detected', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['resists_irrelevant_evidence']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [
				signal({
					signal: 'resists_irrelevant_evidence',
					present: true,
					evidenceQuote: 'that detail does not actually bear on the claim'
				})
			]
		});
		const resistanceEvent = events.find((e) => e.signal === 'resists_irrelevant_evidence');
		expect(resistanceEvent).toBeDefined();
		expect(resistanceEvent?.affectedSkills).toContain('self_regulation');
	});

	it('never emits an event for moves_goalposts_after_evidence, even if present:true and mistakenly listed as a partialCreditSignal', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			// A case author should never actually do this — PHASE2.md's own
			// invariant is that this signal must never be rewarded — but the
			// exclusion is enforced here defensively, not just by authoring
			// discipline.
			partialCreditSignals: ['moves_goalposts_after_evidence']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [signal({ signal: 'moves_goalposts_after_evidence', present: true })]
		});
		expect(events).toHaveLength(0);
	});

	it('ignores a present:true signal not referenced anywhere in the rubric', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [signal({ signal: 'identifies_source_problem', present: true })]
		});
		expect(events).toHaveLength(0);
	});

	it('falls back to a default skill for an unmapped, case-specific signal (e.g. an update-criterion id)', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['requests_comparison_street']
		};
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: [signal({ signal: 'requests_comparison_street', present: true })]
		});
		expect(events).toHaveLength(1);
		expect(events[0].affectedSkills.length).toBeGreaterThan(0);
		expect(events[0].explanation.length).toBeGreaterThan(0);
	});

	it('stamps every event with the given attemptId and stage', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const events = computeScoringEvents({
			attemptId: 'a-specific-attempt-id',
			stage: 'SCORE_AND_RECORD',
			rubric,
			matchedRuleId: 'rule-a',
			detectedSignals: [signal({ signal: 'identifies_confounder', present: true })]
		});
		for (const e of events) {
			expect(e.attemptId).toBe('a-specific-attempt-id');
			expect(e.stage).toBe('SCORE_AND_RECORD');
		}
	});

	it('returns no events when nothing was detected and no rule matched', () => {
		const rubric: ReasoningRubric = { finalJudgmentRules: [], partialCreditSignals: [] };
		const events = computeScoringEvents({
			attemptId: ATTEMPT_ID,
			stage: STAGE,
			rubric,
			matchedRuleId: null,
			detectedSignals: []
		});
		expect(events).toEqual([]);
	});
});

describe('computePushFurtherHints', () => {
	it('suggests a missing requiredSignal from a rule that accepts the final judgement', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'identifies_confounder', present: false })
		]);
		expect(hints).toHaveLength(1);
		expect(hints[0]).toMatch(/alternative cause/i);
	});

	it('does not suggest a requiredSignal that was already detected as present', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'identifies_confounder', present: true })
		]);
		expect(hints).toHaveLength(0);
	});

	it('does not suggest requiredSignals from a rule whose acceptedJudgments does not include the final judgement', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['strongly_supported'], // the student did NOT land here
					requiredSignals: ['generates_alternative_hypothesis'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const hints = computePushFurtherHints('uncertain', rubric, []);
		expect(hints).toHaveLength(0);
	});

	it('suggests a missing partialCreditSignal regardless of which judgement was reached', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['acknowledges_uncertainty']
		};
		const hints = computePushFurtherHints('somewhat_supported', rubric, [
			signal({ signal: 'acknowledges_uncertainty', present: false })
		]);
		expect(hints).toHaveLength(1);
	});

	it('never suggests moves_goalposts_after_evidence even if it were somehow listed as a partialCreditSignal', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['moves_goalposts_after_evidence']
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'moves_goalposts_after_evidence', present: false })
		]);
		expect(hints).toHaveLength(0);
	});

	it('does not duplicate a hint when the same missing signal appears in both an applicable rule and partialCreditSignals', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: ['identifies_confounder']
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'identifies_confounder', present: false })
		]);
		expect(hints).toHaveLength(1);
	});

	it('returns an empty array when every relevant signal was already demonstrated (nothing manufactured)', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: ['acknowledges_uncertainty']
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'identifies_confounder', present: true }),
			signal({ signal: 'acknowledges_uncertainty', present: true })
		]);
		expect(hints).toEqual([]);
	});

	it('falls back to a generic, still-non-accusatory phrasing for a signal outside the static dictionary (e.g. a case-specific update-criterion id)', () => {
		const rubric: ReasoningRubric = {
			finalJudgmentRules: [],
			partialCreditSignals: ['requests_comparison_street']
		};
		const hints = computePushFurtherHints('uncertain', rubric, [
			signal({ signal: 'requests_comparison_street', present: false })
		]);
		expect(hints).toHaveLength(1);
		expect(hints[0].toLowerCase()).not.toMatch(/fail|wrong|should have/);
	});
});
