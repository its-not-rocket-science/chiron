import { describe, expect, it, vi } from 'vitest';
import { selectAndPhraseChallengeWithLLM, type CreateMessageFn } from './tutorCore';
import { MissingEnvError } from '$lib/server/env';
import type { TutorPromptInput } from './tutorPrompt';

const TEST_MODEL_ID = 'test-model';

function input(overrides: Partial<TutorPromptInput> = {}): TutorPromptInput {
	return {
		scenario: 'Accidents fell 18% after cameras were installed.',
		claim: 'The cameras caused the drop.',
		revealedEvidenceTexts: ['A bypass opened the same period, cutting traffic 12%.'],
		transcript: [],
		learnerJudgment: 'uncertain',
		learnerConfidence: 60,
		learnerReasoning: 'The bypass could explain some of the drop.',
		targetSkillTags: ['inference'],
		...overrides
	};
}

function select(createMessage: CreateMessageFn, overrides: Partial<TutorPromptInput> = {}) {
	return selectAndPhraseChallengeWithLLM(TEST_MODEL_ID, createMessage, input(overrides));
}

function validOutputJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		action: 'ASK_FOR_ALTERNATIVE',
		questionText: "What's another explanation for the drop?",
		...overrides
	});
}

describe('selectAndPhraseChallengeWithLLM', () => {
	it('returns a schema-valid action/questionText on a valid first response', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validOutputJson());
		const result = await select(createMessage);

		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result.action).toEqual({ action: 'ASK_FOR_ALTERNATIVE' });
		expect(result.questionText).toBe("What's another explanation for the drop?");
	});

	it('strips a ```json code fence before parsing', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValue('```json\n' + validOutputJson() + '\n```');
		const result = await select(createMessage);
		expect(result.action).toEqual({ action: 'ASK_FOR_ALTERNATIVE' });
	});

	it('retries once on malformed JSON, then succeeds', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce('not valid json')
			.mockResolvedValueOnce(validOutputJson());
		const result = await select(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.action).toEqual({ action: 'ASK_FOR_ALTERNATIVE' });
	});

	it('retries once on an action outside the fixed vocabulary', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(
				JSON.stringify({ action: 'HIGHLIGHT_CONTRADICTION', questionText: 'What about X?' })
			)
			.mockResolvedValueOnce(validOutputJson());
		const result = await select(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.action).toEqual({ action: 'ASK_FOR_ALTERNATIVE' });
	});

	it('retries once when the question introduces a number absent from the scenario/claim/revealed evidence', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(
				JSON.stringify({
					action: 'ASK_ABOUT_NUMBERS',
					questionText: 'Did you know the real drop was actually 47%?'
				})
			)
			.mockResolvedValueOnce(validOutputJson());
		const result = await select(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.action).toEqual({ action: 'ASK_FOR_ALTERNATIVE' });
	});

	it('accepts a question that only reuses numbers already present in the scenario, claim, or revealed evidence', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(
			JSON.stringify({
				action: 'ASK_ABOUT_NUMBERS',
				questionText:
					'The bypass cut traffic 12% — how does that change your view of the 18% figure?'
			})
		);
		const result = await select(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result.action).toEqual({ action: 'ASK_ABOUT_NUMBERS' });
	});

	it('falls back to a fixed, safe generic question after exhausting retries, rather than throwing', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue('still not valid json');
		const result = await select(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			action: { action: 'ASK_FOR_REASONING' },
			questionText: 'Can you walk me through why you reached that judgment?'
		});
	});

	it('propagates a missing-API-key error immediately, without retrying or falling back silently', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockRejectedValue(
				new MissingEnvError('Missing required environment variable: TEST_API_KEY')
			);
		await expect(select(createMessage)).rejects.toBeInstanceOf(MissingEnvError);
		expect(createMessage).toHaveBeenCalledTimes(1);
	});
});
