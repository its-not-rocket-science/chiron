/**
 * Live-model test. Hits the real DeepSeek API and costs real money, so
 * it only runs when DEEPSEEK_API_KEY is actually configured — skipped
 * (not failed) otherwise. Run locally with a real key to exercise it:
 *   DEEPSEEK_API_KEY=sk-... npm test
 *
 * `prompt.txt` Prompt G2, point 2's own instruction: phrasing-level
 * steering (tutorPrompt.ts's `buildSystemPrompt`) is a prompt-engineering
 * change, not something the code can hard-enforce, so measure it
 * honestly rather than assume the instruction worked — the same
 * discipline `docs/qa/LLM_CROSS_CHECK_2026-09-21.md` already applied to
 * the injection-resistance gap (Prompt G1). Uses the same
 * `text-readability` Flesch-Kincaid computation as that QA sweep script
 * (`scripts/qa-cross-model-sweep.ts`), on a small live sample per case —
 * 4 questions per case here, not the sweep's 120, since this runs on
 * every CI push rather than as a one-off measurement.
 *
 * Deliberately a *soft* regression flag, not a strict enforcement: the
 * measured mean is always logged (visible in CI output, so a real drift
 * is noticeable even before the guard below trips), but the assertion
 * itself only fails on a large, genuine breakdown — e.g. the phrasing
 * instruction being silently dropped — not routine model-to-model
 * variance around the target band on a 4-question sample.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — text-readability ships no type declarations, same as scripts/qa-cross-model-sweep.ts.
import rs from 'text-readability';
import { DeepSeekTutorProvider } from './DeepSeekTutorProvider';
import { practiceCases } from '$lib/domain/practiceCases';
import { env } from '$lib/server/env';

const hasApiKey = Boolean(env.DEEPSEEK_API_KEY);
const SAMPLE_SIZE = 4;
// Generous slack above the authored band's max — see this file's own
// docstring for why this is a soft flag, not strict enforcement.
const REGRESSION_GUARD_GRADES = 6;

describe.skipIf(!hasApiKey)(
	'Tutor question readability vs authored targetGradeBand (prompt.txt Prompt G2)',
	() => {
		for (const practiceCase of practiceCases) {
			it(`${practiceCase.id}: sampled tutor questions stay within a generous margin of the authored grade ${practiceCase.targetGradeBand.min}-${practiceCase.targetGradeBand.max} band`, async () => {
				const provider = new DeepSeekTutorProvider();
				const revealedEvidenceTexts = practiceCase.evidencePool
					.slice()
					.sort((a, b) => a.revealOrder - b.revealOrder)
					.map((e) => e.text)
					.slice(0, 2);

				const questions: string[] = [];
				for (let i = 0; i < SAMPLE_SIZE; i++) {
					const { questionText } = await provider.selectAndPhraseChallenge({
						transcript: [],
						revealedEvidenceTexts,
						scenario: practiceCase.scenario,
						claim: practiceCase.claim,
						learnerJudgment: 'uncertain',
						learnerConfidence: 55,
						learnerReasoning:
							'I am not fully sure yet, since there could be another explanation for this.',
						targetSkillTags: practiceCase.skillTags,
						targetGradeBand: practiceCase.targetGradeBand
					});
					questions.push(questionText);
				}

				// Same filter as the QA sweep: too short a string for a
				// meaningful sentence-level FK estimate.
				const grades = questions
					.filter((q) => rs.lexiconCount(q, true) >= 4)
					.map((q) => rs.fleschKincaidGrade(q));
				const mean = grades.length > 0 ? grades.reduce((a, b) => a + b, 0) / grades.length : null;

				// Always logged, regardless of whether the assertion below
				// passes — this is the actual "measure it honestly" signal
				// a human (or the next full QA sweep) should look at.
				console.log(
					`[readability] ${practiceCase.id}: target grade ${practiceCase.targetGradeBand.min}-${practiceCase.targetGradeBand.max}, ` +
						`sampled tutor questions mean FK grade = ${mean?.toFixed(1) ?? 'n/a'} (n=${grades.length}/${SAMPLE_SIZE}), ` +
						`individual grades: ${grades.map((g) => g.toFixed(1)).join(', ')}`
				);

				expect(mean).not.toBeNull();
				expect(mean as number).toBeLessThanOrEqual(
					practiceCase.targetGradeBand.max + REGRESSION_GUARD_GRADES
				);
			}, 60_000);
		}
	}
);
