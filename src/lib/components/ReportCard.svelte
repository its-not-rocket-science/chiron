<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Omit when the page already has its own heading right above (e.g. a focus-managed results heading) — ReportCard shouldn't duplicate it. */
		title?: string;
		summary?: Snippet;
		children: Snippet;
	}

	let { title, summary, children }: Props = $props();
</script>

<!--
	docs/DESIGN.md — one bordered report container with internal section
	dividers, replacing three separately-bordered stacked cards
	(ScoreDisplay/SkillChecklist/SuggestionList used to each sit in their
	own ad hoc wrapper at each of the three call sites). Sections are
	plain children (see ReportSection.svelte) so this component only owns
	the outer chrome + optional summary strip, not the section content.
-->
<section class="overflow-hidden rounded-lg border border-slate-200">
	{#if title}
		<header class="border-b border-slate-200 bg-slate-50 px-5 py-3">
			<h2 class="text-base font-semibold text-slate-900">{title}</h2>
		</header>
	{/if}
	{#if summary}
		<div class="border-b border-slate-200 px-5 py-4">
			{@render summary()}
		</div>
	{/if}
	<div class="divide-y divide-slate-200">
		{@render children()}
	</div>
</section>
