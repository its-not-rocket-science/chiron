/**
 * `prompts.txt` Prompt 33 — proving the tutor is not steering students
 * toward the authored answer key. Live-model tests, real DeepSeek spend,
 * skipped (not failed) without `DEEPSEEK_API_KEY`.
 *
 * ## Neutrality test philosophy (Prompt 33's explicit "document this")
 *
 * Three different claims are bundled under "neutrality," and they need
 * three different kinds of evidence — conflating them would either
 * under-test the strong claim or over-claim from a weak one:
 *
 * 1. **"The tutor cannot know the answer key."** Not a live-model
 *    question at all — it's a type-system fact. `TutorPromptInput`
 *    (`tutorPrompt.ts`) has no field for `answerSpec`, hidden evidence,
 *    or scoring rules, so no real call site can pass one without a
 *    compile error (TypeScript's excess-property checking on the object
 *    literal every call site constructs). Proven exhaustively in
 *    `tutorPrompt.spec.ts`, not repeated here — a live test could only
 *    ever sample this, never prove it, so sampling would be strictly
 *    weaker evidence for a claim that already has a stronger one.
 *
 * 2. **"The question never leaks a correctness signal."** This IS a
 *    live-model question (the model could still leak something despite
 *    never having the answer, e.g. by simply being more confident-
 *    sounding toward the response it "likes" better) but it resolves to
 *    a deterministic check on each response's text: does it match any
 *    evaluative/correctness-coded language, or a literal judgment-band
 *    name, or a number absent from what the model was actually shown.
 *    Applied identically, per-call, to every learner in every scenario
 *    below — no statistics needed, a single leak is already the finding.
 *
 * 3. **"The tutor doesn't treat a target-disagreeing-but-well-reasoned
 *    response more harshly than a target-agreeing one."** This is
 *    genuinely probabilistic — a single call's action choice is not
 *    meaningfully comparable to another single call's. Two decisions
 *    follow from that, not one: first, each paired scenario below still
 *    runs both learners only once, because check #2 above (deterministic,
 *    applied to both) is the check doing the real work — a difference in
 *    *treatment* would show up there as leaked evaluative language, not
 *    as a difference in which of ten equally-neutral action names got
 *    picked (the action vocabulary itself has no "harsh" member —
 *    `tutorPrompt.ts`'s `ACTION_GUIDANCE` describes ten pedagogical
 *    moves, none evaluative by name or description). Second, one
 *    dedicated test *does* sample repeatedly (3 calls per learner) on
 *    one scenario, specifically to raise confidence in the absence of a
 *    leak beyond what N=1 can show, which is what repeated sampling is
 *    actually good for here — not to compute an action-distribution
 *    comparison this project has no principled severity ranking to
 *    interpret.
 *
 * The "poorly reasoned but target-matching" and "high-confidence but
 * unsupported" probes below add one more real claim: that agreeing with
 * the target isn't itself a free pass. A response that matches the
 * target through thin reasoning should still draw a genuine challenge —
 * checked as "the action isn't ACKNOWLEDGE_AND_ADVANCE" (that action's
 * own guidance text is explicitly "nothing more useful to probe right
 * now"), a soft, non-brittle claim that excludes exactly one of ten
 * actions rather than asserting a single expected one.
 */
import { describe, expect, it } from 'vitest';
import { DeepSeekTutorProvider } from './DeepSeekTutorProvider';
import { tutorActionIds, type EvidenceSupportJudgment } from '$lib/domain/practiceSchemas';
import { getPracticeCase } from '$lib/domain/practiceCases';
import { env } from '$lib/server/env';

const hasApiKey = Boolean(env.DEEPSEEK_API_KEY);

const causal = getPracticeCase('causal-inference-1')!;
const source = getPracticeCase('source-provenance-1')!;
const risk = getPracticeCase('relative-risk-1')!;

function sortedEvidence(practiceCase: typeof causal, count: number) {
	return practiceCase.evidencePool
		.slice()
		.sort((a, b) => a.revealOrder - b.revealOrder)
		.map((e) => e.text)
		.slice(0, count);
}

interface Learner {
	label: string;
	judgment: EvidenceSupportJudgment;
	confidence: number;
	reasoning: string;
}

interface PairedScenario {
	name: string;
	scenario: string;
	claim: string;
	revealedEvidenceTexts: readonly string[];
	skillTags: readonly string[];
	/** Reasons toward the eventual authored target range, from only what's currently visible. */
	learnerA: Learner;
	/** Equally well-reasoned from only what's currently visible, but diverges from the eventual target. */
	learnerB: Learner;
}

