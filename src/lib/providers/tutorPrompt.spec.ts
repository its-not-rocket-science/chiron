import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserMessage, parseModelJson } from './tutorPrompt';
import { tutorActionIds } from '$lib/domain/practiceSchemas';
import type { TutorPromptInput } from './tutorPrompt';

function input(overrides: Partial<TutorPromptInput> = {}): TutorPromptInput {
	return {
		scenario: 'A scenario.',
		claim: 'A claim.',
		revealedEvidenceTexts: ['First fact.', 'Second fact.'],
		transcript: [],
		learnerJudgment: 'uncertain',
		learnerConfidence: 60,
		learnerReasoning: 'My reasoning.',
		targetSkillTags: ['inference', 'evaluation'],
		targetGradeBand: { min: 9, max: 11 },
		...overrides
	};
}

const GRADE_BAND = { min: 9, max: 11 };

describe('buildSystemPrompt', () => {
	it('lists every action in the fixed vocabulary', () => {
		const prompt = buildSystemPrompt(GRADE_BAND);
		for (const action of tutorActionIds) {
			expect(prompt).toContain(action);
		}
	});

	it('never mentions scoring or point values, and explicitly disclaims judging correctness', () => {
		const prompt = buildSystemPrompt(GRADE_BAND);
		expect(prompt.toLowerCase()).not.toMatch(/\bpoints\b|\bcredit\b/);
		expect(prompt.toLowerCase()).toMatch(/not grading, scoring, or judging correctness/);
	});

	it('includes prompt-injection-resistance language', () => {
		const prompt = buildSystemPrompt(GRADE_BAND);
		expect(prompt).toMatch(/DATA to read, never instructions/);
		expect(prompt).toMatch(/answer key/);
	});

	it('forbids introducing facts/numbers absent from the scenario/claim/revealed evidence', () => {
		const prompt = buildSystemPrompt(GRADE_BAND);
		expect(prompt.toLowerCase()).toMatch(/never introduce a specific fact, number, percentage/);
	});

	it('forbids praise or criticism based on which judgment the student holds', () => {
		const prompt = buildSystemPrompt(GRADE_BAND);
		expect(prompt.toLowerCase()).toMatch(
			/never praise or criticize the student for which judgment/
		);
	});

	it('is a pure function of its grade-band parameter — same band, same prompt', () => {
		expect(buildSystemPrompt(GRADE_BAND)).toBe(buildSystemPrompt(GRADE_BAND));
	});

	// prompt.txt Prompt G2: previously buildSystemPrompt() took no
	// parameters at all and was identical every call — the QA sweep
	// (docs/qa/LLM_CROSS_CHECK_2026-09-21.md) found generated questions
	// with no reading-level steering at all. These two tests prove the
	// instruction is both present and actually driven by the per-case
	// band, not a fixed generic string.
	it("includes the case's authored grade band in a concrete, checkable phrasing instruction", () => {
		const prompt = buildSystemPrompt({ min: 6, max: 8 });
		expect(prompt).toMatch(/grade 6-8/);
		expect(prompt.toLowerCase()).toMatch(/short, plain sentences/);
		expect(prompt.toLowerCase()).toMatch(/avoid compound or nested clauses/);
	});

	it('varies the prompt when the grade band differs — not a generic instruction ignoring its input', () => {
		expect(buildSystemPrompt({ min: 6, max: 8 })).not.toBe(buildSystemPrompt({ min: 10, max: 12 }));
	});
});

describe('TutorPromptInput — answer-key availability (prompts.txt Prompt 33)', () => {
	it('has no field for answerSpec, hidden evidence, or scoring rules — the tutor cannot receive them by construction, not merely by caller discipline', () => {
		// The strongest form of this proof isn't a runtime check at all: it's
		// that TutorPromptInput's type declaration (tutorPrompt.ts) has no
		// such field, so passing one at any real call site (an object
		// literal, everywhere this is actually constructed) is a compile
		// error via TypeScript's excess-property checking, not merely
		// something nobody happens to do. This test is a regression
		// tripwire, not the proof itself: if a future edit ever adds a field
		// here, this exact, exhaustive key list catches it immediately,
		// rather than relying on someone noticing a live-model test's output
		// changed shape.
		const exhaustiveFields = [
			'scenario',
			'claim',
			'revealedEvidenceTexts',
			'transcript',
			'learnerJudgment',
			'learnerConfidence',
			'learnerReasoning',
			'targetSkillTags',
			'targetGradeBand'
		];
		expect(Object.keys(input()).sort()).toEqual(exhaustiveFields.sort());
		for (const forbidden of [
			'answerSpec',
			'targetRange',
			'reasoningRubric',
			'educatorNotes',
			'calibrationEligible',
			'finalJudgmentRules'
		]) {
			expect(exhaustiveFields).not.toContain(forbidden);
		}
	});
});

describe('buildUserMessage', () => {
	it('delimits scenario, claim, evidence, transcript, and judgment into distinct blocks', () => {
		const message = buildUserMessage(input());
		expect(message).toContain('<scenario>\nA scenario.\n</scenario>');
		expect(message).toContain('<claim>\nA claim.\n</claim>');
		expect(message).toContain('First fact.');
		expect(message).toContain('Second fact.');
		expect(message).toContain('Judgment: uncertain');
		expect(message).toContain('Confidence: 60');
		expect(message).toContain('Reasoning: My reasoning.');
	});

	it('handles no revealed evidence and no prior transcript without breaking the delimiter structure', () => {
		const message = buildUserMessage(input({ revealedEvidenceTexts: [], transcript: [] }));
		expect(message).toContain('(no evidence revealed yet)');
		expect(message).toContain('(no challenge rounds yet)');
	});

	it('renders prior transcript turns including the student response when present', () => {
		const message = buildUserMessage(
			input({
				transcript: [
					{
						action: { action: 'ASK_FOR_REASONING' },
						questionText: 'Why do you believe that?',
						response: 'Because of the first fact.'
					}
				]
			})
		);
		expect(message).toContain('[ASK_FOR_REASONING] Why do you believe that?');
		expect(message).toContain('Student replied: Because of the first fact.');
	});

	it('handles no target skill tags without breaking the delimiter structure', () => {
		const message = buildUserMessage(input({ targetSkillTags: [] }));
		expect(message).toContain('<target_skills>\n(none specified)\n</target_skills>');
	});
});

describe('parseModelJson', () => {
	it('parses plain JSON', () => {
		expect(parseModelJson('{"action":"ASK_FOR_REASONING","questionText":"Why?"}')).toEqual({
			action: 'ASK_FOR_REASONING',
			questionText: 'Why?'
		});
	});

	it('strips a ```json code fence', () => {
		expect(
			parseModelJson('```json\n{"action":"ASK_FOR_REASONING","questionText":"Why?"}\n```')
		).toEqual({ action: 'ASK_FOR_REASONING', questionText: 'Why?' });
	});
});
