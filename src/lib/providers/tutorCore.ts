/**
 * Vendor-agnostic retry/validate core for the Socratic tutor, mirroring
 * `classifierCore.ts`'s shape. A provider only needs to supply a
 * `CreateMessageFn` and a model id.
 *
 * One validation pass beyond plain schema shape, treated as a
 * retry-worthy failure exactly like malformed JSON: the returned
 * `questionText` must not introduce a number/percentage that isn't
 * already present in the scenario, claim, or evidence actually revealed
 * to the student (`prompts.txt` Prompt 24's "verify it doesn't introduce
 * specific factual claims absent from the revealed evidence/scenario
 * text" requirement). This is deliberately a narrow, cheap heuristic —
 * numbers are the sharpest, lowest-false-positive signal of an invented
 * fact — not exhaustive NLP; Prompt 24 itself names this as
 * defense-in-depth alongside Prompt 33's adversarial neutrality suite,
 * not the only mechanism.
 *
 * Unlike `classifierCore.ts` (which resolves to an empty array on total
 * failure — a sensible "no signals detected" degradation for scoring),
 * the tutor has no equivalent empty result: `PRESENT_CHALLENGE` always
 * needs a real action and question to keep a session moving. So after
 * exhausting retries this resolves to a fixed, hardcoded, never
 * model-generated fallback question instead of throwing — a third
 * distinct failure-handling shape alongside `llmScoringCore.ts`'s
 * throw-based `ScoringError` and `classifierCore.ts`'s empty-array
 * fallback (see ADR-021). The fallback is safe by construction: it's a
 * fixed string, so it cannot leak anything or invent a fact.
 */
import { MissingEnvError } from '$lib/server/envErrors';
import type { TutorAction } from '$lib/domain/practiceSchemas';
import {
	buildSystemPrompt,
	buildUserMessage,
	parseModelJson,
	RawTutorOutputSchema,
	type TutorPromptInput
} from './tutorPrompt';

const MAX_ATTEMPTS = 2;

export interface CreateMessageParams {
	model: string;
	system: string;
	userMessage: string;
}

export type CreateMessageFn = (params: CreateMessageParams) => Promise<string>;

const FALLBACK_QUESTION: { action: TutorAction; questionText: string } = {
	action: { action: 'ASK_FOR_REASONING' },
	questionText: 'Can you walk me through why you reached that judgment?'
};

const NUMBER_PATTERN = /\d+(?:\.\d+)?%?/g;

export async function selectAndPhraseChallengeWithLLM(
	modelId: string,
	createMessage: CreateMessageFn,
	input: TutorPromptInput
): Promise<{ action: TutorAction; questionText: string }> {
	const system = buildSystemPrompt();
	const userMessage = buildUserMessage(input);
	const allowedSourceText = [input.scenario, input.claim, ...input.revealedEvidenceTexts].join(' ');

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const responseText = await createMessage({ model: modelId, system, userMessage });
			const parsed = parseModelJson(responseText);
			const raw = RawTutorOutputSchema.parse(parsed);
			assertNoInventedNumbers(raw.questionText, allowedSourceText);
			return { action: { action: raw.action }, questionText: raw.questionText };
		} catch (err) {
			// A missing API key is a setup problem, not the model producing a
			// bad result — let it propagate immediately rather than retrying
			// or silently falling back, so misconfiguration is visible.
			if (err instanceof MissingEnvError) throw err;
			if (attempt === MAX_ATTEMPTS) {
				const safeSummary =
					err instanceof Error ? `${err.name}: ${err.message}` : 'non-Error thrown';
				console.error(
					'Tutor challenge selection failed, falling back to a safe generic question:',
					safeSummary
				);
			}
		}
	}

	return FALLBACK_QUESTION;
}

/**
 * Throws (caught by the retry loop above, same as a schema-parse
 * failure) if `questionText` names a number or percentage not found
 * anywhere in the scenario, claim, or evidence actually revealed to the
 * student — a cheap proxy for "the tutor invented a fact."
 */
function assertNoInventedNumbers(questionText: string, allowedSourceText: string): void {
	const allowedNumbers = new Set(allowedSourceText.match(NUMBER_PATTERN) ?? []);
	const questionNumbers = questionText.match(NUMBER_PATTERN) ?? [];
	for (const n of questionNumbers) {
		if (!allowedNumbers.has(n)) {
			throw new Error(
				`tutor question introduced a number not present in the allowed source text: ${n}`
			);
		}
	}
}
