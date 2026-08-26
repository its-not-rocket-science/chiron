import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import JudgmentPicker from './JudgmentPicker.svelte';

const LABELS = [
	'Strongly unsupported',
	'Somewhat unsupported',
	'Uncertain',
	'Somewhat supported',
	'Strongly supported'
];

describe('JudgmentPicker', () => {
	it('renders all five judgement options as a native, keyboard-accessible radiogroup', async () => {
		const screen = await render(JudgmentPicker, {
			value: null,
			legend: 'Your judgement',
			name: 'test-judgment'
		});
		for (const label of LABELS) {
			await expect.element(screen.getByRole('radio', { name: label })).toBeVisible();
		}
	});

	it('selects a judgement when its label is clicked, including "uncertain" (no different treatment than any other option)', async () => {
		const screen = await render(JudgmentPicker, {
			value: null,
			legend: 'Your judgement',
			name: 'test-judgment'
		});
		await screen.getByText('Uncertain').click();
		await expect.element(screen.getByRole('radio', { name: 'Uncertain' })).toBeChecked();
	});

	it('reflects an initial value as checked', async () => {
		const screen = await render(JudgmentPicker, {
			value: 'somewhat_supported',
			legend: 'Your judgement',
			name: 'test-judgment'
		});
		await expect.element(screen.getByRole('radio', { name: 'Somewhat supported' })).toBeChecked();
	});

	it('disables every option when disabled is set', async () => {
		const screen = await render(JudgmentPicker, {
			value: null,
			legend: 'Your judgement',
			name: 'test-judgment',
			disabled: true
		});
		for (const label of LABELS) {
			await expect.element(screen.getByRole('radio', { name: label })).toBeDisabled();
		}
	});
});
