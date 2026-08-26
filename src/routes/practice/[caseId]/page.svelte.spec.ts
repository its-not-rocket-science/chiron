import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

afterEach(() => {
	vi.unstubAllGlobals();
});

const fixtureCase = {
	id: 'test-case-1',
	title: 'Did the new signage help?',
	subjectProfileId: 'science-lab',
	skillTags: ['inference'],
	dispositionTags: ['approach_to_inquiry'],
	difficulty: 'core',
	responseMode: 'evidence_support_scale',
	scenario: 'A city reports fewer near-misses after new crosswalk signage went up.',
	claim: 'The new signage caused the drop in near-misses.',
	usesUpdateCriterion: false,
	visibility: 'public-template'
};

function jsonResponse(body: unknown) {
	return new Response(JSON.stringify(body), { status: 200 });
}

/** A minimal stand-in for a ScoringEvent — only the fields ReasoningEventList actually reads. */
function scoringEvent(explanation: string, affectedSkills: string[] = ['inference']) {
	return {
		id: crypto.randomUUID(),
		attemptId: 'attempt-1',
		ruleId: null,
		signal: 'identifies_confounder',
		affectedSkills,
		explanation,
		evidenceQuote: 'x',
		stage: 'SCORE_AND_RECORD',
		createdAt: new Date().toISOString()
	};
}

function stubHappyPathFetch() {
	let challengeRoundCount = 0;
	const requestedUrls: string[] = [];

	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init?: RequestInit) => {
			requestedUrls.push(url);
			const body = init?.body ? JSON.parse(init.body as string) : {};

			if (url === '/api/practice/sessions') {
				return jsonResponse({
					sessionId: 'sess-1',
					fsmState: 'PRESENT_SCENARIO',
					case: fixtureCase
				});
			}

			switch (body.type) {
				case 'SUBMIT_INITIAL_JUDGMENT':
					return jsonResponse({
						fsmState: 'ASK_INITIAL_CONFIDENCE',
						revealedEvidenceText: null,
						tutorQuestion: null
					});
				case 'SUBMIT_INITIAL_CONFIDENCE':
					return jsonResponse({
						fsmState: 'AWAIT_CHALLENGE_RESPONSE',
						revealedEvidenceText: null,
						tutorQuestion: 'Why do you believe that?'
					});
				case 'SUBMIT_CHALLENGE_RESPONSE': {
					challengeRoundCount += 1;
					if (challengeRoundCount === 1) {
						return jsonResponse({
							fsmState: 'AWAIT_CHALLENGE_RESPONSE',
							revealedEvidenceText:
								'Near-miss reports fell 15% the same month a nearby school let out early for the summer.',
							tutorQuestion: 'What else changed around the same time?'
						});
					}
					return jsonResponse({
						fsmState: 'ASK_REVISED_JUDGMENT',
						revealedEvidenceText: null,
						tutorQuestion: null
					});
				}
				case 'SUBMIT_REVISED_JUDGMENT':
					return jsonResponse({
						fsmState: 'ASK_REVISED_CONFIDENCE',
						revealedEvidenceText: null,
						tutorQuestion: null
					});
				case 'SUBMIT_REVISED_CONFIDENCE':
					return jsonResponse({
						fsmState: 'ASK_REFLECTION',
						revealedEvidenceText: null,
						tutorQuestion: null
					});
				case 'SUBMIT_REFLECTION':
					return jsonResponse({
						fsmState: 'DISPOSITION_SELF_CHECK',
						revealedEvidenceText: null,
						tutorQuestion: null,
						result: {
							outcome: 'correct',
							teachingExplanation:
								'The school letting out early is a real alternative explanation the before/after figure alone cannot rule out.',
							initialJudgment: {
								judgment: 'somewhat_supported',
								confidence: 70,
								reasoning: 'The signage seems like the obvious cause.'
							},
							revisedJudgment: {
								judgment: 'uncertain',
								confidence: 55,
								reasoning: 'The school schedule change is a real confound.'
							},
							scoringEvents: [
								scoringEvent('You identified a plausible alternative explanation for the drop.')
							],
							updateCriterion: null,
							pushFurtherHints: [
								'What is at least one other explanation that could account for this, before settling on the first one?'
							]
						}
					});
				case 'SUBMIT_DISPOSITION_CHECKIN':
					return jsonResponse({
						fsmState: 'COMPLETE',
						revealedEvidenceText: null,
						tutorQuestion: null
					});
				default:
					throw new Error(`Unexpected transition body: ${JSON.stringify(body)}`);
			}
		})
	);

	return { requestedUrls };
}

