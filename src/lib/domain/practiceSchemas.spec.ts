import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	ConfidenceRatingSchema,
	CreditableAnswerSpecSchema,
	EvidenceItemSchema,
	LearnerJudgmentSchema,
	PracticeAttemptSchema,
	PracticeCaseSchema,
	PracticeSessionSchema,
	ReasoningRuleSchema,
	ScoringEventSchema,
	ScoringExplanationSchema,
	SignalClassificationSchema,
	TutorActionSchema,
	UpdateCriterionSchema,
	deriveCaseStages,
	signalClassificationSchemaFor,
	tutorActionIds,
	toPublicPracticeCase,
	getTeachingExplanation,
	type EvidenceItem,
	type PracticeCase,
	type ReasoningRule
} from './practiceSchemas';

const uuid = () => randomUUID();
const now = () => new Date().toISOString();

function evidenceItem(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
	return {
		id: uuid(),
		text: 'The comparison group showed no similar change over the same period.',
		revealOrder: 0,
		stance: 'supports_counter_claim',
		...overrides
	};
}

function reasoningRule(overrides: Partial<ReasoningRule> = {}): ReasoningRule {
	return {
		id: uuid(),
		acceptedJudgments: ['somewhat_supported', 'strongly_supported'],
		requiredSignals: [],
		minimumRequired: 0,
		explanation: 'The evidence directly supports this reading with no special reasoning required.',
		...overrides
	};
}

function validCase(overrides: Partial<PracticeCase> = {}): PracticeCase {
	const e1 = evidenceItem({ revealOrder: 0 });
	const e2 = evidenceItem({ revealOrder: 1, text: 'A plausible confounder was identified later.' });
	return {
		id: 'causal-inference-1',
		title: 'Did the new policy actually help?',
		subjectProfileId: 'science-lab',
		skillTags: ['inference', 'evaluation'],
		dispositionTags: ['approach_to_inquiry'],
		difficulty: 'core',
		responseMode: 'evidence_support_scale',
		scenario: 'A city reports fewer incidents after a new policy took effect.',
		claim: 'The policy caused the drop in incidents.',
		evidencePool: [e1, e2],
		answerSpec: {
			targetRange: { min: 'uncertain', max: 'somewhat_supported' },
			calibrationEligible: true,
			reasoningRubric: {
				finalJudgmentRules: [
					reasoningRule({ acceptedJudgments: ['somewhat_supported'] }),
					reasoningRule({
						acceptedJudgments: ['uncertain'],
						requiredSignals: ['identifies_confounder'],
						minimumRequired: 1,
						explanation: 'Uncertainty is well-founded once a real confounder is identified.'
					})
				],
				partialCreditSignals: ['identifies_missing_evidence']
			},
			rationale: 'The comparison data is suggestive but a real confounder was never ruled out.'
		},
		usesUpdateCriterion: false,
		provenance: { isSynthetic: true, note: 'Synthetic scenario written for this test fixture.' },
		educatorNotes: 'Watch for students conflating correlation with causation on the first pass.',
		teachingExplanation:
			'Before/after data alone cannot establish causation when a plausible confounder exists.',
		visibility: 'public-template',
		createdBy: 'system',
		...overrides
	};
}

describe('ConfidenceRatingSchema', () => {
	it('accepts 0, 100, and values in between', () => {
		expect(() => ConfidenceRatingSchema.parse(0)).not.toThrow();
		expect(() => ConfidenceRatingSchema.parse(100)).not.toThrow();
		expect(() => ConfidenceRatingSchema.parse(63)).not.toThrow();
	});

	it('rejects out-of-range, non-integer, and negative confidence', () => {
		expect(() => ConfidenceRatingSchema.parse(101)).toThrow();
		expect(() => ConfidenceRatingSchema.parse(-1)).toThrow();
		expect(() => ConfidenceRatingSchema.parse(50.5)).toThrow();
	});
});

