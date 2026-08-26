import { describe, expect, it } from 'vitest';
import {
	SIGNIFICANT_CONFIDENCE_DELTA,
	computeUpdateCriterionConsistency,
	deriveUpdateCriterionSignals
} from './updateCriterionConsistency';
import type { LearnerJudgment, SignalClassification, UpdateCriterion } from './practiceSchemas';

const CRITERION_ID = 'criterion-1';
const EVIDENCE_A = 'evidence-a';
const EVIDENCE_B = 'evidence-b';

function criterion(overrides: Partial<UpdateCriterion> = {}): UpdateCriterion {
	return {
		id: CRITERION_ID,
		signal: 'requests_comparison_street',
		description: 'Recognises a comparable street without the intervention would matter.',
		relevantEvidenceItemIds: [EVIDENCE_A],
		...overrides
	};
}

function classification(overrides: Partial<SignalClassification> = {}): SignalClassification {
	return {
		signal: 'requests_comparison_street',
		present: true,
		confidence: 'high',
		evidenceQuote: 'a street without cameras would show me if it was really the cameras',
		...overrides
	};
}

function judgment(overrides: Partial<LearnerJudgment> = {}): LearnerJudgment {
	return { judgment: 'uncertain', confidence: 50, reasoning: 'x', ...overrides };
}

describe('computeUpdateCriterionConsistency', () => {
	it('criterion met + appropriate update → criterion_met_and_followed', () => {
		const { result, matchedClassification } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 40 }),
			revisedJudgment: judgment({ judgment: 'somewhat_unsupported', confidence: 60 })
		});
		expect(result.status).toBe('criterion_met_and_followed');
		expect(result.evidenceAppeared).toBe(true);
		expect(result.judgmentUpdated).toBe(true);
		expect(result.matchedCriterionId).toBe(CRITERION_ID);
		expect(matchedClassification?.signal).toBe('requests_comparison_street');
	});

	it('criterion met + no update → criterion_met_no_update', () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 50 }),
			revisedJudgment: judgment({ judgment: 'uncertain', confidence: 52 }) // change is below the significance threshold
		});
		expect(result.status).toBe('criterion_met_no_update');
		expect(result.evidenceAppeared).toBe(true);
		expect(result.judgmentUpdated).toBe(false);
	});

	it('criterion not met + no update → criterion_not_met_no_update', () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [], // the promised evidence never appeared
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 50 }),
			revisedJudgment: judgment({ judgment: 'uncertain', confidence: 50 })
		});
		expect(result.status).toBe('criterion_not_met_no_update');
		expect(result.evidenceAppeared).toBe(false);
		expect(result.judgmentUpdated).toBe(false);
	});

	it('criterion not met + update for some other valid reason → criterion_not_met_updated, never auto-labeled as goalpost-moving', () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [], // the promised evidence never appeared
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 40 }),
			revisedJudgment: judgment({ judgment: 'somewhat_unsupported', confidence: 65 }) // updated anyway, for reasons this module can't see
		});
		expect(result.status).toBe('criterion_not_met_updated');
		expect(result.evidenceAppeared).toBe(false);
		expect(result.judgmentUpdated).toBe(true);
		// Be conservative (Prompt 26): the explanation states the two facts
		// and nothing more — no accusation, no "moves_goalposts" language,
		// no inference about the student's motive.
		expect(result.explanation.toLowerCase()).not.toMatch(
			/goalpost|biased|bias|dishonest|inconsistent|cherry/
		);
	});

	it('vague criterion that cannot be reliably scored → criterion_not_relevant', () => {
		const { result, matchedClassification } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: false })], // classifier found nothing scoreable
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment(),
			revisedJudgment: judgment()
		});
		expect(result.status).toBe('criterion_not_relevant');
		expect(result.matchedCriterionId).toBeNull();
		expect(result.evidenceAppeared).toBeNull();
		expect(result.judgmentUpdated).toBeNull();
		expect(matchedClassification).toBeNull();
	});

	it('vague criterion: also treated as not relevant when the classifier returns nothing at all (empty array)', () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [],
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment(),
			revisedJudgment: judgment()
		});
		expect(result.status).toBe('criterion_not_relevant');
	});

	it('does not select a present:false classification as "the first schema-valid match" (the bug this module fixes)', () => {
		const { result, matchedClassification } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [
				classification({ present: false }), // appears first in the array
				classification({ present: true, evidenceQuote: 'a real comparison street' })
			],
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 40 }),
			revisedJudgment: judgment({ judgment: 'somewhat_unsupported', confidence: 60 })
		});
		expect(matchedClassification?.present).toBe(true);
		expect(result.status).toBe('criterion_met_and_followed');
	});

	it('requires ALL of a multi-item relevantEvidenceItemIds to have appeared, not just one', () => {
		const twoPartCriterion = criterion({ relevantEvidenceItemIds: [EVIDENCE_A, EVIDENCE_B] });
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [twoPartCriterion],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [EVIDENCE_A], // only one of the two required items
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 50 }),
			revisedJudgment: judgment({ judgment: 'uncertain', confidence: 50 })
		});
		expect(result.evidenceAppeared).toBe(false);
	});

	it('treats a confidence change at or above the significance threshold as an update even with the same judgment value', () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [classification({ present: true })],
			revealedEvidenceIds: [EVIDENCE_A],
			initialJudgment: judgment({ judgment: 'uncertain', confidence: 40 }),
			revisedJudgment: judgment({
				judgment: 'uncertain',
				confidence: 40 + SIGNIFICANT_CONFIDENCE_DELTA
			})
		});
		expect(result.judgmentUpdated).toBe(true);
		expect(result.status).toBe('criterion_met_and_followed');
	});

	it("quotes the learner's own words in the explanation, in the register docs/PHASE2.md specifies", () => {
		const { result } = computeUpdateCriterionConsistency({
			updateCriteria: [criterion()],
			criterionClassifications: [
				classification({ present: true, evidenceQuote: 'a street with no cameras nearby' })
			],
			revealedEvidenceIds: [],
			initialJudgment: judgment(),
			revisedJudgment: judgment()
		});
		expect(result.explanation).toContain('a street with no cameras nearby');
		expect(result.explanation).toMatch(/your earlier criterion said/i);
	});
});

