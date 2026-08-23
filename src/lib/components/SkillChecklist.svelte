<script lang="ts">
	import { getCTSkill } from '$lib/domain/taxonomy';
	import type { SkillCoverageEntry } from '$lib/domain/schemas';

	interface Props {
		skillCoverage: SkillCoverageEntry[];
	}

	let { skillCoverage }: Props = $props();

	const rows = $derived(
		skillCoverage
			.map((entry) => ({ ...entry, name: getCTSkill(entry.skill).name }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
</script>

<ul class="flex flex-col gap-4">
	{#each rows as row (row.skill)}
		<li class="flex gap-3">
			<span
				class="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs font-medium"
				class:bg-slate-800={row.covered}
				class:text-white={row.covered}
				class:bg-slate-100={!row.covered}
				class:text-slate-400={!row.covered}
				aria-hidden="true"
			>
				{row.covered ? '✓' : '–'}
			</span>
			<div>
				<div class="flex items-center gap-2">
					<span class="text-sm font-medium text-slate-800">{row.name}</span>
					<span class="text-xs text-slate-400">
						{row.covered ? 'covered' : 'not clearly covered'} · {row.confidence} confidence
					</span>
				</div>
				<p class="mt-0.5 text-sm text-slate-600">{row.justification}</p>
			</div>
		</li>
	{/each}
</ul>
