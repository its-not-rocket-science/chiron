import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { scoreLesson, UnknownSubjectProfileError } from './scoreLesson';
import { compareScores, nextVersionNumber } from './versioning';
import { AnthropicScoringProvider } from '../providers/AnthropicScoringProvider';
import type { CreateMessageFn } from '../providers/llmScoringCore';
import { ctSkillIds } from './taxonomy';
import type { ScoringProvider } from '../providers/ScoringProvider';

function rawOutput(overrides: Record<string, unknown> = {}) {
	return {
		dialogueScore: 1,
		dialogueJustification: 'Discussion happens but is incidental.',
		authenticityScore: 1,
		authenticityJustification: 'A real-world example is mentioned but not worked with.',
		mentoringScore: 0,
		mentoringJustification: 'No individualized feedback described.',
		skillCoverage: ctSkillIds.map((skill) => ({
			skill,
			covered: false,
			confidence: 'low',
			justification: 'Not clearly present in the text.'
		})),
		suggestions: [],
		...overrides
	};
}

describe('scoreLesson (domain orchestration)', () => {
	it('rejects an unknown subject profile before ever calling the provider', async () => {
		const provider: ScoringProvider = { scoreLesson: vi.fn() };

		await expect(
			scoreLesson(provider, {
				lessonVersionId: 'v1',
				lessonText: 'text',
				subjectProfileId: 'not-a-real-subject'
			})
		).rejects.toBeInstanceOf(UnknownSubjectProfileError);
		expect(provider.scoreLesson).not.toHaveBeenCalled();
	});

	it('resolves the subject profile and delegates to the given provider', async () => {
		const scoreLessonMock = vi.fn().mockResolvedValue('sentinel-result');
		const provider: ScoringProvider = { scoreLesson: scoreLessonMock };

		const result = await scoreLesson(provider, {
			lessonVersionId: 'v1',
			lessonText: 'A lesson about tides.',
			subjectProfileId: 'science-lab'
		});

		expect(result).toBe('sentinel-result');
		expect(scoreLessonMock).toHaveBeenCalledWith(
			expect.objectContaining({
				lessonVersionId: 'v1',
				lessonText: 'A lesson about tides.',
				subjectProfile: expect.objectContaining({ id: 'science-lab' })
			})
		);
	});
});

describe('the full before/after revise loop', () => {
	it('scoring a lesson, revising it, and rescoring produces a new version with a comparable delta', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(JSON.stringify(rawOutput({ dialogueScore: 0, mentoringScore: 0 })))
			.mockResolvedValueOnce(JSON.stringify(rawOutput({ dialogueScore: 3, mentoringScore: 1 })));
		const provider = new AnthropicScoringProvider({ createMessage });

		const firstVersionId = randomUUID();
		const secondVersionId = randomUUID();

		const versions = [{ versionNumber: 1 }];
		const firstResult = await scoreLesson(provider, {
			lessonVersionId: firstVersionId,
			lessonText: 'Original lesson: students read silently.',
			subjectProfileId: 'history-essay'
		});

		// Teacher revises the lesson — this becomes version 2.
		const newVersionNumber = nextVersionNumber(versions);
		expect(newVersionNumber).toBe(2);

		const secondResult = await scoreLesson(provider, {
			lessonVersionId: secondVersionId,
			lessonText: 'Revised lesson: students debate two conflicting primary sources.',
			subjectProfileId: 'history-essay'
		});

		const deltas = compareScores(firstResult.score, secondResult.score);
		const dialogueDelta = deltas.find((d) => d.pillar === 'dialogue');
		const mentoringDelta = deltas.find((d) => d.pillar === 'mentoring');

		expect(dialogueDelta).toEqual({ pillar: 'dialogue', before: 0, after: 3, change: 3 });
		expect(mentoringDelta).toEqual({ pillar: 'mentoring', before: 0, after: 1, change: 1 });
		expect(secondResult.score.lessonVersionId).toBe(secondVersionId);
		expect(secondResult.score.id).not.toBe(firstResult.score.id);
	});
});