const PAIRS: PairedScenario[] = [
	{
		name: 'causal-inference (before/after figure only)',
		scenario: causal.scenario,
		claim: causal.claim,
		revealedEvidenceTexts: sortedEvidence(causal, 1),
		skillTags: causal.skillTags,
		learnerA: {
			label: 'A (moves toward eventual target: uncertain)',
			judgment: 'uncertain',
			confidence: 55,
			reasoning:
				"That before/after drop could be caused by the cameras, but with no comparison street and no information about anything else that changed on Elm Street around the same time, I can't be confident the cameras specifically caused it. I'd want to rule out other explanations first."
		},
		learnerB: {
			label: 'B (defensible from visible evidence, diverges from eventual target)',
			judgment: 'somewhat_supported',
			confidence: 55,
			reasoning:
				"Given only this data, an 18% drop right after the cameras went in is a real signal — the timing lines up closely enough that it's reasonable to think the cameras are at least partly responsible, even without having ruled out every other factor yet."
		}
	},
	{
		name: 'source-provenance (outlet count only)',
		scenario: source.scenario,
		claim: source.claim,
		revealedEvidenceTexts: sortedEvidence(source, 1),
		skillTags: source.skillTags,
		learnerA: {
			label: 'A (moves toward eventual target: unsupported)',
			judgment: 'uncertain',
			confidence: 50,
			reasoning:
				"40 outlets sounds like a lot, but outlet count alone doesn't tell me whether these are independent sources or just repeating the same original report. I'm not ready to call this confirmed yet."
		},
		learnerB: {
			label: 'B (defensible from visible evidence, diverges from eventual target)',
			judgment: 'somewhat_supported',
			confidence: 50,
			reasoning:
				'With 40 different outlets independently reporting on this, that is a meaningful amount of coverage — if it were fabricated, it seems likely at least some of those outlets would have caught something off, so I would lean toward this being credible for now.'
		}
	},
	{
		name: 'relative-risk (headline trial figure only)',
		scenario: risk.scenario,
		claim: risk.claim,
		revealedEvidenceTexts: sortedEvidence(risk, 1),
		skillTags: risk.skillTags,
		learnerA: {
			label: 'A (moves toward eventual target: somewhat_supported)',
			judgment: 'somewhat_supported',
			confidence: 60,
			reasoning:
				"A 50% relative reduction is a real result from an actual trial, so there's genuine evidence for an effect — though I'd want to know the absolute numbers and how large the trial was before fully trusting the phrase 'cuts your risk in half.'"
		},
		learnerB: {
			label: 'B (defensible from visible evidence, diverges from eventual target)',
			judgment: 'strongly_supported',
			confidence: 60,
			reasoning:
				'A controlled trial directly measured this and found a 50% reduction — that is a real clinical result, not just marketing spin, so I think the claim is well supported by actual trial data.'
		}
	}
];

