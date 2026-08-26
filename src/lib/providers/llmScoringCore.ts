/**
 * Vendor-agnostic retry/validate/assign-ids core, shared by every
 * ScoringProvider implementation. A provider only needs to supply a
 * `CreateMessageFn` (send system + user text, get response text back) and
 * a model id — this handles building the prompt, retrying once on
 * malformed/schema-invalid output, and turning validated raw output into a
 * full domain `ScoringResult`.
 */
import { randomUUID } from 'node:crypto';
import { MissingEnvError } from '$lib/server/envErrors';
import { ScoringResultSchema, type ScoringResult } from '$lib/domain/schemas';
import {
	buildSystemPrompt,
	buildUserMessage,
	parseModelJson,
	RawScoringOutputSchema,
	type RawScoringOutput
} from './scoringPrompt';
import { ScoringError, type ScoringProviderInput } from './ScoringProvider';

const MAX_ATTEMPTS = 2;

export interface CreateMessageParams {
	model: string;
	system: string;
	userMessage: string;
}

/** The minimal surface a scoring provider needs — swappable in tests without touching any vendor SDK. */
export type CreateMessageFn = (params: CreateMessageParams) => Promise<string>;

export async function scoreWithLLM(
	modelId: string,
	createMessage: CreateMessageFn,
	input: ScoringProviderInput
): Promise<ScoringResult> {
	const system = buildSystemPrompt(input.subjectProfile);
	const userMessage = buildUserMessage(input.lessonText);

	const raw = await requestValidatedOutput(modelId, createMessage, system, userMessage);
	return toScoringResult(raw, modelId, input.lessonVersionId);
}

async function requestValidatedOutput(
	modelId: string,
	createMessage: CreateMessageFn,
	system: string,
	userMessage: string
): Promise<RawScoringOutput> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		try {
			const responseText = await createMessage({ model: modelId, system, userMessage });
			const parsed = parseModelJson(responseText);
			return RawScoringOutputSchema.parse(parsed);
		} catch (err) {
			// A missing API key isn't the model producing a bad result — it's a
			// setup problem retrying can't fix. Let it propagate immediately so
			// the route can report it distinctly from a real scoring failure.
			if (err instanceof MissingEnvError) throw err;
			lastError = err;
		}
	}

	throw new ScoringError(
		'Scoring failed — the model did not return a valid result. Please try again.',
		{
			cause: lastError
		}
	);
}

function toScoringResult(
	raw: RawScoringOutput,
	modelId: string,
	lessonVersionId: string
): ScoringResult {
	const scoreId = randomUUID();

	return ScoringResultSchema.parse({
		score: {
			id: scoreId,
			lessonVersionId,
			dialogueScore: raw.dialogueScore,
			dialogueJustification: raw.dialogueJustification,
			authenticityScore: raw.authenticityScore,
			authenticityJustification: raw.authenticityJustification,
			mentoringScore: raw.mentoringScore,
			mentoringJustification: raw.mentoringJustification,
			modelId,
			createdAt: new Date().toISOString()
		},
		skillCoverage: raw.skillCoverage.map((entry) => ({ id: randomUUID(), scoreId, ...entry })),
		suggestions: raw.suggestions.map((s) => ({ id: randomUUID(), scoreId, ...s }))
	});
}
