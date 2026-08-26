import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '$lib/server/env';
import type {
	ConfidenceRating,
	EvidenceSupportJudgment,
	TutorAction
} from '$lib/domain/practiceSchemas';
import { selectAndPhraseChallengeWithLLM, type CreateMessageFn } from './tutorCore';
import type { TutorProvider, TutorTranscriptTurn } from './TutorProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_ANTHROPIC_TUTOR_MODEL = 'claude-sonnet-5';

function defaultCreateMessage(apiKey?: string): CreateMessageFn {
	let client: Anthropic | undefined;

	return async ({ model, system, userMessage }) => {
		client ??= new Anthropic({
			apiKey: apiKey ?? requireEnv('ANTHROPIC_API_KEY'),
			timeout: PROVIDER_TIMEOUT_MS,
			maxRetries: PROVIDER_MAX_RETRIES
		});
		const response = await client.messages.create({
			model,
			max_tokens: 512,
			system,
			messages: [{ role: 'user', content: userMessage }]
		});

		const textBlock = response.content.find(
			(block): block is Anthropic.TextBlock => block.type === 'text'
		);
		if (!textBlock) throw new Error('Model response contained no text content block');
		return textBlock.text;
	};
}

export interface AnthropicTutorProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real Anthropic call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * Anthropic-backed implementation of {@link TutorProvider} (`prompts.txt`
 * Prompt 24). Not Chiron's active tutor provider — see ADR-008 for the
 * same vendor reasoning already applied to scoring and classification —
 * kept as a working alternate behind the same interface.
 */
export class AnthropicTutorProvider implements TutorProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: AnthropicTutorProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_ANTHROPIC_TUTOR_MODEL;
		this.createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
	}

	async classifyJudgment(freeText: string): Promise<{ judgment: string; confidence?: number }> {
		void freeText;
		throw new Error(
			'AnthropicTutorProvider.classifyJudgment is not implemented — no caller uses it yet'
		);
	}

	selectAndPhraseChallenge(input: {
		transcript: readonly TutorTranscriptTurn[];
		revealedEvidenceTexts: readonly string[];
		scenario: string;
		claim: string;
		learnerJudgment: EvidenceSupportJudgment;
		learnerConfidence: ConfidenceRating;
		learnerReasoning: string;
		targetSkillTags: readonly string[];
	}): Promise<{ action: TutorAction; questionText: string }> {
		return selectAndPhraseChallengeWithLLM(this.modelId, this.createMessage, input);
	}
}
