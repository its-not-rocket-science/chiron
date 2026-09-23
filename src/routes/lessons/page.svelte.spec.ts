import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import type { LessonListItem } from './+page.server';

function lesson(overrides: Partial<LessonListItem> = {}): LessonListItem {
	return {
		id: crypto.randomUUID(),
		title: 'Density of Liquids Lab',
		subject_profile_id: 'science-lab',
		grade_level: '9',
		visibility: 'private',
		created_at: new Date().toISOString(),
		isStale: false,
		...overrides
	};
}

describe('/lessons page (prompt.txt Prompt G5)', () => {
	it('shows every lesson when no filters are applied', async () => {
		const screen = await render(Page, {
			data: {
				user: null,
				session: null,
				lessons: [
					lesson({ title: 'Density of Liquids Lab' }),
					lesson({ title: 'The Treaty of Versailles', subject_profile_id: 'history-essay' })
				]
			},
			params: {},
			form: null
		});

		await expect.element(screen.getByText('Density of Liquids Lab')).toBeVisible();
		await expect.element(screen.getByText('The Treaty of Versailles')).toBeVisible();
	});

	it('filters by title as the user types', async () => {
		const screen = await render(Page, {
			data: {
				user: null,
				session: null,
				lessons: [
					lesson({ title: 'Density of Liquids Lab' }),
					lesson({ title: 'The Treaty of Versailles', subject_profile_id: 'history-essay' })
				]
			},
			params: {},
			form: null
		});

		await screen.getByLabelText('Search by title').fill('density');

		await expect.element(screen.getByText('Density of Liquids Lab')).toBeVisible();
		expect(screen.getByText('The Treaty of Versailles').query()).toBeNull();
	});

	it('filters by subject profile', async () => {
		const screen = await render(Page, {
			data: {
				user: null,
				session: null,
				lessons: [
					lesson({ title: 'Density of Liquids Lab', subject_profile_id: 'science-lab' }),
					lesson({ title: 'The Treaty of Versailles', subject_profile_id: 'history-essay' })
				]
			},
			params: {},
			form: null
		});

		await screen.getByLabelText('Subject').selectOptions('history-essay');

		await expect.element(screen.getByText('The Treaty of Versailles')).toBeVisible();
		expect(screen.getByText('Density of Liquids Lab').query()).toBeNull();
	});

	it('shows a "no matches" message when the search/filter combination matches nothing, not an empty list', async () => {
		const screen = await render(Page, {
			data: { user: null, session: null, lessons: [lesson({ title: 'Density of Liquids Lab' })] },
			params: {},
			form: null
		});

		await screen.getByLabelText('Search by title').fill('nonexistent lesson title');

		await expect.element(screen.getByText('No lessons match your search.')).toBeVisible();
	});

	it('shows a stale-rubric indicator with a re-score link for a lesson scored under an earlier prompt version', async () => {
		const screen = await render(Page, {
			data: {
				user: null,
				session: null,
				lessons: [lesson({ title: 'Old Scoring Lesson', isStale: true })]
			},
			params: {},
			form: null
		});

		await expect.element(screen.getByText(/earlier version of Chiron's rubric/)).toBeVisible();
		await expect
			.element(screen.getByRole('link', { name: 're-score for the latest feedback' }))
			.toBeVisible();
	});

	it('shows no stale indicator for a lesson scored under the current prompt version', async () => {
		const screen = await render(Page, {
			data: {
				user: null,
				session: null,
				lessons: [lesson({ title: 'Current Scoring Lesson', isStale: false })]
			},
			params: {},
			form: null
		});

		expect(screen.getByText(/earlier version of Chiron's rubric/).query()).toBeNull();
	});
});
