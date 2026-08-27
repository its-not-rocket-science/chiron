import OpenAI from 'openai';
import { requireEnv } from '$lib/server/env';
import type { ScoringResult } from '$lib/domain/schemas';
import { scoreWithLLM, type CreateMessageFn } from './llmScoringCore';
import type { ScoringProvider, ScoringProviderInput } from './ScoringProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_DEEPSEEK_SCORING_MODEL = 'deepseek-chat';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function defaultCreateMessage(apiKey?: string): CreateMessageFn {
	// Deferred client construction, same reasoning as AnthropicScoringProvider:
	// constructing the provider must never fail by itself, only scoring does.
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
			max_tokens: 4096,
			// Low, not zero — scoring is a judgment task, not literal
			// retrieval, so some model-to-model variation is expected and
			// fine, but reproducibility matters more here than creative
			// variation (prompts.txt Prompt P1).
			temperature: 0.2,
			// DeepSeek's JSON mode guarantees syntactically valid JSON; the exact
			// shape is still enforced by RawScoringOutputSchema after parsing.
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

export interface DeepSeekScoringProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real DeepSeek call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * DeepSeek-backed implementation of {@link ScoringProvider}
 * (docs/ARCHITECTURE.md Section 5, ADR-008). Chiron's active scoring
 * provider — wired up in `POST /api/lessons/score`. DeepSeek's API is
 * OpenAI-wire-compatible, so this uses the `openai` SDK pointed at
 * DeepSeek's base URL rather than a bespoke HTTP client.
 */
export class DeepSeekScoringProvider implements ScoringProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: DeepSeekScoringProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_DEEPSEEK_SCORING_MODEL;
		this.createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
	}

	scoreLesson(input: ScoringProviderInput): Promise<ScoringResult> {
		return scoreWithLLM(this.modelId, this.createMessage, input);
	}
}