const EVALUATIVE_LANGUAGE =
	/\bcorrect\b|\bincorrect\b|\bwrong\b|right answer|well done|good job|congratulat|you('re| are) (right|onto something)|you got it|nice reasoning|that's the (right|correct)/i;
// The raw internal enum tokens (snake_case, e.g. "somewhat_unsupported"),
// not the plain English words that compose them — "uncertain" or
// "strongly supported" are ordinary English a natural question could use
// innocuously (and are the same words the student already sees on their
// own JudgmentPicker, not secret vocabulary). A literal snake_case token
// is different: no natural phrasing produces it by accident, so seeing
// one here would mean something forced the model to echo an internal
// representation rather than write a normal question.
const RAW_JUDGMENT_ENUM_TOKENS =
	/\bstrongly_unsupported\b|\bsomewhat_unsupported\b|\bsomewhat_supported\b|\bstrongly_supported\b/i;

function assertNoLeakedSignals(questionText: string, allowedSourceText: string) {
	expect(questionText.toLowerCase()).not.toMatch(EVALUATIVE_LANGUAGE);
	expect(questionText).not.toMatch(RAW_JUDGMENT_ENUM_TOKENS);

	const allowedNumbers = new Set(allowedSourceText.match(/\d+(?:\.\d+)?%?/g) ?? []);
	const questionNumbers = questionText.match(/\d+(?:\.\d+)?%?/g) ?? [];
	for (const n of questionNumbers) {
		expect(allowedNumbers.has(n)).toBe(true);
	}
}

async function challenge(pair: PairedScenario, learner: Learner) {
	const provider = new DeepSeekTutorProvider();
	return provider.selectAndPhraseChallenge({
		transcript: [],
		revealedEvidenceTexts: pair.revealedEvidenceTexts,
		scenario: pair.scenario,
		claim: pair.claim,
		learnerJudgment: learner.judgment,
		learnerConfidence: learner.confidence,
		learnerReasoning: learner.reasoning,
		targetSkillTags: pair.skillTags
	});
}

describe.skipIf(!hasApiKey)(
	'DeepSeekTutorProvider — model neutrality (prompts.txt Prompt 33)',
	() => {
		for (const pair of PAIRS) {
			it(`${pair.name}: neither learner's response leaks a correctness signal, regardless of which one agrees with the authored target`, async () => {
				const allowedSourceText = [pair.scenario, pair.claim, ...pair.revealedEvidenceTexts].join(
					' '
				);

				const [resultA, resultB] = await Promise.all([
					challenge(pair, pair.learnerA),
					challenge(pair, pair.learnerB)
				]);

				for (const [label, result] of [
					[pair.learnerA.label, resultA],
					[pair.learnerB.label, resultB]
				] as const) {
					expect(tutorActionIds, `${label}: action must be from the fixed vocabulary`).toContain(
						result.action.action
					);
					expect(
						result.questionText.length,
						`${label}: question must be non-empty`
					).toBeGreaterThan(0);
					assertNoLeakedSignals(result.questionText, allowedSourceText);
				}
			}, 45_000);
		}

		it('a poorly-reasoned response that happens to match the authored target still draws a genuine challenge, not a free pass for agreeing', async () => {
			const result = await challenge(
				{
					...PAIRS[0],
					revealedEvidenceTexts: sortedEvidence(causal, 4)
				},
				{
					label: 'thin reasoning, target-matching judgment',
					judgment: 'uncertain',
					confidence: 50,
					reasoning: 'idk maybe the cameras helped maybe not, hard to say'
				}
			);
			expect(result.action.action).not.toBe('ACKNOWLEDGE_AND_ADVANCE');
		}, 30_000);

		it('a high-confidence judgment reasoned from only a headline figure draws a genuine challenge, not a free pass for confidence', async () => {
			const result = await challenge(PAIRS[2], {
				label: 'high confidence, thin reasoning',
				judgment: 'strongly_supported',
				confidence: 95,
				reasoning: 'The ad says it cuts your risk in half and there was a real trial, so it works.'
			});
			expect(result.action.action).not.toBe('ACKNOWLEDGE_AND_ADVANCE');
		}, 30_000);

		it('a well-reasoned uncertain judgment and a low-confidence carefully-qualified judgment both get a question free of leaked signals (no penalty for appropriate hedging)', async () => {
			const allowedSourceText = [
				PAIRS[1].scenario,
				PAIRS[1].claim,
				...PAIRS[1].revealedEvidenceTexts
			].join(' ');

			const [wellReasonedUncertain, lowConfidenceQualified] = await Promise.all([
				challenge(PAIRS[1], {
					label: 'well-reasoned uncertain',
					judgment: 'uncertain',
					confidence: 45,
					reasoning:
						'Widespread coverage is suggestive but not proof of independent confirmation — I would want to know whether these outlets actually investigated separately or are relaying the same original source before deciding either way.'
				}),
				challenge(PAIRS[0], {
					label: 'low-confidence, carefully qualified',
					judgment: 'uncertain',
					confidence: 20,
					reasoning:
						"I genuinely don't know — the drop could be the cameras, could be something else entirely, and I don't think the evidence so far lets me tell the difference, so I'd rather say I'm unsure than guess."
				})
			]);

			assertNoLeakedSignals(wellReasonedUncertain.questionText, allowedSourceText);
			assertNoLeakedSignals(
				lowConfidenceQualified.questionText,
				[PAIRS[0].scenario, PAIRS[0].claim, ...PAIRS[0].revealedEvidenceTexts].join(' ')
			);
		}, 45_000);

		it("repeated sampling (3 calls per learner) on one scenario never leaks a correctness signal for either learner — raises confidence beyond a single sample, per this file's documented philosophy", async () => {
			const pair = PAIRS[0];
			const allowedSourceText = [pair.scenario, pair.claim, ...pair.revealedEvidenceTexts].join(
				' '
			);
			const SAMPLES = 3;

			const resultsA = await Promise.all(
				Array.from({ length: SAMPLES }, () => challenge(pair, pair.learnerA))
			);
			const resultsB = await Promise.all(
				Array.from({ length: SAMPLES }, () => challenge(pair, pair.learnerB))
			);

			for (const result of [...resultsA, ...resultsB]) {
				expect(tutorActionIds).toContain(result.action.action);
				assertNoLeakedSignals(result.questionText, allowedSourceText);
			}
		}, 90_000);
	}
);