describe('practice case flow — full happy path', () => {
	it('starts a session, walks the complete FSM, and shows transparent end-of-case feedback', async () => {
		stubHappyPathFetch();

		const screen = await render(Page, {
			data: {
				session: null,
				user: { id: 'user-1', email: 'student@example.com' },
				caseId: fixtureCase.id
			},
			params: { caseId: fixtureCase.id },
			form: null
		});

		// intro
		await expect.element(screen.getByRole('heading', { name: fixtureCase.title })).toBeVisible();
		await screen.getByRole('button', { name: 'Begin the investigation' }).click();

		// scenario
		await expect.element(screen.getByText(fixtureCase.scenario)).toBeVisible();
		await screen.getByRole('button', { name: 'Continue' }).click();

		// claim
		await expect.element(screen.getByText(fixtureCase.claim)).toBeVisible();
		await screen.getByRole('button', { name: 'Give my initial read' }).click();

		// initial judgement
		await expect.element(screen.getByText('Your initial judgement')).toBeVisible();
		await screen.getByText('Somewhat supported').click();
		await screen.getByRole('button', { name: 'Continue' }).click();

		// initial reasoning
		await screen.getByLabelText('Your reasoning').fill('The signage seems like the obvious cause.');
		await screen.getByRole('button', { name: 'Continue' }).click();

		// initial confidence — this call also reveals the tutor's first
		// challenge, no update-criterion mechanic on this case.
		await screen.getByLabelText('Your confidence').fill('70');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByText('Why do you believe that?')).toBeVisible();

		// challenge round 1
		await screen
			.getByLabelText('Your response')
			.fill('I think the signage is what changed things.');
		await screen.getByRole('button', { name: 'Respond' }).click();

		// evidence should now be visible, marked as new
		await expect
			.element(screen.getByText('Near-miss reports fell 15%', { exact: false }))
			.toBeVisible();
		await expect.element(screen.getByText('New')).toBeVisible();
		await expect.element(screen.getByText('What else changed around the same time?')).toBeVisible();

		// challenge round 2 — this response ends the loop
		await screen
			.getByLabelText('Your response')
			.fill('That school schedule change could also explain some of the drop.');
		await screen.getByRole('button', { name: 'Respond' }).click();

		// revised judgement — previous judgement shown for context
		await expect
			.element(screen.getByText('Your initial judgement was', { exact: false }))
			.toBeVisible();
		await screen.getByText('Uncertain').click();
		await screen.getByRole('button', { name: 'Continue' }).click();

		// revised reasoning
		await screen
			.getByLabelText('Your revised reasoning')
			.fill('The school schedule change is a real confound.');
		await screen.getByRole('button', { name: 'Continue' }).click();

		// revised confidence — shows the initial confidence for comparison
		await expect.element(screen.getByText('You started at 70% confident.')).toBeVisible();
		await screen.getByRole('button', { name: 'Continue' }).click();

		// reflection
		await screen
			.getByLabelText('Your reflection')
			.fill('I changed my mind once I saw the school schedule change.');
		await screen.getByRole('button', { name: 'Continue' }).click();

		// disposition check-in
		await expect.element(screen.getByText('One last quick check-in')).toBeVisible();
		await screen.getByRole('button', { name: 'Finish' }).click();

		// transparent end-of-case feedback: reasoning path, evidence that
		// mattered, reasoning events, push-further hints, teaching explanation
		await expect.element(screen.getByText('Case complete')).toBeVisible();
		await expect.element(screen.getByText(/Initial:.*somewhat supported/)).toBeVisible();
		await expect.element(screen.getByText(/Revised:.*uncertain/)).toBeVisible();
		// key stated reasons — the student's own reasoning text, not just the judgement value
		await expect
			.element(screen.getByText('The signage seems like the obvious cause.', { exact: false }))
			.toBeVisible();
		await expect
			.element(screen.getByText('The school schedule change is a real confound.', { exact: false }))
			.toBeVisible();
		// evidence that mattered — only what was actually revealed during the session
		await expect.element(screen.getByText('Evidence that mattered')).toBeVisible();
		await expect
			.element(screen.getByText('Near-miss reports fell 15%', { exact: false }))
			.toBeVisible();
		await expect
			.element(screen.getByText('You identified a plausible alternative explanation for the drop.'))
			.toBeVisible();
		// where you could push further — statically authored, not generic LLM advice
		await expect.element(screen.getByText('Where you could push further')).toBeVisible();
		await expect
			.element(
				screen.getByText(
					'What is at least one other explanation that could account for this, before settling on the first one?'
				)
			)
			.toBeVisible();
		await expect
			.element(
				screen.getByText(
					'The school letting out early is a real alternative explanation the before/after figure alone cannot rule out.'
				)
			)
			.toBeVisible();
		// No red/green pass-fail framing — neutral language only.
		await expect.element(screen.getByText(/aligned with what this case/)).toBeVisible();
	});

	it('shows an error and lets the student retry when starting the session fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: { message: 'Unknown case id.' } }), { status: 400 })
			)
		);

		const screen = await render(Page, {
			data: {
				session: null,
				user: { id: 'user-1', email: 'student@example.com' },
				caseId: 'not-a-real-case'
			},
			params: { caseId: 'not-a-real-case' },
			form: null
		});

		await expect.element(screen.getByRole('alert')).toHaveTextContent('Unknown case id.');
		await expect.element(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
	});
});
