import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
	AnthropicScoringProvider,
	DEFAULT_ANTHROPIC_SCORING_MODEL
} from './AnthropicScoringProvider';
import { getSubjectProfile } from '$lib/domain/subjectProfiles';
import { ctSkillIds } from '$lib/domain/taxonomy';
import type { CreateMessageFn } from './llmScoringCore';

const scienceLab = getSubjectProfile('science-lab')!;

function validRawOutputJson(): string {
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
		suggestions: []
	});
}

describe('AnthropicScoringProvider', () => {
	it('defaults to claude-sonnet-5 and passes it through to the model call', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const provider = new AnthropicScoringProvider({ createMessage });

		const result = await provider.scoreLesson({
			lessonVersionId: randomUUID(),
			lessonText: 'A real lesson about experimental design.',
			subjectProfile: scienceLab
		});

		expect(createMessage).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_ANTHROPIC_SCORING_MODEL })
		);
		expect(result.score.modelId).toBe(DEFAULT_ANTHROPIC_SCORING_MODEL);
	});

	it('uses a caller-supplied modelId instead of the default when given one', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const provider = new AnthropicScoringProvider({ createMessage, modelId: 'claude-opus-5' });

		const result = await provider.scoreLesson({
			lessonVersionId: randomUUID(),
			lessonText: 'text',
			subjectProfile: scienceLab
		});

		expect(createMessage).toHaveBeenCalledWith(expect.objectContaining({ model: 'claude-opus-5' }));
		expect(result.score.modelId).toBe('claude-opus-5');
	});
});
