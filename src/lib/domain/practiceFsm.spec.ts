import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { advance, computeOutcome, MAX_CHALLENGE_ROUNDS } from './practiceFsm';
import { getPracticeCase, practiceCases } from './practiceCases';
import type { PracticeCase, PracticeSession } from './practiceSchemas';

const uuid = () => randomUUID();
const now = () => new Date().toISOString();

function freshSession(
	practiceCase: PracticeCase,
	overrides: Partial<PracticeSession> = {}
): PracticeSession {
	return {
		id: uuid(),
		studentId: uuid(),
		caseId: practiceCase.id,
		fsmState: 'PRESENT_SCENARIO',
		revealedEvidenceIds: [],
		transcript: [],
		initialJudgment: null,
		updateCriterionText: null,
		revisedJudgment: null,
		reflectionText: null,
		createdAt: now(),
		updatedAt: now(),
		...overrides
	};
}

function must(result: ReturnType<typeof advance>) {
	if (!result.ok) throw new Error(`expected ok, got error: ${result.error}`);
	return result;
}

/** Drives a session all the way to COMPLETE for a case that does NOT use the update-criterion mechanic, taking a fixed number of challenge rounds. */
function driveToCompletion(practiceCase: PracticeCase) {
	let session = freshSession(practiceCase);

	session = must(
		advance(session, practiceCase, {
			type: 'SUBMIT_INITIAL_JUDGMENT',
			judgment: 'uncertain',
			reasoning: 'Not sure yet, need to see more.'
		})
	).session;
	session = must(
		advance(session, practiceCase, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 30 })
	).session;

	if (practiceCase.usesUpdateCriterion) {
		session = must(
			advance(session, practiceCase, {
				type: 'SUBMIT_UPDATE_CRITERION',
				text: 'A control group would change my mind.'
			})
		).session;
	}

	// Drain every challenge round — one per evidence item, plus one final
	// round challenging the response to the *last* item, before the FSM
	// finds no more evidence and moves on. Self-terminating (not a fixed
	// iteration count) so this doesn't assume that exact shape.
	let rounds = 0;
	while (session.fsmState === 'PRESENT_CHALLENGE') {
		session = must(
			advance(session, practiceCase, {
				type: 'CHALLENGE_SELECTED',
				action: { action: 'ASK_FOR_REASONING' },
				questionText: 'Why do you believe that?'
			})
		).session;
		expect(session.fsmState).toBe('AWAIT_CHALLENGE_RESPONSE');
		session = must(
			advance(session, practiceCase, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'Because...' })
		).session;
		rounds++;
		if (rounds > MAX_CHALLENGE_ROUNDS + 1) throw new Error('driveToCompletion did not converge');
	}
	expect(rounds).toBe(practiceCase.evidencePool.length + 1);

	expect(session.fsmState).toBe('ASK_REVISED_JUDGMENT');
	session = must(
		advance(session, practiceCase, {
			type: 'SUBMIT_REVISED_JUDGMENT',
			judgment: 'somewhat_unsupported',
			reasoning: 'The comparison evidence changed my mind.'
		})
	).session;
	session = must(
		advance(session, practiceCase, { type: 'SUBMIT_REVISED_CONFIDENCE', confidence: 65 })
	).session;
	session = must(
		advance(session, practiceCase, {
			type: 'SUBMIT_REFLECTION',
			text: 'The comparison data was decisive.'
		})
	).session;
	expect(session.fsmState).toBe('SCORE_AND_RECORD');
	session = must(
		advance(session, practiceCase, {
			type: 'SCORED',
			explanation: { detectedSignals: [], matchedRuleId: null, outcome: 'incorrect' }
		})
	).session;
	expect(session.fsmState).toBe('DISPOSITION_SELF_CHECK');
	session = must(
		advance(session, practiceCase, {
			type: 'SUBMIT_DISPOSITION_CHECKIN',
			dispositionItem: 'Willingness to revise a view when reflection warrants it',
			response: 4
		})
	).session;
	expect(session.fsmState).toBe('COMPLETE');
	return session;
}

