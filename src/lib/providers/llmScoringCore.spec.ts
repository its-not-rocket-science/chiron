import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { restampScoringResult, scoreWithLLM, type CreateMessageFn } from './llmScoringCore';
import { SCORING_PROMPT_VERSION } from './scoringPrompt';
import { ScoringError } from './ScoringProvider';
import { getSubjectProfile } from '$lib/domain/subjectProfiles';
import { ctSkillIds } from '$lib/domain/taxonomy';
import { MissingEnvError } from '$lib/server/env';

const scienceLab = getSubjectProfile('science-lab')!;
const TEST_MODEL_ID = 'test-model';

function validRawOutputJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		dialogueScore: 1,
		dialogueJustification: 'Discussion is mentioned once but not designed into the activity.',
		authenticityScore: 2,
		authenticityJustification: 'Students use a realistic scenario, but it is simplified.',
		mentoringScore: 0,
		mentoringJustification: 'No individualized feedback described anywhere in the text.',
		skillCoverage: ctSkillIds.map((skill) => ({
			skill,
			covered: skill === 'inference',
			confidence: 'medium',
			justification: `Justification referencing the lesson for ${skill}.`
		})),
		suggestions: [
			{ pillar: 'dialogue', text: 'Add a structured small-group debate about the data.' },
			{ pillar: 'mentoring', text: 'Have the teacher model interpreting one data point live.' }
		],
		...overrides
	});
}

function score(createMessage: CreateMessageFn, lessonVersionId = randomUUID()) {
	return scoreWithLLM(TEST_MODEL_ID, createMessage, {
		lessonVersionId,
		lessonText: 'A real lesson about experimental design.',
		subjectProfile: scienceLab
	});
}

describe('scoreWithLLM', () => {
	it('returns a schema-valid ScoringResult on a valid first response', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const lessonVersionId = randomUUID();

		const result = await score(createMessage, lessonVersionId);

		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ model: TEST_MODEL_ID }));
		expect(result.score.lessonVersionId).toBe(lessonVersionId);
		expect(result.score.modelId).toBe(TEST_MODEL_ID);
		expect(result.score.dialogueScore).toBe(1);
		expect(result.skillCoverage).toHaveLength(6);
		expect(result.skillCoverage.every((entry) => entry.scoreId === result.score.id)).toBe(true);
		expect(result.suggestions.every((s) => s.scoreId === result.score.id)).toBe(true);
	});

	it('stamps the assembled score with the current scoring prompt version (prompts.txt Prompt P2)', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());

		const result = await score(createMessage);

		expect(result.score.promptVersion).toBe(SCORING_PROMPT_VERSION);
	});
});

describe('restampScoringResult (prompts.txt Prompt P5)', () => {
	it('keeps the cached judgment but assigns fresh ids and the caller-supplied lessonVersionId', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const cached = await score(createMessage, randomUUID());
		const newLessonVersionId = randomUUID();

		const restamped = restampScoringResult(cached, newLessonVersionId);

		expect(restamped.score.lessonVersionId).toBe(newLessonVersionId);
		expect(restamped.score.id).not.toBe(cached.score.id);
		expect(restamped.score.dialogueScore).toBe(cached.score.dialogueScore);
		expect(restamped.score.dialogueJustification).toBe(cached.score.dialogueJustification);
		expect(restamped.score.modelId).toBe(cached.score.modelId);
		expect(restamped.score.promptVersion).toBe(cached.score.promptVersion);

		expect(restamped.skillCoverage).toHaveLength(cached.skillCoverage.length);
		expect(restamped.skillCoverage.every((entry) => entry.scoreId === restamped.score.id)).toBe(
			true
		);
		expect(
			restamped.skillCoverage.every(
				(entry, i) =>
					entry.skill === cached.skillCoverage[i].skill && entry.id !== cached.skillCoverage[i].id
			)
		).toBe(true);
	});

	it('strips a ```json code fence before parsing', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValue('```json\n' + validRawOutputJson() + '\n```');

		const result = await score(createMessage);
		expect(result.score.dialogueScore).toBe(1);
	});

	it('retries once on malformed JSON, then succeeds', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce('not valid json at all')
			.mockResolvedValueOnce(validRawOutputJson());

		const result = await score(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.score.dialogueScore).toBe(1);
	});

	it('retries once on schema-invalid JSON (out-of-range score), then succeeds', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(validRawOutputJson({ dialogueScore: 5 }))
			.mockResolvedValueOnce(validRawOutputJson());

		const result = await score(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.score.dialogueScore).toBe(1);
	});

	it('gives up after two failed attempts and throws ScoringError rather than fabricating a result', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue('still not valid json');

		await expect(score(createMessage)).rejects.toBeInstanceOf(ScoringError);
		expect(createMessage).toHaveBeenCalledTimes(2);
	});

	it('rejects output missing one of the six required skill-coverage entries', async () => {
		const parsed = JSON.parse(validRawOutputJson());
		parsed.skillCoverage = parsed.skillCoverage.slice(0, 5);
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(JSON.stringify(parsed));

		await expect(score(createMessage)).rejects.toBeInstanceOf(ScoringError);
	});

	it('propagates a missing-API-key error immediately, without retrying or masking it as a ScoringError', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockRejectedValue(
				new MissingEnvError('Missing required environment variable: TEST_API_KEY')
			);

		await expect(score(createMessage)).rejects.toBeInstanceOf(MissingEnvError);
		expect(createMessage).toHaveBeenCalledTimes(1);
	});
});
