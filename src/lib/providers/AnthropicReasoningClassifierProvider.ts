import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '$lib/server/env';
import type { SignalClassification } from '$lib/domain/practiceSchemas';
import { classifySignalsWithLLM, type CreateMessageFn } from './classifierCore';
import type { ReasoningClassifierProvider } from './ReasoningClassifierProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_ANTHROPIC_CLASSIFIER_MODEL = 'claude-sonnet-5';

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
			max_tokens: 2048,
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

export interface AnthropicReasoningClassifierProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real Anthropic call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * Anthropic-backed implementation of {@link ReasoningClassifierProvider}
 * (`prompts.txt` Prompt 23). Not Chiron's active classifier provider —
 * see ADR-008 for the same vendor reasoning already applied to
 * scoring — kept as a working alternate behind the same interface.
 */
export class AnthropicReasoningClassifierProvider implements ReasoningClassifierProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: AnthropicReasoningClassifierProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_ANTHROPIC_CLASSIFIER_MODEL;
		this.createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
	}

	classifySignals(input: {
		freeText: string;
		scenario: string;
		claim: string;
		revealedEvidenceTexts: readonly string[];
		candidateSignals: readonly string[];
	}): Promise<SignalClassification[]> {
		return classifySignalsWithLLM(this.modelId, this.createMessage, input);
	}
}
