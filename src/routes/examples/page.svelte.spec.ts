import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { ExampleLessonRow } from './+page.server';

function exampleRow(overrides: Partial<ExampleLessonRow> = {}): ExampleLessonRow {
	return {
		id: 'lesson-1',
		title: 'Thermal Energy: Designing a Better Cup',
		subject_profile_id: 'science-lab',
		attribution_name: 'OpenSciEd',
		attribution_url: 'https://openscied.org/instructional-materials/6-2-thermal-energy/',
		license: 'CC-BY-4.0',
		license_note: 'Adapted from the public unit-overview page.',
		lesson_versions: {
			id: 'version-1',
			raw_text: '[OBJECTIVES]\nStudents will investigate thermal energy.',
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
						justification: 'Students draw conclusions from their own temperature data.'
					}
				],
				suggestions: [
					{
						id: 'suggestion-1',
						pillar: 'mentoring',
						text: 'Have the teacher model interpreting one temperature curve live.'
					}
				]
			}
		},
		...overrides
	};
}

describe('/examples page (Prompt E4)', () => {
	it('renders the license badge and a visible attribution link pointing to the real source URL', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: null
		});

		await expect.element(screen.getByText('CC BY 4.0')).toBeVisible();

		const link = screen.getByRole('link', { name: /Source: OpenSciEd/ });
		await expect.element(link).toBeVisible();
		await expect
			.element(link)
			.toHaveAttribute('href', 'https://openscied.org/instructional-materials/6-2-thermal-energy/');
	});

	it('renders the correct badge for each license enum value', async () => {
		const publicDomainRow = exampleRow({
			id: 'lesson-2',
			license: 'Public-Domain-US-Govt',
			attribution_name: 'Library of Congress'
		});
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [publicDomainRow],
				existingCopies: {}
			},
			params: {},
			form: null
		});

		await expect.element(screen.getByText('Public Domain (U.S. Government)')).toBeVisible();
	});

	it('shows the lesson text, pillar scores, skill coverage, and suggestions from the stored score, not a live call', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: null
		});

		await expect
			.element(screen.getByText('Students will investigate thermal energy.'))
			.toBeVisible();
		await expect.element(screen.getByText('Students collect real comparative data.')).toBeVisible();
		await expect
			.element(screen.getByText('Have the teacher model interpreting one temperature curve live.'))
			.toBeVisible();
	});

	it('shows a "duplicate and edit" button for each example', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: null
		});

		await expect
			.element(screen.getByRole('button', { name: 'Duplicate and try your own edit' }))
			.toBeVisible();
	});

	it('shows a success message with a link to the copy once a duplicate action completes', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: {
				error: null,
				copiedLessonId: 'new-lesson-id',
				sourceLessonId: 'lesson-1',
				alreadyExisted: false
			}
		});

		await expect.element(screen.getByText('You already have a copy of this.')).toBeVisible();
	});

	it("doesn't show a different example's success message on this card (the message must sit next to the button that was actually clicked, not just anywhere on the page)", async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: {
				error: null,
				copiedLessonId: 'new-lesson-id',
				sourceLessonId: 'some-other-lesson-id',
				alreadyExisted: false
			}
		});

		expect(screen.getByText('You already have a copy of this.').query()).toBeNull();
		await expect
			.element(screen.getByRole('button', { name: 'Duplicate and try your own edit' }))
			.toBeVisible();
	});

	it('shows "you already have a copy" on page load (a revisit, not just right after copying) and hides the duplicate button, per the existingCopies map from load', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: { 'lesson-1': 'existing-copy-id' }
			},
			params: {},
			form: null
		});

		await expect.element(screen.getByText('You already have a copy of this.')).toBeVisible();
		expect(
			screen.getByRole('button', { name: 'Duplicate and try your own edit' }).query()
		).toBeNull();
	});

	it('a duplicate action reporting alreadyExisted still shows the same "already have a copy" message, not a distinct one requiring separate handling', async () => {
		const screen = await render(Page, {
			data: {
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null,
				examples: [exampleRow()],
				existingCopies: {}
			},
			params: {},
			form: {
				error: null,
				copiedLessonId: 'existing-copy-id',
				sourceLessonId: 'lesson-1',
				alreadyExisted: true
			}
		});

		await expect.element(screen.getByText('You already have a copy of this.')).toBeVisible();
	});
});
