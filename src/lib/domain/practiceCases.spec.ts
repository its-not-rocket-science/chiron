import { describe, expect, it } from 'vitest';
import {
	PracticeCaseSchema,
	toPublicPracticeCase,
	getTeachingExplanation,
	deriveCaseStages
} from './practiceSchemas';
import { getPracticeCase, listPracticeCasesPublic, practiceCases } from './practiceCases';

describe('practiceCases — exactly three, per prompts.txt Prompt 21', () => {
	it('has exactly three cases', () => {
		expect(practiceCases).toHaveLength(3);
	});

	it('every case has a unique id', () => {
		const ids = practiceCases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every case validates against PracticeCaseSchema on its own (not just via the module-load parse)', () => {
		for (const c of practiceCases) {
			expect(() => PracticeCaseSchema.parse(c)).not.toThrow();
		}
	});
});

describe('each case proves a distinct part of the engine', () => {
	it('causal-inference-1: multiple creditable judgment bands, genuine uncertainty, and the update-criterion mechanic', () => {
		const c = getPracticeCase('causal-inference-1');
		expect(c).toBeDefined();
		if (!c) return;

		const acceptedJudgments = c.answerSpec.reasoningRubric.finalJudgmentRules.flatMap(
			(r) => r.acceptedJudgments
		);
		expect(new Set(acceptedJudgments).size).toBeGreaterThan(1);
		expect(acceptedJudgments).toContain('uncertain');

		// No free credit path — every rule requires a real signal.
		for (const rule of c.answerSpec.reasoningRubric.finalJudgmentRules) {
			expect(rule.requiredSignals.length).toBeGreaterThan(0);
			expect(rule.minimumRequired).toBeGreaterThan(0);
		}

		expect(c.usesUpdateCriterion).toBe(true);
		expect(c.updateCriteria?.length).toBeGreaterThan(0);
	});

	it('relative-risk-1: a target band in the middle of the scale, not at either extreme', () => {
		const c = getPracticeCase('relative-risk-1');
		expect(c).toBeDefined();
		if (!c) return;

		expect(c.answerSpec.targetRange.min).not.toBe('strongly_unsupported');
		expect(c.answerSpec.targetRange.max).not.toBe('strongly_supported');
		expect(c.usesUpdateCriterion).toBe(false);
	});

	it('source-provenance-1: the evidence clearly resolves the claim (no rule accepts a supported judgment)', () => {
		const c = getPracticeCase('source-provenance-1');
		expect(c).toBeDefined();
		if (!c) return;

		const acceptedJudgments = c.answerSpec.reasoningRubric.finalJudgmentRules.flatMap(
			(r) => r.acceptedJudgments
		);
		expect(acceptedJudgments).not.toContain('somewhat_supported');
		expect(acceptedJudgments).not.toContain('strongly_supported');
		expect(c.usesUpdateCriterion).toBe(false);
	});
});

describe('required content per prompts.txt Prompt 21, for every case', () => {
	it('every case avoids a single no-reasoning-required rule covering its whole targetRange (not a trick question resolvable by the "obvious" reading alone)', () => {
		for (const c of practiceCases) {
			const zeroSignalRules = c.answerSpec.reasoningRubric.finalJudgmentRules.filter(
				(r) => r.requiredSignals.length === 0
			);
			// Every case here has at least one rule that actually requires
			// demonstrated reasoning — none is "any judgment gets credit."
			expect(zeroSignalRules.length).toBeLessThan(
				c.answerSpec.reasoningRubric.finalJudgmentRules.length
			);
		}
	});

	it('every case has at least two evidence items with distinct stances (a real mix, not one-sided)', () => {
		for (const c of practiceCases) {
			const stances = new Set(c.evidencePool.map((e) => e.stance));
			expect(stances.size).toBeGreaterThanOrEqual(2);
		}
	});

	it('every case has non-empty educator notes, a teaching explanation, and provenance metadata', () => {
		for (const c of practiceCases) {
			expect(c.educatorNotes.length).toBeGreaterThan(0);
			expect(c.teachingExplanation.length).toBeGreaterThan(0);
			expect(c.provenance.isSynthetic).toBe(true);
			expect(c.provenance.note.length).toBeGreaterThan(0);
		}
	});

	it('every case is marked synthetic — none is presented as a real reported event', () => {
		for (const c of practiceCases) {
			expect(c.provenance.isSynthetic).toBe(true);
		}
	});

	it('getTeachingExplanation returns real, distinct content per case', () => {
		const explanations = practiceCases.map((c) => getTeachingExplanation(c));
		expect(new Set(explanations).size).toBe(explanations.length);
		for (const text of explanations) expect(text.length).toBeGreaterThan(20);
	});
});

describe('hidden metadata separation, for every real case (not just a synthetic fixture)', () => {
	it('the public view of every case excludes answerSpec, evidencePool, updateCriteria, educatorNotes, teachingExplanation, and provenance', () => {
		for (const c of practiceCases) {
			const publicCase = toPublicPracticeCase(c);
			expect(publicCase).not.toHaveProperty('answerSpec');
			expect(publicCase).not.toHaveProperty('evidencePool');
			expect(publicCase).not.toHaveProperty('updateCriteria');
			expect(publicCase).not.toHaveProperty('educatorNotes');
			expect(publicCase).not.toHaveProperty('teachingExplanation');
			expect(publicCase).not.toHaveProperty('provenance');

			const serialized = JSON.stringify(publicCase);
			expect(serialized).not.toContain(c.educatorNotes);
			expect(serialized).not.toContain(c.teachingExplanation);
			for (const rule of c.answerSpec.reasoningRubric.finalJudgmentRules) {
				expect(serialized).not.toContain(rule.explanation);
			}
			for (const evidence of c.evidencePool) {
				expect(serialized).not.toContain(evidence.text);
			}
		}
	});

	it('listPracticeCasesPublic never leaks case content across the whole set, not just one case at a time', () => {
		const publicCases = listPracticeCasesPublic();
		expect(publicCases).toHaveLength(3);
		const serialized = JSON.stringify(publicCases);
		for (const c of practiceCases) {
			expect(serialized).not.toContain(c.answerSpec.rationale);
			expect(serialized).not.toContain(c.educatorNotes);
		}
	});
});

describe('deriveCaseStages on real case data', () => {
	it('produces one stage per evidence item, in reveal order, for every case', () => {
		for (const c of practiceCases) {
			const stages = deriveCaseStages(c.evidencePool);
			expect(stages).toHaveLength(c.evidencePool.length);
			expect(stages.map((s) => s.stageNumber)).toEqual(stages.map((_, i) => i));
		}
	});
});
