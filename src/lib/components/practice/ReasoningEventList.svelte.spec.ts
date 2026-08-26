import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ReasoningEventList from './ReasoningEventList.svelte';

// Every render() call below wraps its prop in `{ props: { events: ... } }`
// rather than the usual flat `{ events: ... }` shorthand — this
// component's prop is named `events`, which collides with Svelte 5's own
// reserved `mount()` option of the same name (alongside `target`,
// `props`, `context`, `intro`, `recover`). testing-library's render()
// disambiguates a flat options object from real MountOptions by
// checking for those reserved keys, so `render(C, { events: [...] })`
// gets silently misread as "pass this as the legacy event-listener map,
// not as props" and the component receives no props at all. Confirmed
// by direct probe before writing this comment — not a guess.
describe('ReasoningEventList', () => {
	it('shows an honest, non-judgemental message when no reasoning moves were detected', async () => {
		const screen = await render(ReasoningEventList, { props: { events: [] } });
		await expect
			.element(screen.getByText('No specific reasoning moves were detected', { exact: false }))
			.toBeVisible();
		await expect.element(screen.getByText(/does.?n't mean/)).toBeVisible();
	});

	it("renders each event's explanation and affected skills", async () => {
		const screen = await render(ReasoningEventList, {
			props: {
				events: [
					{
						explanation: 'You identified a plausible alternative explanation for the drop.',
						affectedSkills: ['inference', 'analysis']
					}
				]
			}
		});
		await expect
			.element(screen.getByText('You identified a plausible alternative explanation for the drop.'))
			.toBeVisible();
		await expect.element(screen.getByText('Inference')).toBeVisible();
		await expect.element(screen.getByText('Analysis')).toBeVisible();
	});

	it("shows the evidence quote as a traceable excerpt from the student's own text, when present", async () => {
		const screen = await render(ReasoningEventList, {
			props: {
				events: [
					{
						explanation: 'You identified a plausible alternative explanation for the drop.',
						affectedSkills: ['inference'],
						evidenceQuote: 'the school schedule change could also explain some of the drop'
					}
				]
			}
		});
		await expect
			.element(
				screen.getByText('the school schedule change could also explain some of the drop', {
					exact: false
				})
			)
			.toBeVisible();
	});

	it('renders no quote block when evidenceQuote is null or omitted', async () => {
		const screen = await render(ReasoningEventList, {
			props: {
				events: [
					{
						explanation: 'You demonstrated a reasoning move.',
						affectedSkills: [],
						evidenceQuote: null
					}
				]
			}
		});
		await expect.element(screen.getByText('You demonstrated a reasoning move.')).toBeVisible();
		// No stray quote characters rendered when there's nothing to quote.
		await expect.element(screen.getByText('""')).not.toBeInTheDocument();
	});

	it('renders multiple events independently, each with its own skill tags', async () => {
		const screen = await render(ReasoningEventList, {
			props: {
				events: [
					{ explanation: 'First move.', affectedSkills: ['inference'] },
					{ explanation: 'Second move.', affectedSkills: ['self_regulation'] }
				]
			}
		});
		await expect.element(screen.getByText('First move.')).toBeVisible();
		await expect.element(screen.getByText('Second move.')).toBeVisible();
		await expect.element(screen.getByText('Self-regulation')).toBeVisible();
	});
});
