import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

// prompt.txt Prompt F2: see src/routes/privacy/page.svelte.spec.ts for why
// this stays a light render check rather than asserting on prose content.
describe('/terms', () => {
	it('renders the terms page and links to privacy', async () => {
		const screen = await render(Page);

		await expect
			.element(screen.getByRole('heading', { name: 'Terms of service' }))
			.toBeInTheDocument();
		await expect
			.element(screen.getByRole('link', { name: 'Privacy', exact: true }))
			.toBeInTheDocument();
	});
});
