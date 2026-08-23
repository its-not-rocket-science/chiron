import { describe, expect, it } from 'vitest';
import { compareScores, nextVersionNumber } from './versioning';
import type { Score } from './schemas';

describe('nextVersionNumber', () => {
	it('starts at 1 for a lesson with no versions yet', () => {
		expect(nextVersionNumber([])).toBe(1);
	});

	it('increments from the highest existing version number', () => {
		expect(nextVersionNumber([{ versionNumber: 1 }, { versionNumber: 2 }])).toBe(3);
	});

	it('is robust to out-of-order input', () => {
		expect(
			nextVersionNumber([{ versionNumber: 3 }, { versionNumber: 1 }, { versionNumber: 2 }])
		).toBe(4);
	});
});

function scoreWith(
	overrides: Partial<Pick<Score, 'dialogueScore' | 'authenticityScore' | 'mentoringScore'>>
): Score {
	return {
		id: 'score-1',
		lessonVersionId: 'version-1',
		dialogueScore: 1,
		dialogueJustification: 'x',
		authenticityScore: 1,
		authenticityJustification: 'x',
		mentoringScore: 1,
		mentoringJustification: 'x',
		modelId: 'test-model',
		createdAt: new Date().toISOString(),
		...overrides
	};
}

describe('compareScores', () => {
	it('reports a positive change per pillar when a revision improves the lesson', () => {
		const before = scoreWith({ dialogueScore: 1, authenticityScore: 1, mentoringScore: 1 });
		const after = scoreWith({ dialogueScore: 3, authenticityScore: 2, mentoringScore: 1 });

		const deltas = compareScores(before, after);

		expect(deltas).toEqual([
			{ pillar: 'dialogue', before: 1, after: 3, change: 2 },
			{ pillar: 'authenticity', before: 1, after: 2, change: 1 },
			{ pillar: 'mentoring', before: 1, after: 1, change: 0 }
		]);
	});

	it('reports a negative change when a revision scores worse', () => {
		const before = scoreWith({ dialogueScore: 3 });
		const after = scoreWith({ dialogueScore: 0 });

		const [dialogueDelta] = compareScores(before, after);
		expect(dialogueDelta).toEqual({ pillar: 'dialogue', before: 3, after: 0, change: -3 });
	});
});
