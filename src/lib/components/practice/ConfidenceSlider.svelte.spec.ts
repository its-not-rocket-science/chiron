import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ConfidenceSlider from './ConfidenceSlider.svelte';

describe('ConfidenceSlider', () => {
	it('renders with an accessible label and a live percentage readout matching the initial value', async () => {
		const screen = await render(ConfidenceSlider, {
			value: 50,
			label: 'Your confidence',
			id: 'initial-confidence'
		});
		await expect.element(screen.getByLabelText('Your confidence')).toHaveValue('50');
		await expect.element(screen.getByText('50%')).toBeVisible();
	});

	it('updates the visible readout when the slider value changes', async () => {
		const screen = await render(ConfidenceSlider, {
			value: 50,
			label: 'Your confidence',
			id: 'initial-confidence'
		});
		await screen.getByLabelText('Your confidence').fill('80');
		await expect.element(screen.getByText('80%')).toBeVisible();
	});

	it('disables the slider when disabled is set', async () => {
		const screen = await render(ConfidenceSlider, {
			value: 50,
			label: 'Your confidence',
			id: 'initial-confidence',
			disabled: true
		});
		await expect.element(screen.getByLabelText('Your confidence')).toBeDisabled();
	});
});
