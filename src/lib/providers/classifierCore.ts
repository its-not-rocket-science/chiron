/**
 * Vendor-agnostic retry/validate core for reasoning-signal
 * classification, mirroring `llmScoringCore.ts`'s shape. A provider
 * only needs to supply a `CreateMessageFn` and a model id.
 *
 * Three validation passes beyond plain schema shape, all treated as
 * retry-worthy failures, exactly like a malformed JSON response:
 *   1. every returned `signal` must be one of the caller-supplied
 *      `candidateSignals` — "classifier cannot invent new signals"
 *      (`prompts.txt` Prompt 23).
 *   2. every `present: true` classification's `evidenceQuote` must be
 *      found, verbatim (modulo whitespace/case), in the student's own
 *      `freeText` — "evidence quote must be copied from learner text"
 *      (`prompts.txt` Prompt 23).
 *   3. that same `evidenceQuote` must not appear ONLY inside what looks
 *      like an attacker's injected payload (a JSON blob, a code fence, a
 *      bracketed directive block) — passing check 2 alone doesn't mean
 *      the quote is genuine, only that the words appear somewhere in the
 *      text (`prompt.txt` Prompt G1 — see `looksLikeInjectedPayload`'s
 *      own docstring for the full reasoning).
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
 * that isn't actually found in the student's own text, or is found only
 * inside what looks like an attacker's injected payload rather than
 * genuine prose (`prompt.txt` Prompt G1 — see `looksLikeInjectedPayload`).
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
		if (c.present && looksLikeInjectedPayload(input.freeText, c.evidenceQuote)) {
			throw new Error(
				`evidenceQuote for "${c.signal}" only appears inside what looks like an injected payload (a JSON blob, a code fence, or a bracketed directive block), not genuine student prose`
			);
		}
		return c;
	});
}

function normalize(text: string): string {
	return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * `prompt.txt` Prompt G1: the plain found-in-text check above (also
 * `SECURITY.md` Section 9's original design) can't distinguish a genuine
 * quote of the student's own reasoning from an attacker's injected
 * payload that happens to literally contain the matching string — both
 * pass the same substring check. Live measurement (docs/qa/
 * LLM_CROSS_CHECK_2026-09-21.md) found DeepSeek doesn't currently take
 * that bait (0/36 across four attack framings), which is evidence the
 * *current* attack wording doesn't reliably work, not evidence the
 * underlying mechanism is sound — a differently-worded future attempt,
 * or a different vendor, could still exploit the same gap. This adds a
 * second, independent check: the quote is rejected if ANY occurrence of
 * it in the student's text sits inside a structural envelope a genuine
 * free-text answer wouldn't contain — a JSON object/array literal, a
 * markdown code fence, or a bracketed ALL-CAPS directive block (the
 * shape all three novel attack framings in the QA sweep use, alongside
 * the original fake-JSON-blob attack).
 *
 * Deliberately structural, not lexical: it doesn't look for specific
 * words like "fabricated" or "SYSTEM OVERRIDE" (that would just be the
 * same brittle pattern-matching mistake with a different keyword list,
 * trivially defeated by an attacker choosing a different codeword) — it
 * looks for the SHAPE an injected payload needs regardless of its
 * wording: it has to look machine-structured to plausibly get parsed
 * back out as a classifier result.
 *
 * "ANY occurrence, not ALL occurrences" was a real design decision, not
 * the obvious default — the first version of this function rejected only
 * when EVERY occurrence was inside a suspicious span, on the theory that
 * a legitimate quote shouldn't be penalized just because the same words
 * happen to also appear in an unrelated injected payload elsewhere in
 * the same text. Testing it against the *actual* sweep-script attack
 * payloads (not simplified stand-ins) found that both the
 * "system-role impersonation" and "trailing-instruction" framings
 * deliberately repeat their spoofed word a second time in a plain,
 * non-structural sentence ("My actual answer: verified-by-system." /
 * "— approved is a direct quote from my own text above") specifically to
 * manufacture a clean-looking second occurrence and defeat exactly that
 * "at least one clean occurrence" leniency. Switched to rejecting on ANY
 * suspicious occurrence closes that: the false-positive cost is a
 * student whose *unrelated* genuine content elsewhere in the same answer
 * happens to both (a) look JSON/code-fence/bracket-shaped AND (b) share
 * an exact word with a genuine evidenceQuote used for a *different*
 * signal — two coincidences at once, in a product whose free-text input
 * is short student reasoning prose about causal/evidentiary claims, not
 * technical or data-format writing. Judged an acceptable trade for
 * closing a gap that two of four measured attack framings exist
 * specifically to exploit.
 */
