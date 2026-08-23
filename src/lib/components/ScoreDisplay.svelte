<script lang="ts">
	import { getRubricPillar, type PillarId } from '$lib/domain/rubric';
	import type { Score } from '$lib/domain/schemas';

	interface Props {
		score: Score;
	}

	let { score }: Props = $props();

	// Neutral intensity scale, not red/green — this is formative feedback, not a pass/fail grade.
	const BAR_COLOR = ['bg-slate-200', 'bg-indigo-300', 'bg-indigo-500', 'bg-indigo-700'];

	const rows = $derived(
		(
			[
				{
					pillar: 'dialogue' as PillarId,
					value: score.dialogueScore,
					justification: score.dialogueJustification
				},
				{
					pillar: 'authenticity' as PillarId,
					value: score.authenticityScore,
					justification: score.authenticityJustification
				},
				{
					pillar: 'mentoring' as PillarId,
					value: score.mentoringScore,
					justification: score.mentoringJustification
				}
			] as const
		).map((row) => ({ ...row, name: getRubricPillar(row.pillar).name }))
	);
</script>

<div class="flex flex-col gap-5">
	{#each rows as row (row.pillar)}
		<div>
			<div class="mb-1 flex items-baseline justify-between">
				<span class="text-sm font-medium text-slate-800">{row.name}</span>
				<span class="text-sm text-slate-500 tabular-nums">{row.value} / 3</span>
			</div>
			<div
				class="h-2 w-full rounded-full bg-slate-100"
				role="meter"
				aria-valuenow={row.value}
				aria-valuemin={0}
				aria-valuemax={3}
				aria-label={`${row.name} score`}
			>
				<div
					class={`h-2 rounded-full ${BAR_COLOR[row.value]}`}
					style={`width: ${(row.value / 3) * 100}%`}
				></div>
			</div>
			<p class="mt-1.5 text-sm text-slate-600">{row.justification}</p>
		</div>
	{/each}
</div>
