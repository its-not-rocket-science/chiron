import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

// prompt.txt Prompt F3: an expired/invalid recovery link must show a
// clear message and a way back to /forgot-password, not a raw error or
// a password form that can't actually work.
describe('/reset-password', () => {
	it('shows an expired-link message with a way back, when the session is invalid', async () => {
		const screen = await render(Page, {
			data: { validSession: false, user: null, session: null },
			params: {},
			form: null
		});

		await expect
			.element(screen.getByText('This reset link has expired or is invalid.'))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: 'Request a new link' }))
			.toBeInTheDocument();
		expect(screen.getByLabelText('New password').query()).toBeNull();
	});

	it('shows the new-password form when the session is valid', async () => {
		const screen = await render(Page, {
			data: {
				validSession: true,
				user: { id: 'user-1', email: 'teacher@example.com' },
				session: null
			},
			params: {},
			form: null
		});

		await expect
			.element(screen.getByLabelText('New password', { exact: true }))
			.toBeInTheDocument();
		await expect.element(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
	});
});
