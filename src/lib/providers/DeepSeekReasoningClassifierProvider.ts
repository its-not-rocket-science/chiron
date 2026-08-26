import OpenAI from 'openai';
import { requireEnv } from '$lib/server/env';
import type { SignalClassification } from '$lib/domain/practiceSchemas';
import { classifySignalsWithLLM, type CreateMessageFn } from './classifierCore';
import type { ReasoningClassifierProvider } from './ReasoningClassifierProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_DEEPSEEK_CLASSIFIER_MODEL = 'deepseek-chat';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function defaultCreateMessage(apiKey?: string): CreateMessageFn {
	// Deferred client construction, same reasoning as DeepSeekScoringProvider:
	// constructing the provider must never fail by itself, only classifying does.
	let client: OpenAI | undefined;

	return async ({ model, system, userMessage }) => {
		client ??= new OpenAI({
			apiKey: apiKey ?? requireEnv('DEEPSEEK_API_KEY'),
			baseURL: DEEPSEEK_BASE_URL,
			timeout: PROVIDER_TIMEOUT_MS,
			maxRetries: PROVIDER_MAX_RETRIES
		});

		const response = await client.chat.completions.create({
			model,
			max_tokens: 2048,
			response_format: { type: 'json_object' },
			messages: [
				{ role: 'system', content: system },
				{ role: 'user', content: userMessage }
			]
		});

		const text = response.choices[0]?.message?.content;
		if (!text) throw new Error('Model response contained no content');
		return text;
	};
}

export interface DeepSeekReasoningClassifierProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real DeepSeek call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * DeepSeek-backed implementation of {@link ReasoningClassifierProvider}
 * (`prompts.txt` Prompt 23, ADR-008's vendor choice). Same
 * OpenAI-wire-compatible SDK Chiron's active scoring provider uses.
 */
export class DeepSeekReasoningClassifierProvider implements ReasoningClassifierProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: DeepSeekReasoningClassifierProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_DEEPSEEK_CLASSIFIER_MODEL;
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