describe('LearnerJudgmentSchema', () => {
	it('accepts a valid judgment', () => {
		expect(() =>
			LearnerJudgmentSchema.parse({
				judgment: 'uncertain',
				confidence: 40,
				reasoning: 'The comparison data helps but does not rule out other causes.'
			})
		).not.toThrow();
	});

	it('rejects an unknown judgment value', () => {
		expect(() =>
			LearnerJudgmentSchema.parse({ judgment: 'true', confidence: 40, reasoning: 'x' })
		).toThrow();
	});
});

describe('EvidenceItemSchema', () => {
	it('accepts a valid item', () => {
		expect(() => EvidenceItemSchema.parse(evidenceItem())).not.toThrow();
	});

	it('rejects an unknown stance', () => {
		expect(() => EvidenceItemSchema.parse({ ...evidenceItem(), stance: 'irrelevant' })).toThrow();
	});
});

describe('ReasoningRuleSchema — impossible reasoning rules', () => {
	it('accepts a satisfiable rule', () => {
		expect(() =>
			ReasoningRuleSchema.parse(
				reasoningRule({
					requiredSignals: ['identifies_confounder', 'identifies_missing_evidence'],
					minimumRequired: 1
				})
			)
		).not.toThrow();
	});

	it('rejects minimumRequired greater than the number of requiredSignals', () => {
		expect(() =>
			ReasoningRuleSchema.parse(
				reasoningRule({ requiredSignals: ['identifies_confounder'], minimumRequired: 2 })
			)
		).toThrow(/could never be satisfied/);
	});

	it('rejects a positive minimumRequired with no requiredSignals at all', () => {
		expect(() =>
			ReasoningRuleSchema.parse(reasoningRule({ requiredSignals: [], minimumRequired: 1 }))
		).toThrow();
	});
});

describe('CreditableAnswerSpecSchema — targetRange ordering', () => {
	it('accepts an ordered range', () => {
		const spec = validCase().answerSpec;
		expect(() => CreditableAnswerSpecSchema.parse(spec)).not.toThrow();
	});

	it('rejects a range whose min ranks above its max', () => {
		const spec = validCase().answerSpec;
		expect(() =>
			CreditableAnswerSpecSchema.parse({
				...spec,
				targetRange: { min: 'strongly_supported', max: 'uncertain' }
			})
		).toThrow(/must not rank above/);
	});
});

describe('CreditableAnswerSpecSchema — calibrationEligible width constraint', () => {
	it('accepts calibrationEligible: true with a two-band-wide targetRange', () => {
		const spec = validCase().answerSpec;
		expect(() =>
			CreditableAnswerSpecSchema.parse({
				...spec,
				targetRange: { min: 'uncertain', max: 'somewhat_supported' }, // width 2
				calibrationEligible: true
			})
		).not.toThrow();
	});

	it('rejects calibrationEligible: true with a three-band-wide targetRange', () => {
		const spec = validCase().answerSpec;
		expect(() =>
			CreditableAnswerSpecSchema.parse({
				...spec,
				targetRange: { min: 'somewhat_unsupported', max: 'somewhat_supported' }, // width 3
				calibrationEligible: true
			})
		).toThrow(/calibrationEligible cases must have a targetRange spanning at most/);
	});

	it('accepts calibrationEligible: false regardless of targetRange width', () => {
		const spec = validCase().answerSpec;
		expect(() =>
			CreditableAnswerSpecSchema.parse({
				...spec,
				targetRange: { min: 'strongly_unsupported', max: 'strongly_supported' }, // width 5
				calibrationEligible: false
			})
		).not.toThrow();
	});
});