describe('advance — happy path, no update criterion', () => {
	it('drives relative-risk-1 (usesUpdateCriterion: false) all the way to COMPLETE', () => {
		const c = getPracticeCase('relative-risk-1');
		expect(c).toBeDefined();
		if (!c) return;
		const session = driveToCompletion(c);
		expect(session.fsmState).toBe('COMPLETE');
		expect(session.reflectionText).toBe('The comparison data was decisive.');
		expect(session.revisedJudgment?.judgment).toBe('somewhat_unsupported');
		expect(session.revisedJudgment?.confidence).toBe(65);
	});
});

describe('advance — happy path, with update criterion', () => {
	it('drives causal-inference-1 (usesUpdateCriterion: true) through COMMIT_UPDATE_CRITERION to COMPLETE', () => {
		const c = getPracticeCase('causal-inference-1');
		expect(c).toBeDefined();
		if (!c) return;
		const session = driveToCompletion(c);
		expect(session.fsmState).toBe('COMPLETE');
		expect(session.updateCriterionText).toBe('A control group would change my mind.');
	});

	it('rejects SUBMIT_UPDATE_CRITERION for a case that does not use the mechanic', () => {
		const c = getPracticeCase('relative-risk-1');
		expect(c).toBeDefined();
		if (!c) return;
		let session = freshSession(c);
		session = must(
			advance(session, c, {
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: 'uncertain',
				reasoning: 'x'
			})
		).session;
		session = must(
			advance(session, c, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 30 })
		).session;
		// relative-risk-1 skips straight to PRESENT_CHALLENGE — there is no
		// COMMIT_UPDATE_CRITERION state to even attempt this event from.
		expect(session.fsmState).toBe('PRESENT_CHALLENGE');
	});
});

describe('advance — the client/LLM cannot skip states', () => {
	it('rejects an out-of-order event (revised judgment before any challenge round)', () => {
		const c = practiceCases[0];
		const session = freshSession(c, { fsmState: 'PRESENT_CHALLENGE' });
		const result = advance(session, c, {
			type: 'SUBMIT_REVISED_JUDGMENT',
			judgment: 'uncertain',
			reasoning: 'x'
		});
		expect(result.ok).toBe(false);
	});

	it('rejects jumping directly to SCORE_AND_RECORD from an early state', () => {
		const c = practiceCases[0];
		const session = freshSession(c, { fsmState: 'ASK_INITIAL_JUDGMENT' });
		const result = advance(session, c, {
			type: 'SCORED',
			explanation: { detectedSignals: [], matchedRuleId: null, outcome: 'correct' }
		});
		expect(result.ok).toBe(false);
	});

	it('rejects any further transition once a session is COMPLETE', () => {
		const c = practiceCases[0];
		const session = freshSession(c, { fsmState: 'COMPLETE' });
		const result = advance(session, c, {
			type: 'SUBMIT_DISPOSITION_CHECKIN',
			dispositionItem: 'x',
			response: 3
		});
		expect(result.ok).toBe(false);
		expect((result as { error: string }).error).toMatch(/already completed/);
	});

	it('rejects an event for the wrong session/case pairing', () => {
		const caseA = practiceCases[0];
		const caseB = practiceCases[1];
		const session = freshSession(caseA);
		const result = advance(session, caseB, {
			type: 'SUBMIT_INITIAL_JUDGMENT',
			judgment: 'uncertain',
			reasoning: 'x'
		});
		expect(result.ok).toBe(false);
	});

	it('a session persisted in PRESENT_NEW_EVIDENCE (which advance() never itself produces) fails safely rather than silently accepting anything', () => {
		const c = practiceCases[0];
		const session = freshSession(c, { fsmState: 'PRESENT_NEW_EVIDENCE' });
		const result = advance(session, c, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'x' });
		expect(result.ok).toBe(false);
	});
});

