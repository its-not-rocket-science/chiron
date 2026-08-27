import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import DashboardTrendChart from './DashboardTrendChart.svelte';

describe('DashboardTrendChart', () => {
	it('shows a "no data yet" placeholder when there are no values', async () => {
		const screen = await render(DashboardTrendChart, {
			label: 'Dialogue',
			values: [],
			benchmark: null
		});

		await expect.element(screen.getByText('No data yet')).toBeInTheDocument();
	});

	it('renders a chart with the pillar label when values are present, without a benchmark line', async () => {
		const screen = await render(DashboardTrendChart, {
			label: 'Dialogue',
			values: [1, 2, 3],
			benchmark: null
		});

		await expect.element(screen.getByText('Dialogue')).toBeInTheDocument();
		await expect
			.element(screen.getByRole('img', { name: 'Dialogue trend over recent lessons' }))
			.toBeInTheDocument();
	});

	it('mentions the org benchmark in the accessible label when one is provided', async () => {
		const screen = await render(DashboardTrendChart, {
			label: 'Mentoring',
			values: [1, 2],
			benchmark: 2.5
		});

		await expect
			.element(
				screen.getByRole('img', {
					name: 'Mentoring trend over recent lessons, with org benchmark shown as a dashed line'
				})
			)
			.toBeInTheDocument();
	});
});
