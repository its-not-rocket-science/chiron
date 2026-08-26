/**
 * Vendor-agnostic retry/validate core for reasoning-signal
 * classification, mirroring `llmScoringCore.ts`'s shape. A provider
 * only needs to supply a `CreateMessageFn` and a model id.
 *
 * Two validation passes beyond plain schema shape, both required by
 * `prompts.txt` Prompt 23 and both treated as retry-worthy failures,
 * exactly like a malformed JSON response:
 *   1. every returned `signal` must be one of the caller-supplied
 *      `candidateSignals` — "classifier cannot invent new signals."
 *   2. every `present: true` classification's `evidenceQuote` must be
 *      found, verbatim (modulo whitespace/case), in the student's own
 *      `freeText` — "evidence quote must be copied from learner text."
 *
 * Unlike `llmScoringCore.ts` (which throws `ScoringError` on total
 * failure), this deliberately never throws: after exhausting retries it
 * resolves to an empty classification list — Prompt 23's "deterministic
 * safe fallback if unavailable." A failed classification pass should
 * degrade a student's attempt toward "no signals detected" (which
 * `computeOutcome` already handles as ordinary non-credit), not crash
 * the whole practice session.
 */
import { MissingEnvError } from '$lib/server/envErrors';
import type { SignalClassification } from '$lib/domain/practiceSchemas';
import {
	buildSystemPrompt,
	buildUserMessage,
	parseModelJson,
	RawClassifierOutputSchema,
	type ClassifierPromptInput,
	type RawClassifierOutput
} from './classifierPrompt';

const MAX_ATTEMPTS = 2;

export interface CreateMessageParams {
	model: string;
	system: string;
	userMessage: string;
}

export type CreateMessageFn = (params: CreateMessageParams) => Promise<string>;

export async function classifySignalsWithLLM(
	modelId: string,
	createMessage: CreateMessageFn,
	input: ClassifierPromptInput
): Promise<SignalClassification[]> {
	const system = buildSystemPrompt(input.candidateSignals);
	const userMessage = buildUserMessage(input);

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const responseText = await createMessage({ model: modelId, system, userMessage });
			const parsed = parseModelJson(responseText);
			const raw = RawClassifierOutputSchema.parse(parsed);
			return validateAgainstCandidatesAndText(raw, input);
		} catch (err) {
			// A missing API key is a setup problem, not the model producing a
			// bad result — let it propagate immediately rather than retrying
			// or silently falling back, so misconfiguration is visible.
			if (err instanceof MissingEnvError) throw err;
			if (attempt === MAX_ATTEMPTS) {
				const safeSummary =
					err instanceof Error ? `${err.name}: ${err.message}` : 'non-Error thrown';
				console.error(
					'Reasoning-signal classification failed, falling back to no signals:',
					safeSummary
				);
			}
		}
	}

	return [];
}

/**
 * Throws (caught by the retry loop above, same as a schema-parse
 * failure) if any classification names a signal outside
 * `candidateSignals`, or claims `present: true` with an `evidenceQuote`
 * that isn't actually found in the student's own text.
 */
function validateAgainstCandidatesAndText(
	raw: RawClassifierOutput,
	input: ClassifierPromptInput
): SignalClassification[] {
	const allowed = new Set(input.candidateSignals);
	const normalizedText = normalize(input.freeText);

	return raw.classifications.map((c) => {
		if (!allowed.has(c.signal)) {
			throw new Error(`classifier returned a signal outside the candidate set: ${c.signal}`);
		}
		if (c.present && !normalizedText.includes(normalize(c.evidenceQuote))) {
			throw new Error(`evidenceQuote for "${c.signal}" was not found in the student's own text`);
		}
		return c;
	});
}

function normalize(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}
