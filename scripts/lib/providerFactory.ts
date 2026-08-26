/**
 * Builds a real `ScoringProvider` for the calibration CLI, calling the
 * exact same `scoreWithLLM` → `buildSystemPrompt`/`buildUserMessage` →
 * vendor-SDK path `DeepSeekScoringProvider`/`AnthropicScoringProvider`
 * use in the real app (`chiron_calibration_feedback_and_automation_
 * prompts.txt` Prompt M4(c) — "call scoreLesson(provider, ...) directly
 * with the real provider/domain code").
 *
 * Deliberately NOT importing `DeepSeekScoringProvider`/
 * `AnthropicScoringProvider` themselves: both read their API key via
 * `requireEnv()` from `$lib/server/env`, which imports SvelteKit's
 * `$env/dynamic/private` virtual module — only resolvable inside
 * SvelteKit's own Vite pipeline, not a plain Node/tsx script. This
 * factory mirrors those two classes' `defaultCreateMessage` logic
 * exactly (same base URL, same model default, same `max_tokens`, same
 * `PROVIDER_TIMEOUT_MS`/`PROVIDER_MAX_RETRIES`), reading the API key
 * from `process.env` directly instead. Everything downstream of this
 * point — `scoreWithLLM`, `buildSystemPrompt`, `buildUserMessage`,
 * `RawScoringOutputSchema` — is the unmodified real scoring path; only
 * this one outermost env-access mechanism differs.
 */
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { MissingEnvError } from '../../src/lib/server/envErrors';
import { scoreWithLLM, type CreateMessageFn } from '../../src/lib/providers/llmScoringCore';
import {
	PROVIDER_MAX_RETRIES,
	PROVIDER_TIMEOUT_MS
} from '../../src/lib/providers/providerCallDefaults';
import type {
	ScoringProvider,
	ScoringProviderInput
} from '../../src/lib/providers/ScoringProvider';
import type { ScoringResult } from '../../src/lib/domain/schemas';

export type CalibrationProviderId = 'deepseek' | 'anthropic';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';
const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

/**
 * Throws `MissingEnvError` specifically (not a plain `Error`) — the same
 * class `llmScoringCore.ts`'s retry loop already special-cases to
 * rethrow immediately rather than treat as a retry-worthy model
 * failure. Using a plain `Error` here would get a missing/misconfigured
 * API key silently swallowed by two pointless retries and surfaced only
 * as a generic "the model did not return a valid result" — exactly the
 * failure mode found running this CLI for the first time (`tsx` doesn't
 * load `.env` on its own; `npm run test:calibration` now runs it via
 * `node --env-file=.env --import tsx`, but a misconfigured environment
 * should still fail fast and clearly, not retry twice into a confusing
 * generic message).
 */
function requireProcessEnv(name: string): string {
	const value = process.env[name];
	if (!value) {
		throw new MissingEnvError(
			`Missing required environment variable: ${name} — set it in .env or the shell environment before running the calibration CLI.`
		);
	}
	return value;
}

function deepSeekCreateMessage(): CreateMessageFn {
	let client: OpenAI | undefined;
	return async ({ model, system, userMessage }) => {
		client ??= new OpenAI({
			apiKey: requireProcessEnv('DEEPSEEK_API_KEY'),
			baseURL: DEEPSEEK_BASE_URL,
			timeout: PROVIDER_TIMEOUT_MS,
			maxRetries: PROVIDER_MAX_RETRIES
		});
		const response = await client.chat.completions.create({
			model,
			max_tokens: 4096,
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

function anthropicCreateMessage(): CreateMessageFn {
	let client: Anthropic | undefined;
	return async ({ model, system, userMessage }) => {
		client ??= new Anthropic({
			apiKey: requireProcessEnv('ANTHROPIC_API_KEY'),
			timeout: PROVIDER_TIMEOUT_MS,
			maxRetries: PROVIDER_MAX_RETRIES
		});
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

export interface CalibrationProvider {
	provider: ScoringProvider;
	providerId: CalibrationProviderId;
	modelId: string;
}

export function buildCalibrationProvider(
	providerId: CalibrationProviderId,
	modelIdOverride?: string
): CalibrationProvider {
	const modelId =
		modelIdOverride ??
		(providerId === 'deepseek' ? DEFAULT_DEEPSEEK_MODEL : DEFAULT_ANTHROPIC_MODEL);
	const createMessage =
		providerId === 'deepseek' ? deepSeekCreateMessage() : anthropicCreateMessage();

	const provider: ScoringProvider = {
		scoreLesson(input: ScoringProviderInput): Promise<ScoringResult> {
			return scoreWithLLM(modelId, createMessage, input);
		}
	};

	return { provider, providerId, modelId };
}
