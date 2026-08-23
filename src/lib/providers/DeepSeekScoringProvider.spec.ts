import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DeepSeekScoringProvider, DEFAULT_DEEPSEEK_SCORING_MODEL } from './DeepSeekScoringProvider';
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

describe('DeepSeekScoringProvider', () => {
	it('defaults to deepseek-chat and passes it through to the model call', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const provider = new DeepSeekScoringProvider({ createMessage });

		const result = await provider.scoreLesson({
			lessonVersionId: randomUUID(),
			lessonText: 'A real lesson about experimental design.',
			subjectProfile: scienceLab
		});

		expect(createMessage).toHaveBeenCalledWith(
			expect.objectContaining({ model: DEFAULT_DEEPSEEK_SCORING_MODEL })
		);
		expect(result.score.modelId).toBe(DEFAULT_DEEPSEEK_SCORING_MODEL);
	});

	it('uses a caller-supplied modelId instead of the default when given one', async () => {
		const createMessage: CreateMessageFn = vi.fn().mockResolvedValue(validRawOutputJson());
		const provider = new DeepSeekScoringProvider({ createMessage, modelId: 'deepseek-reasoner' });

		const result = await provider.scoreLesson({
			lessonVersionId: randomUUID(),
			lessonText: 'text',
			subjectProfile: scienceLab
		});

		expect(createMessage).toHaveBeenCalledWith(
			expect.objectContaining({ model: 'deepseek-reasoner' })
		);
		expect(result.score.modelId).toBe('deepseek-reasoner');
	});
});
