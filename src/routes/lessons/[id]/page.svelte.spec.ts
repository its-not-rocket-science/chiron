import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { LessonDetailRow } from './+page.server';

afterEach(() => {
	vi.unstubAllGlobals();
});

function lessonRow(overrides: Partial<LessonDetailRow> = {}): LessonDetailRow {
	return {
		id: 'lesson-1',
		owner_id: 'user-1',
		title: 'Density of Liquids Lab',
		subject_profile_id: 'science-lab',
		grade_level: '9',
		visibility: 'private',
		attribution_name: null,
		attribution_url: null,
		license: null,
		license_note: null,
		lesson_versions: {
			id: 'version-1',
			version_number: 1,
			raw_text: '[OBJECTIVES]\nStudents will investigate density.',
			scores: {
				id: 'score-1',
				dialogue_score: 2,
				dialogue_justification: 'Some structured discussion occurs.',
				authenticity_score: 3,
				authenticity_justification: 'Students collect real comparative data.',
				mentoring_score: 1,
				mentoring_justification: 'Feedback is mostly generic.',
				model_id: 'test-model',
				prompt_version: 'test-prompt-v1',
				created_at: new Date().toISOString(),
				skill_coverage_entries: [
					{
						id: 'skill-1',
						skill: 'inference',
						covered: true,
						confidence: 'high',
						justification: 'Students draw conclusions from their own density data.'
					}
				],
				suggestions: [
					{
						id: 'suggestion-1',
						pillar: 'mentoring',
						text: 'Have the teacher model interpreting one data point live.'
					}
				]
			}
		},
		...overrides
	};
}

describe('/lessons/[id] page (prompt.txt Prompt D2)', () => {
	it('shows the lesson text, pillar scores, skill coverage, and suggestions', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await expect.element(screen.getByText('Students will investigate density.')).toBeVisible();
		await expect.element(screen.getByText('Students collect real comparative data.')).toBeVisible();
		await expect
			.element(screen.getByText('Have the teacher model interpreting one data point live.'))
			.toBeVisible();
	});

	it('shows Edit and Delete controls for the owner', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await expect.element(screen.getByRole('button', { name: 'Edit' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Delete' })).toBeVisible();
	});

	it('hides Edit and Delete controls for a non-owner viewing a shared/public lesson', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-2', email: 'other@example.com' },
				session: null,
				lesson: lessonRow({ visibility: 'public-template' }),
				isOwner: false
			},
			params: { id: 'lesson-1' },
			form: null
		});

		expect(screen.getByRole('button', { name: 'Edit' }).query()).toBeNull();
		expect(screen.getByRole('button', { name: 'Delete' }).query()).toBeNull();
	});

	it('clicking Edit shows the lesson input form pre-filled with the current text', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await screen.getByRole('button', { name: 'Edit' }).click();

		await expect
			.element(screen.getByRole('button', { name: 'Resubmit for re-scoring' }))
			.toBeVisible();
		await expect
			.element(screen.getByLabelText('Lesson plan'))
			.toHaveValue('[OBJECTIVES]\nStudents will investigate density.');
	});

	it('clicking Delete shows a confirmation step, and Cancel dismisses it without submitting', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await screen.getByRole('button', { name: 'Delete' }).click();
		await expect.element(screen.getByText('Delete this lesson permanently?')).toBeVisible();

		await screen.getByRole('button', { name: 'Cancel' }).click();
		expect(screen.getByText('Delete this lesson permanently?').query()).toBeNull();
	});

	// prompt.txt Prompt G5 point 3: this page's re-score flow (Edit →
	// Resubmit for re-scoring, handleResubmit in +page.svelte) had no
	// error-path test coverage at all before this — a genuine gap this
	// prompt closes, not just a re-confirmation. Both the scoring route's
	// real 429 (rate limit) and 502 (provider failure) messages, proven
	// to surface specifically rather than falling back to a generic string.
	it('shows the specific rate-limit message on a 429 during re-scoring, and returns to the edit form', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: { message: 'Too many scoring requests. Please wait a bit and try again.' }
						}),
						{ status: 429, headers: { 'Retry-After': '30' } }
					)
			)
		);

		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await screen.getByRole('button', { name: 'Edit' }).click();
		await screen.getByRole('button', { name: 'Resubmit for re-scoring' }).click();

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('Too many scoring requests. Please wait a bit and try again.');
		// Back on the edit form, not stuck on the "Scoring your revision…" state.
		await expect
			.element(screen.getByRole('button', { name: 'Resubmit for re-scoring' }))
			.toBeVisible();
	});

	it('shows the specific provider-failure message on a 502 during re-scoring, and returns to the edit form', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: {
								message:
									'Scoring failed — the model did not return a valid result. Please try again.'
							}
						}),
						{ status: 502 }
					)
			)
		);

		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				lesson: lessonRow(),
				isOwner: true
			},
			params: { id: 'lesson-1' },
			form: null
		});

		await screen.getByRole('button', { name: 'Edit' }).click();
		await screen.getByRole('button', { name: 'Resubmit for re-scoring' }).click();

		await expect
			.element(screen.getByRole('alert'))
			.toHaveTextContent('the model did not return a valid result');
		await expect
			.element(screen.getByRole('button', { name: 'Resubmit for re-scoring' }))
			.toBeVisible();
	});
});