describe('PracticeCaseSchema', () => {
	it('accepts a valid case', () => {
		expect(() => PracticeCaseSchema.parse(validCase())).not.toThrow();
	});

	it('rejects a malformed case (missing required fields)', () => {
		const withoutClaim: Record<string, unknown> = { ...validCase() };
		delete withoutClaim.claim;
		expect(() => PracticeCaseSchema.parse(withoutClaim)).toThrow();
	});

	it('rejects an empty scenario', () => {
		expect(() => PracticeCaseSchema.parse(validCase({ scenario: '' }))).toThrow();
	});

	it('rejects duplicate evidence revealOrder values', () => {
		const c = validCase();
		const duplicated = {
			...c,
			evidencePool: [
				c.evidencePool[0],
				{ ...c.evidencePool[1], revealOrder: c.evidencePool[0].revealOrder }
			]
		};
		expect(() => PracticeCaseSchema.parse(duplicated)).toThrow(/unique revealOrder/);
	});

	it('supports multiple acceptable final judgement bands (more than one creditable rule)', () => {
		const c = validCase();
		expect(c.answerSpec.reasoningRubric.finalJudgmentRules.length).toBeGreaterThan(1);
		const parsed = PracticeCaseSchema.parse(c);
		const acceptedUnion = parsed.answerSpec.reasoningRubric.finalJudgmentRules.flatMap(
			(r) => r.acceptedJudgments
		);
		expect(acceptedUnion).toContain('somewhat_supported');
		expect(acceptedUnion).toContain('uncertain');
	});

	it('supports genuine uncertainty as a creditable final judgment, backed by a real signal requirement', () => {
		const c = validCase();
		const uncertainRule = c.answerSpec.reasoningRubric.finalJudgmentRules.find((r) =>
			r.acceptedJudgments.includes('uncertain')
		);
		expect(uncertainRule).toBeDefined();
		expect(uncertainRule?.requiredSignals.length).toBeGreaterThan(0);
		expect(() => PracticeCaseSchema.parse(c)).not.toThrow();
	});

	it('accepts a case that uses the update-criterion mechanic', () => {
		const c = validCase({ usesUpdateCriterion: true });
		c.updateCriteria = [
			UpdateCriterionSchema.parse({
				id: uuid(),
				signal: 'requests_control_comparison',
				description:
					'Recognises that a comparable control group would materially change the inference.',
				relevantEvidenceItemIds: [c.evidencePool[0].id]
			})
		];
		expect(() => PracticeCaseSchema.parse(c)).not.toThrow();
	});

	it("rejects an updateCriterion whose relevantEvidenceItemIds references an id outside this case's evidencePool", () => {
		const c = validCase({ usesUpdateCriterion: true });
		c.updateCriteria = [
			UpdateCriterionSchema.parse({
				id: uuid(),
				signal: 'requests_control_comparison',
				description: 'x',
				relevantEvidenceItemIds: [uuid()] // not one of c.evidencePool's real ids
			})
		];
		expect(() => PracticeCaseSchema.parse(c)).toThrow(/not in this case's evidencePool/);
	});

	it('rejects usesUpdateCriterion: true with no updateCriteria', () => {
		expect(() => PracticeCaseSchema.parse(validCase({ usesUpdateCriterion: true }))).toThrow(
			/updateCriteria must be non-empty/
		);
	});

	it('rejects usesUpdateCriterion: false with updateCriteria present', () => {
		const base = validCase();
		const criterion = UpdateCriterionSchema.parse({
			id: uuid(),
			signal: 'requests_control_comparison',
			description: 'x',
			relevantEvidenceItemIds: [base.evidencePool[0].id]
		});
		expect(() =>
			PracticeCaseSchema.parse({ ...base, usesUpdateCriterion: false, updateCriteria: [criterion] })
		).toThrow(/must be omitted/);
	});

	it('accepts a rule that references a case-specific update-criterion signal, not just the closed vocabulary', () => {
		const c = validCase({ usesUpdateCriterion: true });
		c.updateCriteria = [
			UpdateCriterionSchema.parse({
				id: uuid(),
				signal: 'requests_control_comparison',
				description: 'x',
				relevantEvidenceItemIds: [c.evidencePool[0].id]
			})
		];
		c.answerSpec.reasoningRubric.finalJudgmentRules.push(
			reasoningRule({
				acceptedJudgments: ['strongly_unsupported'],
				requiredSignals: ['requests_control_comparison'],
				minimumRequired: 1
			})
		);
		expect(() => PracticeCaseSchema.parse(c)).not.toThrow();
	});

	it('rejects an invalid signal reference — not in the closed vocabulary and not a declared updateCriteria signal', () => {
		const c = validCase();
		c.answerSpec.reasoningRubric.finalJudgmentRules.push(
			reasoningRule({ requiredSignals: ['made_up_signal'], minimumRequired: 1 })
		);
		expect(() => PracticeCaseSchema.parse(c)).toThrow(/is not in the cross-case vocabulary/);
	});

	it('rejects a partialCreditSignals entry that is not a valid signal reference', () => {
		const c = validCase();
		c.answerSpec.reasoningRubric.partialCreditSignals.push('also_made_up');
		expect(() => PracticeCaseSchema.parse(c)).toThrow(/is not in the cross-case vocabulary/);
	});
});

describe('hidden metadata separation', () => {
	it('toPublicPracticeCase strips answerSpec, evidencePool, and updateCriteria entirely', () => {
		const c = validCase({ usesUpdateCriterion: true });
		c.updateCriteria = [
			UpdateCriterionSchema.parse({
				id: uuid(),
				signal: 'requests_control_comparison',
				description: 'x',
				relevantEvidenceItemIds: [c.evidencePool[0].id]
			})
		];
		const publicCase = toPublicPracticeCase(c);

		expect(publicCase).not.toHaveProperty('answerSpec');
		expect(publicCase).not.toHaveProperty('evidencePool');
		expect(publicCase).not.toHaveProperty('updateCriteria');
		expect(publicCase).not.toHaveProperty('educatorNotes');
		expect(publicCase).not.toHaveProperty('teachingExplanation');
		expect(publicCase).not.toHaveProperty('provenance');
		expect(JSON.stringify(publicCase)).not.toContain('reasoningRubric');
		expect(JSON.stringify(publicCase)).not.toContain(c.evidencePool[1].text);
		expect(JSON.stringify(publicCase)).not.toContain(c.educatorNotes);
		expect(JSON.stringify(publicCase)).not.toContain(c.teachingExplanation);

		// Still carries everything a case-intro screen actually needs.
		expect(publicCase.id).toBe(c.id);
		expect(publicCase.scenario).toBe(c.scenario);
		expect(publicCase.claim).toBe(c.claim);
		expect(publicCase.usesUpdateCriterion).toBe(true);
	});

	it('getTeachingExplanation returns the case content by design, not by omission — callers gate the timing', () => {
		const c = validCase();
		expect(getTeachingExplanation(c)).toBe(c.teachingExplanation);
	});
});

describe('deriveCaseStages', () => {
	it('derives one stage per evidence item, ordered by revealOrder', () => {
		const e1 = evidenceItem({ revealOrder: 2 });
		const e2 = evidenceItem({ revealOrder: 0 });
		const e3 = evidenceItem({ revealOrder: 1 });
		const stages = deriveCaseStages([e1, e2, e3]);
		expect(stages.map((s) => s.evidenceItemId)).toEqual([e2.id, e3.id, e1.id]);
		expect(stages.map((s) => s.stageNumber)).toEqual([0, 1, 2]);
	});
});

describe('SignalClassificationSchema', () => {
	it('accepts a valid classification', () => {
		expect(() =>
			SignalClassificationSchema.parse({
				signal: 'identifies_confounder',
				present: true,
				confidence: 'high',
				evidenceQuote: 'Traffic could have fallen for another reason.'
			})
		).not.toThrow();
	});

	it('rejects an empty evidenceQuote when present is true', () => {
		expect(() =>
			SignalClassificationSchema.parse({
				signal: 'identifies_confounder',
				present: true,
				confidence: 'high',
				evidenceQuote: ''
			})
		).toThrow();
	});

	it('accepts an empty evidenceQuote when present is false — nothing to quote for a signal that was not demonstrated (prompts.txt Prompt 34 — a real live-classifier failure this unblocks)', () => {
		expect(() =>
			SignalClassificationSchema.parse({
				signal: 'identifies_confounder',
				present: false,
				confidence: 'low',
				evidenceQuote: ''
			})
		).not.toThrow();
	});

	it('signalClassificationSchemaFor rejects a signal outside the call-specific allowed set', () => {
		const schema = signalClassificationSchemaFor([
			'identifies_confounder',
			'identifies_missing_evidence'
		]);
		expect(() =>
			schema.parse({
				signal: 'generates_alternative_hypothesis',
				present: true,
				confidence: 'medium',
				evidenceQuote: 'x'
			})
		).toThrow(/not in the allowed set/);
	});

	it('signalClassificationSchemaFor accepts a case-specific update-criterion signal when it is in the allowed set', () => {
		const schema = signalClassificationSchemaFor(['requests_control_comparison']);
		expect(() =>
			schema.parse({
				signal: 'requests_control_comparison',
				present: true,
				confidence: 'medium',
				evidenceQuote: 'What if there was no control group?'
			})
		).not.toThrow();
	});
});

describe('TutorActionSchema', () => {
	it('accepts every action in the fixed vocabulary', () => {
		for (const action of tutorActionIds) {
			expect(() => TutorActionSchema.parse({ action })).not.toThrow();
		}
	});

	it('rejects an action outside the fixed vocabulary (e.g. the retired HIGHLIGHT_CONTRADICTION)', () => {
		expect(() => TutorActionSchema.parse({ action: 'HIGHLIGHT_CONTRADICTION' })).toThrow();
	});

	it("REFER_TO_REVEALED_EVIDENCE carries no evidenceId parameter (Prompt 24 supersedes Prompt 22's design)", () => {
		const parsed = TutorActionSchema.parse({ action: 'REFER_TO_REVEALED_EVIDENCE' });
		expect(parsed).toEqual({ action: 'REFER_TO_REVEALED_EVIDENCE' });
	});
});

describe('ScoringExplanationSchema / PracticeAttemptSchema', () => {
	function validAttempt() {
		return {
			id: uuid(),
			studentId: uuid(),
			caseId: 'causal-inference-1',
			sessionId: uuid(),
			initialJudgment: {
				judgment: 'uncertain' as const,
				confidence: 30,
				reasoning: 'Not sure yet.'
			},
			updateCriterion: null,
			revisedJudgment: {
				judgment: 'uncertain' as const,
				confidence: 55,
				reasoning: 'A confounder was identified and never ruled out.'
			},
			scoringExplanation: {
				detectedSignals: [
					{
						signal: 'identifies_confounder',
						present: true,
						confidence: 'high' as const,
						evidenceQuote: 'A plausible confounder was identified later.'
					}
				],
				matchedRuleId: uuid(),
				outcome: 'correct' as const
			},
			scoringEvents: [],
			createdAt: now()
		};
	}

	it('accepts a valid attempt with a two-valued outcome', () => {
		expect(() => PracticeAttemptSchema.parse(validAttempt())).not.toThrow();
	});

	it('rejects an outcome value outside correct/incorrect (no reintroduced third category)', () => {
		const attempt = validAttempt();
		expect(() =>
			ScoringExplanationSchema.parse({
				...attempt.scoringExplanation,
				outcome: 'appropriately_uncertain'
			})
		).toThrow();
	});

	it('accepts an attempt carrying a captured update criterion', () => {
		const attempt = validAttempt();
		expect(() =>
			PracticeAttemptSchema.parse({
				...attempt,
				updateCriterion: {
					text: 'If there were a control group showing no change, I would be much less confident.',
					classification: {
						signal: 'requests_control_comparison',
						present: true,
						confidence: 'high',
						evidenceQuote: 'If there were a control group showing no change'
					},
					consistency: {
						status: 'criterion_met_and_followed',
						explanation:
							'Your earlier criterion said "If there were a control group showing no change" would matter. That evidence appeared, and your judgment or confidence changed accordingly.',
						matchedCriterionId: uuid(),
						evidenceAppeared: true,
						judgmentUpdated: true
					}
				}
			})
		).not.toThrow();
	});

	it('accepts an attempt whose update criterion was never relevant (null classification, criterion_not_relevant)', () => {
		const attempt = validAttempt();
		expect(() =>
			PracticeAttemptSchema.parse({
				...attempt,
				updateCriterion: {
					text: 'I am not sure what would change my mind.',
					classification: null,
					consistency: {
						status: 'criterion_not_relevant',
						explanation:
							"We couldn't reliably connect your stated criterion to the evidence in this case, so it isn't reflected in your update-consistency feedback.",
						matchedCriterionId: null,
						evidenceAppeared: null,
						judgmentUpdated: null
					}
				}
			})
		).not.toThrow();
	});
});

describe('PracticeSessionSchema', () => {
	it('accepts a freshly-started session with no judgment yet', () => {
		expect(() =>
			PracticeSessionSchema.parse({
				id: uuid(),
				studentId: uuid(),
				caseId: 'causal-inference-1',
				fsmState: 'PRESENT_SCENARIO',
				revealedEvidenceIds: [],
				transcript: [],
				initialJudgment: null,
				updateCriterionText: null,
				revisedJudgment: null,
				reflectionText: null,
				createdAt: now(),
				updatedAt: now()
			})
		).not.toThrow();
	});

	it('rejects an unknown fsmState', () => {
		expect(() =>
			PracticeSessionSchema.parse({
				id: uuid(),
				studentId: uuid(),
				caseId: 'causal-inference-1',
				fsmState: 'MADE_UP_STATE',
				revealedEvidenceIds: [],
				transcript: [],
				initialJudgment: null,
				updateCriterionText: null,
				revisedJudgment: null,
				reflectionText: null,
				createdAt: now(),
				updatedAt: now()
			})
		).toThrow();
	});
});

describe('ScoringEventSchema', () => {
	it('accepts an event caused by a matched rule', () => {
		expect(() =>
			ScoringEventSchema.parse({
				id: uuid(),
				attemptId: uuid(),
				ruleId: uuid(),
				signal: null,
				affectedSkills: ['inference'],
				explanation: 'Correctly identified a confounder before settling on a judgment.',
				evidenceQuote: 'A plausible confounder was identified later.',
				stage: 'SCORE_AND_RECORD',
				createdAt: now()
			})
		).not.toThrow();
	});

	it('accepts a partial-credit event caused by a bare signal, not a matched rule', () => {
		expect(() =>
			ScoringEventSchema.parse({
				id: uuid(),
				attemptId: uuid(),
				ruleId: null,
				signal: 'identifies_missing_evidence',
				affectedSkills: ['evaluation'],
				explanation:
					'Noticed a gap in the evidence even though the final judgment was not creditable.',
				evidenceQuote: 'We still do not know the baseline rate.',
				stage: 'SCORE_AND_RECORD',
				createdAt: now()
			})
		).not.toThrow();
	});

	it('rejects an event with both ruleId and signal set', () => {
		expect(() =>
			ScoringEventSchema.parse({
				id: uuid(),
				attemptId: uuid(),
				ruleId: uuid(),
				signal: 'identifies_missing_evidence',
				affectedSkills: ['evaluation'],
				explanation: 'x',
				evidenceQuote: 'x',
				stage: 'SCORE_AND_RECORD',
				createdAt: now()
			})
		).toThrow(/exactly one/);
	});

	it('rejects an event with neither ruleId nor signal set', () => {
		expect(() =>
			ScoringEventSchema.parse({
				id: uuid(),
				attemptId: uuid(),
				ruleId: null,
				signal: null,
				affectedSkills: ['evaluation'],
				explanation: 'x',
				evidenceQuote: 'x',
				stage: 'SCORE_AND_RECORD',
				createdAt: now()
			})
		).toThrow(/exactly one/);
	});
});
