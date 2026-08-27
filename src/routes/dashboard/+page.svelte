<script lang="ts">
	import DashboardTrendChart from '$lib/components/DashboardTrendChart.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const dialogueValues = $derived(data.trend.map((point) => point.dialogueScore));
	const authenticityValues = $derived(data.trend.map((point) => point.authenticityScore));
	const mentoringValues = $derived(data.trend.map((point) => point.mentoringScore));

	const hasBenchmark = $derived(
		data.orgBenchmark !== null && data.orgBenchmark.dialogue_avg !== null
	);
</script>

<svelte:head>
	<title>Dashboard — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<h1 class="text-2xl font-semibold text-slate-900">Your progress</h1>

	{#if data.trend.length === 0}
		<p class="text-sm text-slate-500">Score and save a lesson to start seeing your trend here.</p>
	{:else}
		<div class="flex flex-col gap-6">
			<DashboardTrendChart
				label="Dialogue"
				values={dialogueValues}
				benchmark={data.orgBenchmark?.dialogue_avg ?? null}
			/>
			<DashboardTrendChart
				label="Authenticity"
				values={authenticityValues}
				benchmark={data.orgBenchmark?.authenticity_avg ?? null}
			/>
			<DashboardTrendChart
				label="Mentoring"
				values={mentoringValues}
				benchmark={data.orgBenchmark?.mentoring_avg ?? null}
			/>
		</div>

		{#if hasBenchmark && data.orgBenchmark}
			<p class="text-xs text-slate-500">
				Dashed line: your org's average across {data.orgBenchmark.lesson_count} lesson{data
					.orgBenchmark.lesson_count === 1
					? ''
					: 's'} scored in the last 30 days.
			</p>
		{:else if data.orgBenchmark}
			<p class="text-xs text-slate-500">Not enough org activity yet to show a benchmark.</p>
		{/if}
	{/if}
</main>
