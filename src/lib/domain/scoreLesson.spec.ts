import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { computeScoringContentHash, scoreLesson, UnknownSubjectProfileError } from './scoreLesson';
import { compareScores, nextVersionNumber } from './versioning';
import { ScoringResultSchema, type ScoringResult } from './schemas';
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

function validScoringResult(): ScoringResult {
	const scoreId = randomUUID();
	return ScoringResultSchema.parse({
		score: {
			id: scoreId,
			lessonVersionId: randomUUID(),
			dialogueScore: 1,
			dialogueJustification: 'x',
			authenticityScore: 1,
			authenticityJustification: 'x',
			mentoringScore: 1,
			mentoringJustification: 'x',
			modelId: 'test-model',
			promptVersion: 'test-prompt-v1',
			createdAt: new Date().toISOString()
		},
		skillCoverage: ctSkillIds.map((skill) => ({
			id: randomUUID(),
			scoreId,
			skill,
			covered: false,
			confidence: 'low' as const,
			justification: 'x'
		})),
		suggestions: []
	});
}

function fakeCache() {
	const store = new Map<string, ScoringResult>();
	return {
		getCachedScore: vi.fn(async (hash: string) => store.get(hash) ?? null),
		saveCachedScore: vi.fn(async (hash: string, result: ScoringResult) => {
			store.set(hash, result);
		})
	};
}

describe('scoreLesson content-hash caching (prompts.txt Prompt P5)', () => {
	it('reuses a cached score on an identical resubmission without calling the provider again', async () => {
		const cache = fakeCache();
		const scoreLessonMock = vi.fn().mockResolvedValue(validScoringResult());
		const provider: ScoringProvider = { scoreLesson: scoreLessonMock };
		const input = {
			lessonVersionId: randomUUID(),
			lessonText: 'Students debate two conflicting explanations for the data.',
			subjectProfileId: 'science-lab'
		};

		await scoreLesson(provider, input, cache);
		expect(scoreLessonMock).toHaveBeenCalledTimes(1);

		const secondVersionId = randomUUID();
		const second = await scoreLesson(
			provider,
			{ ...input, lessonVersionId: secondVersionId },
			cache
		);
		expect(scoreLessonMock).toHaveBeenCalledTimes(1);
		expect(second.score.lessonVersionId).toBe(secondVersionId);
	});

	it('is a cache miss when subjectProfileId differs, even with identical lessonText', async () => {
		const cache = fakeCache();
		const scoreLessonMock = vi.fn().mockResolvedValue(validScoringResult());
		const provider: ScoringProvider = { scoreLesson: scoreLessonMock };
		const lessonText = 'Students debate two conflicting explanations for the data.';

		await scoreLesson(
			provider,
			{ lessonVersionId: randomUUID(), lessonText, subjectProfileId: 'science-lab' },
			cache
		);
		await scoreLesson(
			provider,
			{ lessonVersionId: randomUUID(), lessonText, subjectProfileId: 'history-essay' },
			cache
		);

		expect(scoreLessonMock).toHaveBeenCalledTimes(2);
	});

	it('is a cache miss when the prompt version differs, even with identical lessonText and subject', () => {
		const hashA = computeScoringContentHash('text', 'science-lab', 'prompt-v1');
		const hashB = computeScoringContentHash('text', 'science-lab', 'prompt-v2');
		expect(hashA).not.toBe(hashB);
	});

	it('does not consult or write the cache when none is provided', async () => {
		const scoreLessonMock = vi.fn().mockResolvedValue(validScoringResult());
		const provider: ScoringProvider = { scoreLesson: scoreLessonMock };

		await scoreLesson(provider, {
			lessonVersionId: 'v1',
			lessonText: 'x',
			subjectProfileId: 'science-lab'
		});
		await scoreLesson(provider, {
			lessonVersionId: 'v2',
			lessonText: 'x',
			subjectProfileId: 'science-lab'
		});

		expect(scoreLessonMock).toHaveBeenCalledTimes(2);
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
