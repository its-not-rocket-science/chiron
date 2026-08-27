import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SuggestionList from './SuggestionList.svelte';
import type { Suggestion } from '$lib/domain/schemas';

afterEach(() => {
	vi.restoreAllMocks();
});

function suggestion(overrides: Partial<Suggestion> = {}): Suggestion {
	return {
		id: crypto.randomUUID(),
		scoreId: crypto.randomUUID(),
		pillar: 'dialogue',
		text: 'Add a structured small-group debate about the data.',
		suggestedScriptSwap: null,
		...overrides
	};
}

describe('SuggestionList', () => {
	it('renders suggestion text without a copy control when suggestedScriptSwap is null', async () => {
		const screen = await render(SuggestionList, {
			suggestions: [suggestion()]
		});

		await expect
			.element(screen.getByText('Add a structured small-group debate about the data.'))
			.toBeInTheDocument();
		await expect.element(screen.getByText('Copy to clipboard')).not.toBeInTheDocument();
	});

	it('renders the script swap in a distinct block with a copy control when present (prompts.txt Prompt P4)', async () => {
		const scriptSwap =
			'Original: "What is the water cycle?"\nRewrite: "What would happen if evaporation stopped?"';
		const screen = await render(SuggestionList, {
			suggestions: [suggestion({ suggestedScriptSwap: scriptSwap })]
		});

		await expect.element(screen.getByText(scriptSwap)).toBeInTheDocument();
		await expect
			.element(screen.getByRole('button', { name: 'Copy to clipboard' }))
			.toBeInTheDocument();
	});

	it('copies the script swap text to the clipboard on click', async () => {
		const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
		const scriptSwap = 'Original: "Copy this?"\nRewrite: "What makes this worth copying?"';
		const screen = await render(SuggestionList, {
			suggestions: [suggestion({ suggestedScriptSwap: scriptSwap })]
		});

		await screen.getByRole('button', { name: 'Copy to clipboard' }).click();

		expect(writeText).toHaveBeenCalledWith(scriptSwap);
		await expect.element(screen.getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
	});

	it('shows exactly one copy control when only one of several suggestions has a script swap', async () => {
		const screen = await render(SuggestionList, {
			suggestions: [
				suggestion({
					id: 'a',
					text: 'First dialogue suggestion.',
					suggestedScriptSwap: 'Original: "x"\nRewrite: "y"'
				}),
				suggestion({ id: 'b', text: 'Second dialogue suggestion.', suggestedScriptSwap: null })
			]
		});

		const copyButtons = await screen.getByRole('button', { name: 'Copy to clipboard' }).all();
		expect(copyButtons).toHaveLength(1);
	});
});
