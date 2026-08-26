import OpenAI from 'openai';
import { requireEnv } from '$lib/server/env';
import type {
	ConfidenceRating,
	EvidenceSupportJudgment,
	TutorAction
} from '$lib/domain/practiceSchemas';
import { selectAndPhraseChallengeWithLLM, type CreateMessageFn } from './tutorCore';
import type { TutorProvider, TutorTranscriptTurn } from './TutorProvider';
import { PROVIDER_MAX_RETRIES, PROVIDER_TIMEOUT_MS } from './providerCallDefaults';

export const DEFAULT_DEEPSEEK_TUTOR_MODEL = 'deepseek-chat';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

function defaultCreateMessage(apiKey?: string): CreateMessageFn {
	// Deferred client construction, same reasoning as DeepSeekScoringProvider:
	// constructing the provider must never fail by itself, only selecting a challenge does.
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
			max_tokens: 512,
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

export interface DeepSeekTutorProviderOptions {
	apiKey?: string;
	modelId?: string;
	/** Overrides the real DeepSeek call — used by tests to avoid hitting the network. */
	createMessage?: CreateMessageFn;
}

/**
 * DeepSeek-backed implementation of {@link TutorProvider}
 * (`prompts.txt` Prompt 24, ADR-008's vendor choice). Same
 * OpenAI-wire-compatible SDK Chiron's active scoring and classifier
 * providers use.
 */
export class DeepSeekTutorProvider implements TutorProvider {
	private readonly modelId: string;
	private readonly createMessage: CreateMessageFn;

	constructor(options: DeepSeekTutorProviderOptions = {}) {
		this.modelId = options.modelId ?? DEFAULT_DEEPSEEK_TUTOR_MODEL;
		this.createMessage = options.createMessage ?? defaultCreateMessage(options.apiKey);
	}

	async classifyJudgment(freeText: string): Promise<{ judgment: string; confidence?: number }> {
		// Not exercised by any current route (see TutorProvider.ts's
		// comment) — no real implementation needed yet; kept trivially
		// honest rather than half-built.
		void freeText;
		throw new Error(
			'DeepSeekTutorProvider.classifyJudgment is not implemented — no caller uses it yet'
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
