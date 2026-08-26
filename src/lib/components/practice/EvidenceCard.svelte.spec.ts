import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import EvidenceCard from './EvidenceCard.svelte';

describe('EvidenceCard', () => {
	it('renders the evidence text with no "New" badge when isNew is omitted', async () => {
		const screen = await render(EvidenceCard, { text: 'Traffic fell 18% after installation.' });
		await expect.element(screen.getByText('Traffic fell 18% after installation.')).toBeVisible();
		await expect.element(screen.getByText('New')).not.toBeInTheDocument();
	});

	it('renders the evidence text with no "New" badge when isNew is explicitly false', async () => {
		const screen = await render(EvidenceCard, {
			text: 'A comparable street saw a similar drop.',
			isNew: false
		});
		await expect.element(screen.getByText('New')).not.toBeInTheDocument();
	});

	it('shows a "New" badge when isNew is true', async () => {
		const screen = await render(EvidenceCard, {
			text: 'A comparable street saw a similar drop.',
			isNew: true
		});
		await expect.element(screen.getByText('A comparable street saw a similar drop.')).toBeVisible();
		await expect.element(screen.getByText('New', { exact: true })).toBeVisible();
	});
});
