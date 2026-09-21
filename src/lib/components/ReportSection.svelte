<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		/** docs/DESIGN.md — gold tint marks the one actionable section (Suggestions): "what to do next," not decoration. */
		accent?: boolean;
		children: Snippet;
	}

	let { title, accent = false, children }: Props = $props();
</script>

<div class="px-5 py-4 {accent ? 'bg-brand-gold-tint' : ''}">
	<h3
		class="mb-3 text-sm font-medium {accent
			? 'flex items-center gap-1.5 text-slate-800'
			: 'text-slate-800'}"
	>
		{#if accent}<span class="text-brand-gold" aria-hidden="true">▌</span>{/if}
		{title}
	</h3>
	{@render children()}
</div>
