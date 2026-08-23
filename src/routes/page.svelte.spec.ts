import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import { ctSkillIds } from '$lib/domain/taxonomy';

afterEach(() => {
	vi.unstubAllGlobals();
});

// Matches what root +layout.server.ts / +page.server.ts would provide for a
// signed-out visitor — these component tests render the page directly, so
// they supply it by hand rather than going through the real load functions.
const signedOutData = { session: null, user: null, membership: null };

function scoringResultJson(
	overrides: {
		dialogueScore?: number;
		authenticityScore?: number;
		mentoringScore?: number;
		suggestions?: { pillar: string; text: string }[];
	} = {}
) {
	const scoreId = crypto.randomUUID();
	return {
		score: {
			id: scoreId,
			lessonVersionId: crypto.randomUUID(),
			dialogueScore: overrides.dialogueScore ?? 1,
			dialogueJustification: 'Discussion happens but is incidental to the activity.',
			authenticityScore: overrides.authenticityScore ?? 1,
			authenticityJustification: 'A real-world example is mentioned but not worked with directly.',
			mentoringScore: overrides.mentoringScore ?? 0,
			mentoringJustification: 'No individualized feedback is described.',
			modelId: 'claude-sonnet-5',
			createdAt: new Date().toISOString()
		},
		skillCoverage: ctSkillIds.map((skill) => ({
			id: crypto.randomUUID(),
			scoreId,
			skill,
			covered: skill === 'inference',
			confidence: 'medium',
			justification: `Justification for ${skill}, referencing the submitted lesson.`
		})),
		suggestions: (
			overrides.suggestions ?? [
				{ pillar: 'dialogue', text: 'Add a structured small-group discussion.' },
				{ pillar: 'mentoring', text: 'Have the teacher model interpreting one result live.' }
			]
		).map((s) => ({ id: crypto.randomUUID(), scoreId, pillar: s.pillar, text: s.text }))
	};
}

describe('lesson analyzer — input to score to revise loop', () => {
	it('scores a lesson, shows results, and shows a before/after comparison on revise-and-resubmit', async () => {
		const firstResult = scoringResultJson({ dialogueScore: 1, mentoringScore: 0 });
		const secondResult = scoringResultJson({ dialogueScore: 3, mentoringScore: 1 });
		let callCount = 0;

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				callCount += 1;
				const body = callCount === 1 ? firstResult : secondResult;
				return new Response(JSON.stringify(body), { status: 200 });
			})
		);

		const screen = await render(Page, { data: signedOutData, params: {}, form: null });

		await screen.getByLabelText('Lesson plan').fill('Students read silently at their desks.');
		await screen.getByRole('combobox', { name: 'Subject' }).selectOptions('history-essay');
		await screen.getByRole('button', { name: 'Score this lesson' }).click();

		await expect.element(screen.getByText('Results — Version 1')).toBeVisible();
		await expect
			.element(screen.getByText('Discussion happens but is incidental to the activity.'))
			.toBeVisible();
		await expect
			.element(screen.getByText('Add a structured small-group discussion.'))
			.toBeVisible();
		// No prior version yet, so no before/after comparison.
		await expect.element(screen.getByText('Before → After')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Revise & resubmit' }).click();

		// Back on the input form, with the previous text still editable.
		await expect
			.element(screen.getByLabelText('Lesson plan'))
			.toHaveValue('Students read silently at their desks.');
		await screen
			.getByLabelText('Lesson plan')
			.fill('Students debate two conflicting primary sources.');
		await screen.getByRole('button', { name: 'Rescore this lesson' }).click();

		await expect.element(screen.getByText('Results — Version 2')).toBeVisible();
		await expect.element(screen.getByText('Before → After')).toBeVisible();
		// The delta table should show the dialogue pillar moving from 1 to 3.
		await expect.element(screen.getByText('+2')).toBeVisible();

		expect(callCount).toBe(2);
	});

	it('shows a clear error and preserves the form when scoring fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: { message: 'Scoring is temporarily unavailable. Please try again later.' }
						}),
						{
							status: 500
						}
					)
			)
		);

		const screen = await render(Page, { data: signedOutData, params: {}, form: null });

		await screen.getByLabelText('Lesson plan').fill('A lesson about erosion.');
		await screen.getByRole('button', { name: 'Score this lesson' }).click();

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Scoring is temporarily unavailable.');
		// Still on the input form with the text preserved, not stuck on a loading state.
		await expect
			.element(screen.getByLabelText('Lesson plan'))
			.toHaveValue('A lesson about erosion.');
	});

	it('science-lab and history-essay lessons produce visibly different suggestion text (same mocked backend, real UI wiring)', async () => {
		const scienceResult = scoringResultJson({
			suggestions: [{ pillar: 'authenticity', text: 'Have students propose their own confound.' }]
		});
		const historyResult = scoringResultJson({
			suggestions: [
				{ pillar: 'authenticity', text: 'Have students weigh two conflicting primary sources.' }
			]
		});

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(scienceResult), { status: 200 }))
		);
		const scienceScreen = await render(Page, { data: signedOutData, params: {}, form: null });
		await scienceScreen.getByLabelText('Lesson plan').fill('A lab lesson.');
		await scienceScreen.getByRole('button', { name: 'Score this lesson' }).click();
		await expect
			.element(scienceScreen.getByText('Have students propose their own confound.'))
			.toBeVisible();

		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify(historyResult), { status: 200 }))
		);
		const historyScreen = await render(Page, { data: signedOutData, params: {}, form: null });
		await historyScreen.getByLabelText('Lesson plan').fill('A history essay lesson.');
		await historyScreen.getByRole('combobox', { name: 'Subject' }).selectOptions('history-essay');
		await historyScreen.getByRole('button', { name: 'Score this lesson' }).click();
		await expect
			.element(historyScreen.getByText('Have students weigh two conflicting primary sources.'))
			.toBeVisible();
	});

	it('lets a signed-in user save the scored lesson, posting the result to the save endpoint', async () => {
		const result = scoringResultJson();
		let saveRequestBody: Record<string, unknown> | null = null;

		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (url === '/api/lessons/score') {
					return new Response(JSON.stringify(result), { status: 200 });
				}
				if (url === '/api/lessons') {
					saveRequestBody = JSON.parse(init?.body as string);
					return new Response(JSON.stringify({ lessonId: 'saved-lesson-id' }), { status: 200 });
				}
				throw new Error(`Unexpected fetch to ${url}`);
			})
		);

		const screen = await render(Page, {
			data: {
				session: null,
				user: { id: 'user-1', email: 'teacher@example.com' },
				membership: null
			},
			params: {},
			form: null
		});

		await screen.getByLabelText('Lesson plan').fill('Students collect real data.');
		await screen.getByRole('button', { name: 'Score this lesson' }).click();
		await expect.element(screen.getByText('Save this lesson')).toBeVisible();

		await screen.getByLabelText('Title').fill('Density Lab');
		await screen.getByRole('button', { name: 'Save' }).click();

		await expect.element(screen.getByRole('status')).toHaveTextContent('Saved.');
		expect(saveRequestBody).toMatchObject({
			title: 'Density Lab',
			subjectProfileId: 'science-lab',
			visibility: 'private',
			source: 'paste',
			lessonText: 'Students collect real data.'
		});
	});
});