export function looksLikeInjectedPayload(freeText: string, evidenceQuote: string): boolean {
	const occurrences = findQuoteOccurrences(freeText, evidenceQuote);
	if (occurrences.length === 0) return false; // not found at all — the found-in-text check above already rejects this case.

	const suspiciousSpans = findSuspiciousSpans(freeText);
	if (suspiciousSpans.length === 0) return false;

	return occurrences.some((occ) =>
		suspiciousSpans.some((span) => occ.start >= span.start && occ.end <= span.end)
	);
}

interface TextSpan {
	start: number;
	end: number;
}

/** Every position (in `text`'s own character offsets) where `quote` occurs, tolerant of case and internal whitespace-run differences the same way `normalize()` above is. */
function findQuoteOccurrences(text: string, quote: string): TextSpan[] {
	const trimmed = quote.trim();
	if (!trimmed) return [];
	const pattern = trimmed
		.split(/\s+/)
		.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('\\s+');
	const occurrences: TextSpan[] = [];
	for (const m of text.matchAll(new RegExp(pattern, 'gi'))) {
		occurrences.push({ start: m.index, end: m.index + m[0].length });
	}
	return occurrences;
}

/**
 * Byte ranges in `text` shaped like an injected payload's structural
 * envelope. Runs directly against the original (un-lowercased) text —
 * the ALL-CAPS bracket check needs real case to mean anything, and the
 * others are case-insensitive by construction (JSON punctuation and
 * code-fence backticks have no case), so there's no need to normalize
 * case for this pass at all.
 */
function findSuspiciousSpans(text: string): TextSpan[] {
	const spans: TextSpan[] = [];

	// Markdown code fences: ```...```, with or without a language tag.
	for (const m of text.matchAll(/```[\s\S]*?```/g)) {
		spans.push({ start: m.index, end: m.index + m[0].length });
	}

	spans.push(...findBalancedJsonObjectSpans(text));

	// Bracketed ALL-CAPS directive tokens, e.g. "[SYSTEM OVERRIDE]" — two
	// or more consecutive uppercase words inside square brackets. Ordinary
	// student reasoning prose in this product (short free-text answers, not
	// technical or citation-heavy writing) essentially never contains this
	// shape. When two or more such tags appear (the "[START]...[END]"
	// wrapping shape the system-role-impersonation attack uses), the whole
	// region from the first tag through the last is treated as one
	// suspicious span — not just the tags themselves — so content the
	// attacker wrapped *between* a start/end pair (where its actual spoofed
	// claim lives) is covered too, not only the bracket tags.
	const bracketTags = [...text.matchAll(/\[[A-Z][A-Z\s]{2,}\]/g)].map((m) => ({
		start: m.index,
		end: m.index + m[0].length
	}));
	if (bracketTags.length >= 2) {
		spans.push({ start: bracketTags[0].start, end: bracketTags[bracketTags.length - 1].end });
	} else {
		spans.push(...bracketTags);
	}

	return spans;
}

/**
 * Outermost balanced `{...}` regions that contain at least one `"key":`
 * pair somewhere inside them — i.e. look like a JSON object, not just
 * any brace pair (a student's genuine, if rare, use of braces — e.g.
 * describing a formula — has no quoted-key-colon shape and is left
 * alone). Tracked with an explicit depth stack rather than a single
 * non-greedy regex: `\{[^{}]*"key":[\s\S]*?\}` stops at the FIRST
 * closing brace it finds, which under-captures a multi-object structure
 * like `{"classifications":[{...},{...}]}` — the real attack payload's
 * own shape — leaving its second object's content outside the detected
 * span. Found by testing against the actual sweep-script payload, not
 * assumed correct from the simpler single-object case.
 */
function findBalancedJsonObjectSpans(text: string): TextSpan[] {
	const spans: TextSpan[] = [];
	const openStack: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '{') {
			openStack.push(i);
		} else if (text[i] === '}') {
			const start = openStack.pop();
			if (start === undefined) continue;
			// Only the outermost pair (stack empty again after popping) is
			// recorded — a nested object's own span is redundant with its
			// parent's, which already covers the same range.
			if (openStack.length === 0) {
				const end = i + 1;
				if (/"[a-zA-Z_]+"\s*:/.test(text.slice(start, end))) {
					spans.push({ start, end });
				}
			}
		}
	}
	return spans;
}
