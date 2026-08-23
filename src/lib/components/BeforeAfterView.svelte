<script lang="ts">
	import { getRubricPillar } from '$lib/domain/rubric';
	import { compareScores } from '$lib/domain/versioning';
	import type { Score } from '$lib/domain/schemas';

	interface Props {
		before: Score;
		after: Score;
	}

	let { before, after }: Props = $props();

	const deltas = $derived(
		compareScores(before, after).map((d) => ({ ...d, name: getRubricPillar(d.pillar).name }))
	);

	function changeLabel(change: number): string {
		if (change > 0) return `+${change}`;
		if (change < 0) return `${change}`;
		return 'no change';
	}
</script>

<div class="overflow-x-auto">
	<table class="w-full min-w-[24rem] text-sm">
		<thead>
			<tr class="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
				<th scope="col" class="py-2 pr-3">Pillar</th>
				<th scope="col" class="px-3 py-2">Before</th>
				<th scope="col" class="px-3 py-2">After</th>
				<th scope="col" class="py-2 pl-3">Change</th>
			</tr>
		</thead>
		<tbody>
			{#each deltas as delta (delta.pillar)}
				<tr class="border-b border-slate-100 last:border-0">
					<th scope="row" class="py-2 pr-3 text-left font-medium text-slate-800">{delta.name}</th>
					<td class="px-3 py-2 text-slate-600 tabular-nums">{delta.before} / 3</td>
					<td class="px-3 py-2 text-slate-600 tabular-nums">{delta.after} / 3</td>
					<td class="py-2 pl-3 text-slate-600 tabular-nums">{changeLabel(delta.change)}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
