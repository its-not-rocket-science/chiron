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

	let copiedId = $state<string | null>(null);

	async function copyScriptSwap(item: Suggestion) {
		if (!item.suggestedScriptSwap) return;
		try {
			await navigator.clipboard.writeText(item.suggestedScriptSwap);
			copiedId = item.id;
		} catch {
			// Clipboard access denied/unavailable — the text is still visible
			// on the page for the teacher to select and copy manually.
		}
	}
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
						<li class="flex flex-col gap-1.5 text-sm text-slate-600">
							<div class="flex gap-2">
								<span aria-hidden="true">•</span>
								<span>{item.text}</span>
							</div>
							{#if item.suggestedScriptSwap}
								<div class="ml-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
									<pre
										class="mb-2 font-sans text-xs whitespace-pre-wrap text-amber-900">{item.suggestedScriptSwap}</pre>
									<button
										type="button"
										onclick={() => copyScriptSwap(item)}
										class="rounded border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
									>
										{copiedId === item.id ? 'Copied!' : 'Copy to clipboard'}
									</button>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
{/if}