describe('deriveUpdateCriterionSignals', () => {
	it('criterion_met_and_followed earns states/relevant/follows credit', () => {
		const signals = deriveUpdateCriterionSignals(
			{
				status: 'criterion_met_and_followed',
				explanation: 'x',
				matchedCriterionId: CRITERION_ID,
				evidenceAppeared: true,
				judgmentUpdated: true
			},
			'my stated criterion'
		);
		const ids = signals.map((s) => s.signal);
		expect(ids).toContain('states_update_criterion');
		expect(ids).toContain('relevant_update_criterion');
		expect(ids).toContain('follows_declared_update_criterion');
		expect(signals.every((s) => s.present)).toBe(true);
	});

	it('criterion_met_no_update earns states/relevant credit but not follows credit', () => {
		const signals = deriveUpdateCriterionSignals(
			{
				status: 'criterion_met_no_update',
				explanation: 'x',
				matchedCriterionId: CRITERION_ID,
				evidenceAppeared: true,
				judgmentUpdated: false
			},
			'my stated criterion'
		);
		const ids = signals.map((s) => s.signal);
		expect(ids).toContain('states_update_criterion');
		expect(ids).toContain('relevant_update_criterion');
		expect(ids).not.toContain('follows_declared_update_criterion');
	});

	it('criterion_not_met_updated earns states/relevant credit only — no follows credit, no goalpost-moving signal of any kind', () => {
		const signals = deriveUpdateCriterionSignals(
			{
				status: 'criterion_not_met_updated',
				explanation: 'x',
				matchedCriterionId: CRITERION_ID,
				evidenceAppeared: false,
				judgmentUpdated: true
			},
			'my stated criterion'
		);
		const ids = signals.map((s) => s.signal);
		expect(ids).toEqual(['states_update_criterion', 'relevant_update_criterion']);
		expect(ids).not.toContain('moves_goalposts_after_evidence');
	});

	it('criterion_not_relevant earns no credit at all', () => {
		const signals = deriveUpdateCriterionSignals(
			{
				status: 'criterion_not_relevant',
				explanation: 'x',
				matchedCriterionId: null,
				evidenceAppeared: null,
				judgmentUpdated: null
			},
			null
		);
		expect(signals).toEqual([]);
	});
});
