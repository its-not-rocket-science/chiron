<script lang="ts">
	/**
	 * Plain SVG line chart (prompts.txt Prompt P6) — no charting dependency
	 * added just for this. Pillar scores are always 0-3 (RubricScoreSchema),
	 * so the y-axis is a fixed 0-3 scale rather than derived from the data.
	 */
	interface Props {
		label: string;
		values: number[];
		benchmark: number | null;
	}

	let { label, values, benchmark }: Props = $props();

	const width = 300;
	const height = 100;
	const paddingX = 12;
	const paddingY = 12;

	function scaleX(index: number, count: number): number {
		if (count <= 1) return width / 2;
		return paddingX + (index / (count - 1)) * (width - paddingX * 2);
	}

	function scaleY(value: number): number {
		return height - paddingY - (value / 3) * (height - paddingY * 2);
	}

	const points = $derived(
		values.map((value, index) => `${scaleX(index, values.length)},${scaleY(value)}`).join(' ')
	);
	const benchmarkY = $derived(benchmark !== null ? scaleY(benchmark) : null);
	const ariaLabel = $derived(
		`${label} trend over recent lessons${benchmark !== null ? ', with org benchmark shown as a dashed line' : ''}`
	);
</script>

<div>
	<h4 class="mb-1 text-xs font-medium text-slate-600">{label}</h4>
	<svg viewBox="0 0 {width} {height}" class="h-24 w-full" role="img" aria-label={ariaLabel}>
		{#if benchmarkY !== null}
			<!-- docs/DESIGN.md — chart series 2 (org benchmark): brand gold,
				validated as a categorical pair against series 1's teal
				(dataviz skill validate_palette.js: CVD ΔE 10.0 protan, 18.9
				normal-vision — both clear the ≥8/≥15 targets). -->
			<line
				x1={paddingX}
				y1={benchmarkY}
				x2={width - paddingX}
				y2={benchmarkY}
				stroke="var(--color-brand-gold)"
				stroke-width="1.5"
				stroke-dasharray="4 3"
			/>
		{/if}
		{#if values.length > 0}
			<!-- Chart series 1 (this teacher's own trend): brand teal. -->
			<polyline {points} fill="none" stroke="var(--color-brand)" stroke-width="2" />
			{#each values as value, index (index)}
				<circle
					cx={scaleX(index, values.length)}
					cy={scaleY(value)}
					r="2.5"
					fill="var(--color-brand)"
				/>
			{/each}
		{:else}
			<text x={width / 2} y={height / 2} text-anchor="middle" class="fill-slate-400 text-[10px]"
				>No data yet</text
			>
		{/if}
	</svg>
</div>
