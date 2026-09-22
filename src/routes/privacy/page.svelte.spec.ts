import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

// prompt.txt Prompt F2: content accuracy against the real codebase is what
// matters here, not exhaustive UI coverage — this just confirms the page
// renders and links to the terms page, matching the pattern of every other
// component/page spec in this repo.
describe('/privacy', () => {
	it('renders the privacy page and links to terms', async () => {
		const screen = await render(Page);

		await expect.element(screen.getByRole('heading', { name: 'Privacy' })).toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: 'Terms of service' }))
			.toBeInTheDocument();
	});
});
