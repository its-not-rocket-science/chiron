import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SiteNav from './SiteNav.svelte';

const user = { id: 'user-1', email: 'teacher@example.com' };

describe('SiteNav (prompt.txt Prompt D3)', () => {
	it('shows the primary nav links for a signed-in user, hidden by default on a narrow viewport', async () => {
		const screen = await render(SiteNav, { user });

		await expect.element(screen.getByRole('link', { name: 'Practice' })).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'My lessons' })).toBeInTheDocument();
	});

	it('marks the current page active with aria-current, not just visually', async () => {
		const screen = await render(SiteNav, { user });

		// jsdom/browser test environment defaults to "/" — none of the
		// primary links match, so none should be marked current.
		const links = screen.getByRole('link', { name: 'My lessons' });
		await expect.element(links.first()).not.toHaveAttribute('aria-current', 'page');
	});

	it('the mobile menu toggle is collapsed by default and expands the combined menu on click', async () => {
		const screen = await render(SiteNav, { user });

		const toggle = screen.getByRole('button', { name: 'Open menu' });
		await expect.element(toggle).toHaveAttribute('aria-expanded', 'false');
		expect(document.getElementById('mobile-menu')).toBeNull();

		await toggle.click();

		await expect
			.element(screen.getByRole('button', { name: 'Close menu' }))
			.toHaveAttribute('aria-expanded', 'true');
		expect(document.getElementById('mobile-menu')).not.toBeNull();
	});

	it('shows Log in / Sign up, not the account menu or primary nav, for a signed-out visitor', async () => {
		const screen = await render(SiteNav, { user: null });

		await expect.element(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument();
		await expect.element(screen.getByRole('link', { name: 'Sign up' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Practice' }).query()).toBeNull();
	});
});
