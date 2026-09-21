<script lang="ts">
	import { getRubricPillar, type PillarId } from '$lib/domain/rubric';
	import type { Score } from '$lib/domain/schemas';

	interface Props {
		score: Score;
	}

	let { score }: Props = $props();

	// docs/DESIGN.md — the same ordinal, "neutral intensity, not red/green"
	// scale ScoreDisplay already uses (formative feedback, not pass/fail),
	// re-stepped onto the brand teal instead of generic indigo.
	const SEGMENT_COLOR = ['bg-slate-200', 'bg-brand/30', 'bg-brand/65', 'bg-brand'];

	const rows = $derived(
		(
			[
				{ pillar: 'dialogue' as PillarId, value: score.dialogueScore },
				{ pillar: 'authenticity' as PillarId, value: score.authenticityScore },
				{ pillar: 'mentoring' as PillarId, value: score.mentoringScore }
			] as const
		).map((row) => ({ ...row, name: getRubricPillar(row.pillar).name }))
	);
</script>

<div class="flex flex-wrap gap-x-6 gap-y-3">
	{#each rows as row (row.pillar)}
		<div class="flex flex-col gap-1">
			<span class="text-xs text-slate-500">{row.name}</span>
			<div class="flex items-center gap-2">
				<div class="flex gap-0.5" role="presentation">
					{#each [0, 1, 2] as segment (segment)}
						<span
							class="h-2 w-4 rounded-sm {segment < row.value
								? SEGMENT_COLOR[row.value]
								: 'bg-slate-100'}"
						></span>
					{/each}
				</div>
				<span class="text-xs font-medium text-slate-700 tabular-nums">{row.value}/3</span>
			</div>
		</div>
	{/each}
</div>
