<script lang="ts">
	import { rubricPillars } from '$lib/domain/rubric';
	import type { Suggestion } from '$lib/domain/schemas';

	interface Props {
		suggestions: Suggestion[];
	}

	let { suggestions }: Props = $props();

	const groups = $derived(
		rubricPillars
			.map((pillar) => ({
				pillar: pillar.id,
				name: pillar.name,
				items: suggestions.filter((s) => s.pillar === pillar.id)
			}))
			.filter((group) => group.items.length > 0)
	);
</script>

{#if groups.length === 0}
	<p class="text-sm text-slate-500">
		No specific suggestions — this lesson already scores well across the board.
	</p>
{:else}
	<div class="flex flex-col gap-5">
		{#each groups as group (group.pillar)}
			<div>
				<h3 class="mb-1.5 text-sm font-medium text-slate-800">{group.name}</h3>
				<ul class="flex flex-col gap-1.5">
					{#each group.items as item (item.id)}
						<li class="flex gap-2 text-sm text-slate-600">
							<span aria-hidden="true">•</span>
							<span>{item.text}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
{/if}