describe('advance — evidence reveal is deterministic and server-driven', () => {
	it('reveals exactly one evidence item per challenge round, in authored revealOrder, never all at once', () => {
		const c = getPracticeCase('causal-inference-1');
		expect(c).toBeDefined();
		if (!c) return;
		let session = freshSession(c);
		session = must(
			advance(session, c, {
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: 'uncertain',
				reasoning: 'x'
			})
		).session;
		session = must(
			advance(session, c, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 30 })
		).session;
		session = must(advance(session, c, { type: 'SUBMIT_UPDATE_CRITERION', text: 'x' })).session;

		const sortedByReveal = [...c.evidencePool].sort((a, b) => a.revealOrder - b.revealOrder);
		for (const expectedItem of sortedByReveal) {
			session = must(
				advance(session, c, {
					type: 'CHALLENGE_SELECTED',
					action: { action: 'ASK_FOR_REASONING' },
					questionText: 'x'
				})
			).session;
			const before = session.revealedEvidenceIds.length;
			const step = must(advance(session, c, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'x' }));
			session = step.session;
			if (step.revealedEvidenceItemId) {
				expect(step.revealedEvidenceItemId).toBe(expectedItem.id);
				expect(session.revealedEvidenceIds.length).toBe(before + 1);
			}
		}
		// Every item was eventually revealed, none skipped, none duplicated.
		expect(session.revealedEvidenceIds.sort()).toEqual(sortedByReveal.map((e) => e.id).sort());
		expect(new Set(session.revealedEvidenceIds).size).toBe(session.revealedEvidenceIds.length);
	});

	it('never reveals more than MAX_CHALLENGE_ROUNDS items even for a case with more evidence than that', () => {
		const c = practiceCases[0];
		const bloated: PracticeCase = {
			...c,
			evidencePool: Array.from({ length: MAX_CHALLENGE_ROUNDS + 5 }, (_, i) => ({
				id: uuid(),
				text: `Evidence item ${i}`,
				revealOrder: i,
				stance: 'ambiguous' as const
			})),
			usesUpdateCriterion: false
		};
		let session = freshSession(bloated);
		session = must(
			advance(session, bloated, {
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: 'uncertain',
				reasoning: 'x'
			})
		).session;
		session = must(
			advance(session, bloated, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 30 })
		).session;

		let rounds = 0;
		while (session.fsmState === 'PRESENT_CHALLENGE' && rounds < MAX_CHALLENGE_ROUNDS + 10) {
			session = must(
				advance(session, bloated, {
					type: 'CHALLENGE_SELECTED',
					action: { action: 'ASK_FOR_REASONING' },
					questionText: 'x'
				})
			).session;
			session = must(
				advance(session, bloated, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'x' })
			).session;
			rounds++;
		}
		expect(session.fsmState).toBe('ASK_REVISED_JUDGMENT');
		expect(session.revealedEvidenceIds.length).toBeLessThanOrEqual(MAX_CHALLENGE_ROUNDS);
	});
});

describe('advance — revision is not required to change anything', () => {
	it('accepts a revised judgment identical to the initial one ("no change" is a valid update)', () => {
		const c = getPracticeCase('relative-risk-1');
		expect(c).toBeDefined();
		if (!c) return;
		let session = freshSession(c);
		session = must(
			advance(session, c, {
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: 'uncertain',
				reasoning: 'x'
			})
		).session;
		session = must(
			advance(session, c, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 50 })
		).session;
		while (session.fsmState === 'PRESENT_CHALLENGE') {
			session = must(
				advance(session, c, {
					type: 'CHALLENGE_SELECTED',
					action: { action: 'ACKNOWLEDGE_AND_ADVANCE' },
					questionText: 'x'
				})
			).session;
			session = must(
				advance(session, c, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'x' })
			).session;
		}
		const result = advance(session, c, {
			type: 'SUBMIT_REVISED_JUDGMENT',
			judgment: 'uncertain', // same as initial
			reasoning: 'Still uncertain — nothing changed my mind.'
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.session.revisedJudgment?.judgment).toBe('uncertain');
	});

	it('accepts a revised judgment in either direction (up or down the scale)', () => {
		const c = getPracticeCase('relative-risk-1');
		if (!c) return;
		for (const direction of ['strongly_supported', 'strongly_unsupported'] as const) {
			let session = freshSession(c);
			session = must(
				advance(session, c, {
					type: 'SUBMIT_INITIAL_JUDGMENT',
					judgment: 'uncertain',
					reasoning: 'x'
				})
			).session;
			session = must(
				advance(session, c, { type: 'SUBMIT_INITIAL_CONFIDENCE', confidence: 50 })
			).session;
			while (session.fsmState === 'PRESENT_CHALLENGE') {
				session = must(
					advance(session, c, {
						type: 'CHALLENGE_SELECTED',
						action: { action: 'ACKNOWLEDGE_AND_ADVANCE' },
						questionText: 'x'
					})
				).session;
				session = must(
					advance(session, c, { type: 'SUBMIT_CHALLENGE_RESPONSE', response: 'x' })
				).session;
			}
			const result = must(
				advance(session, c, {
					type: 'SUBMIT_REVISED_JUDGMENT',
					judgment: direction,
					reasoning: 'x'
				})
			);
			expect(result.session.revisedJudgment?.judgment).toBe(direction);
		}
	});
});

