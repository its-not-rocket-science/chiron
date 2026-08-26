import { describe, expect, it, vi } from 'vitest';
import { classifySignalsWithLLM, type CreateMessageFn } from './classifierCore';
import { MissingEnvError } from '$lib/server/env';
import type { ClassifierPromptInput } from './classifierPrompt';

const TEST_MODEL_ID = 'test-model';

function input(overrides: Partial<ClassifierPromptInput> = {}): ClassifierPromptInput {
	return {
		scenario: 'A scenario.',
		claim: 'A claim.',
		revealedEvidenceTexts: ['A plausible confounder was identified.'],
		freeText: 'A plausible confounder was identified, so I am not sure the cameras caused it.',
		candidateSignals: ['identifies_confounder', 'identifies_missing_evidence'],
		...overrides
	};
}

function classify(createMessage: CreateMessageFn, overrides: Partial<ClassifierPromptInput> = {}) {
	return classifySignalsWithLLM(TEST_MODEL_ID, createMessage, input(overrides));
}

function validOutputJson(overrides: Record<string, unknown> = {}): string {
	return JSON.stringify({
		classifications: [
			{
				signal: 'identifies_confounder',
				present: true,
				confidence: 'high',
				evidenceQuote: 'A plausible confounder was identified'
			},
			{
				signal: 'identifies_missing_evidence',
				present: false,
				confidence: 'low',
				evidenceQuote: '(no match)'
			}
		],
		...overrides
	});
}

describe('classifySignalsWithLLM', () => {
	it('returns schema-valid classifications on a valid first response', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validOutputJson());
		const result = await classify(createMessage);

		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result).toHaveLength(2);
		expect(result.find((c) => c.signal === 'identifies_confounder')?.present).toBe(true);
	});

	it('strips a ```json code fence before parsing', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValue('```json\n' + validOutputJson() + '\n```');
		const result = await classify(createMessage);
		expect(result).toHaveLength(2);
	});

	it('retries once on malformed JSON, then succeeds', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce('not valid json')
			.mockResolvedValueOnce(validOutputJson());
		const result = await classify(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result).toHaveLength(2);
	});

	it('rejects and retries a signal outside the candidate set (cannot invent new signals)', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(
				JSON.stringify({
					classifications: [
						{
							signal: 'made_up_signal',
							present: true,
							confidence: 'high',
							evidenceQuote: 'A plausible confounder was identified'
						}
					]
				})
			)
			.mockResolvedValueOnce(validOutputJson());
		const result = await classify(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.map((c) => c.signal)).not.toContain('made_up_signal');
	});

	it("rejects and retries a present:true classification whose evidenceQuote isn't actually in the learner's text", async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockResolvedValueOnce(
				JSON.stringify({
					classifications: [
						{
							signal: 'identifies_confounder',
							present: true,
							confidence: 'high',
							evidenceQuote: 'This sentence never appeared in the learner text at all'
						}
					]
				})
			)
			.mockResolvedValueOnce(validOutputJson());
		const result = await classify(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result.find((c) => c.signal === 'identifies_confounder')?.evidenceQuote).toBe(
			'A plausible confounder was identified'
		);
	});

	it('accepts an evidenceQuote that matches modulo whitespace/case (verbatim-enough, not brittle)', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(
			JSON.stringify({
				classifications: [
					{
						signal: 'identifies_confounder',
						present: true,
						confidence: 'high',
						evidenceQuote: '  A PLAUSIBLE   confounder was identified  '
					}
				]
			})
		);
		const result = await classify(createMessage, { candidateSignals: ['identifies_confounder'] });
		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result[0].present).toBe(true);
	});

	it('does not require a found-in-text evidenceQuote when present is false', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(
			JSON.stringify({
				classifications: [
					{
						signal: 'identifies_confounder',
						present: false,
						confidence: 'low',
						evidenceQuote: '(no match)'
					}
				]
			})
		);
		const result = await classify(createMessage, { candidateSignals: ['identifies_confounder'] });
		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result[0].present).toBe(false);
	});

	it('does not reject an empty evidenceQuote when present is false — a real live-classifier response shape, not just a hypothetical one (prompts.txt Prompt 34)', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(
			JSON.stringify({
				classifications: [
					{ signal: 'identifies_confounder', present: false, confidence: 'low', evidenceQuote: '' }
				]
			})
		);
		const result = await classify(createMessage, { candidateSignals: ['identifies_confounder'] });
		expect(createMessage).toHaveBeenCalledTimes(1);
		expect(result[0].present).toBe(false);
		expect(result[0].evidenceQuote).toBe('');
	});

	it('falls back to an empty array after exhausting retries, rather than throwing (deterministic safe fallback)', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue('still not valid json');
		const result = await classify(createMessage);
		expect(createMessage).toHaveBeenCalledTimes(2);
		expect(result).toEqual([]);
	});

	it('propagates a missing-API-key error immediately, without retrying or falling back silently', async () => {
		const createMessage: CreateMessageFn = vi
			.fn()
			.mockRejectedValue(
				new MissingEnvError('Missing required environment variable: TEST_API_KEY')
			);
		await expect(classify(createMessage)).rejects.toBeInstanceOf(MissingEnvError);
		expect(createMessage).toHaveBeenCalledTimes(1);
	});
});
