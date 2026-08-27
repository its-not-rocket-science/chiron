import { describe, expect, it } from 'vitest';
import { UserTestFeedbackInputSchema } from './userTestFeedback';

function validInput(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		testCohort: 'alpha-2026-08',
		casesUnderstandable: 4,
		tutorMadeThink: 5,
		newEvidenceMeaningful: 4,
		tutorRepetitive: 2,
		confidenceUnderstandable: 4,
		updateCriterionUnderstandable: 'yes',
		perceivedSteering: false,
		wouldContinue: true,
		...overrides
	};
}

describe('UserTestFeedbackInputSchema', () => {
	it('accepts a fully valid submission', () => {
		expect(() => UserTestFeedbackInputSchema.parse(validInput())).not.toThrow();
	});

	it('defaults omitted optional text fields to null', () => {
		const parsed = UserTestFeedbackInputSchema.parse(validInput());
		expect(parsed.perceivedSteeringExplanation).toBeNull();
		expect(parsed.whatWorkedBest).toBeNull();
		expect(parsed.whatNeedsChanging).toBeNull();
	});

	it('rejects a rating outside 1-5', () => {
		expect(() =>
			UserTestFeedbackInputSchema.parse(validInput({ casesUnderstandable: 6 }))
		).toThrow();
		expect(() => UserTestFeedbackInputSchema.parse(validInput({ tutorRepetitive: 0 }))).toThrow();
	});

	it('rejects an unknown updateCriterionUnderstandable value', () => {
		expect(() =>
			UserTestFeedbackInputSchema.parse(validInput({ updateCriterionUnderstandable: 'kinda' }))
		).toThrow();
	});

	it('rejects a missing testCohort', () => {
		expect(() => UserTestFeedbackInputSchema.parse(validInput({ testCohort: '' }))).toThrow();
	});
});