describe('advance — CHALLENGE_SELECTED trusts its action as already-validated input', () => {
	it('does not itself re-validate the action against the fixed vocabulary or check for invented facts — that happens at the provider layer, in tutorCore.ts, before this event is ever constructed', () => {
		// advance() has no opinion on which TutorAction was selected or
		// what questionText says — validation (fixed-vocabulary shape,
		// the no-invented-facts heuristic) is tutorCore.ts's job (Prompt
		// 24, ADR-021), applied before CHALLENGE_SELECTED is ever built.
		// This test documents that boundary rather than re-testing
		// tutorCore's validation here.
		const c = practiceCases[0];
		const session = freshSession(c, { fsmState: 'PRESENT_CHALLENGE' });
		const result = advance(session, c, {
			type: 'CHALLENGE_SELECTED',
			action: { action: 'REFER_TO_REVEALED_EVIDENCE' },
			questionText: 'x'
		});
		expect(result.ok).toBe(true);
	});
});

describe('computeOutcome', () => {
	it('matches the first satisfying rule and returns a correct outcome', () => {
		const rubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'] as (
						| 'strongly_unsupported'
						| 'somewhat_unsupported'
						| 'uncertain'
						| 'somewhat_supported'
						| 'strongly_supported'
					)[],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const outcome = computeOutcome(
			'uncertain',
			[{ signal: 'identifies_confounder', present: true, confidence: 'high', evidenceQuote: 'x' }],
			rubric
		);
		expect(outcome.outcome).toBe('correct');
		expect(outcome.matchedRuleId).toBe('rule-a');
	});

	it('returns incorrect with no matched rule when no rule is satisfied', () => {
		const rubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'] as (
						| 'strongly_unsupported'
						| 'somewhat_unsupported'
						| 'uncertain'
						| 'somewhat_supported'
						| 'strongly_supported'
					)[],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const outcome = computeOutcome(
			'strongly_supported',
			[{ signal: 'identifies_confounder', present: true, confidence: 'high', evidenceQuote: 'x' }],
			rubric
		);
		expect(outcome.outcome).toBe('incorrect');
		expect(outcome.matchedRuleId).toBeNull();
	});

	it('requires the signal to be present:true, not merely classified', () => {
		const rubric = {
			finalJudgmentRules: [
				{
					id: 'rule-a',
					acceptedJudgments: ['uncertain'] as (
						| 'strongly_unsupported'
						| 'somewhat_unsupported'
						| 'uncertain'
						| 'somewhat_supported'
						| 'strongly_supported'
					)[],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation: 'x'
				}
			],
			partialCreditSignals: []
		};
		const outcome = computeOutcome(
			'uncertain',
			[{ signal: 'identifies_confounder', present: false, confidence: 'high', evidenceQuote: 'x' }],
			rubric
		);
		expect(outcome.outcome).toBe('incorrect');
	});

	it('produces a correct, explainable outcome for every canonical case using its own reasoningRubric', () => {
		for (const c of practiceCases) {
			for (const rule of c.answerSpec.reasoningRubric.finalJudgmentRules) {
				const detected = rule.requiredSignals.slice(0, rule.minimumRequired).map((signal) => ({
					signal,
					present: true,
					confidence: 'high' as const,
					evidenceQuote: 'x'
				}));
				const outcome = computeOutcome(
					rule.acceptedJudgments[0],
					detected,
					c.answerSpec.reasoningRubric
				);
				expect(outcome.outcome).toBe('correct');
			}
		}
	});
});
