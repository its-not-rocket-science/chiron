import Anthropic from '@anthropic-ai/sdk';
import { requireEnv } from '$lib/server/env';
import type { ScoringResult } from '$lib/domain/schemas';
import { scoreWithLLM, type CreateMessageFn } from './llmScoringCore';
import type { ScoringProvider, ScoringProviderInput } from './ScoringProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_ANTHROPIC_SCORING_MODEL = 'claude-sonnet-5';

function defaultCreateMessage(apiKey?: string): CreateMessageFn {
	// Client construction (and the ANTHROPIC_API_KEY lookup it needs) is
	// deferred to the first actual call, not done here — so constructing an
	// AnthropicScoringProvider never fails by itself, only actually scoring
	// does. That lets domain-level validation (e.g. an unknown subject
	// profile) run and fail with its own clear error before a misconfigured
	// API key gets the chance to mask it with a generic one.
	let client: Anthropic | undefined;

	return async ({ model, system, userMessage }) => {
		client ??= new Anthropic({
			apiKey: apiKey ?? requireEnv('ANTHROPIC_API_KEY'),
			timeout: PROVIDER_TIMEOUT_MS,
			maxRetries: PROVIDER_MAX_RETRIES
		});
		// No `temperature` here, unlike DeepSeekScoringProvider — found live,
		// not by review: the active default model (claude-sonnet-5) rejects
		// the request outright with a 400 ("temperature is deprecated for
		// this model") when it's set at all. Not Chiron's active provider
		// (ADR-008), so this doesn't block anything, but it means
		// `prompts.txt` Prompt P1's "low temperature on both providers for
		// consistency" isn't achievable for the current Anthropic model —
		// recorded here rather than silently working around it by, say,
		// swallowing the error and retrying without the parameter.
		const response = await client.messages.create({
			model,
			max_tokens: 4096,
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

export interface AnthropicScoringProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real Anthropic call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * Anthropic-backed implementation of {@link ScoringProvider}
 * (docs/ARCHITECTURE.md Section 5). Not Chiron's active provider — see
 * ADR-007/ADR-008 in docs/DECISIONS.md — but kept as a working alternate
 * behind the same interface, proving the provider boundary is real.
 */
export class AnthropicScoringProvider implements ScoringProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: AnthropicScoringProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_ANTHROPIC_SCORING_MODEL;
		this.createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
	}

	scoreLesson(input: ScoringProviderInput): Promise<ScoringResult> {
		return scoreWithLLM(this.modelId, this.createMessage, input);
	}
}
