<script lang="ts">
	interface Props {
		text: string;
		isNew?: boolean;
	}

	let { text, isNew = false }: Props = $props();
</script>

<!--
	Visually distinct from claim/scenario text (docs/PHASE2A_IMPLEMENTATION.md
	Section 10) — amber-tinted card with its own "Evidence" eyebrow label,
	never rendered inline with claim/scenario prose. `isNew` gets its own
	visible badge so newly revealed evidence is clearly marked, not just
	appended silently to a growing list.
-->
<div
	class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
	aria-label={isNew ? 'Newly revealed evidence' : 'Evidence'}
>
	<div class="mb-1 flex items-center gap-2">
		<span class="text-xs font-semibold tracking-wide text-amber-800 uppercase">Evidence</span>
		{#if isNew}
			<span
				class="rounded-full bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white"
				role="status"
			>
				New
			</span>
		{/if}
	</div>
	<p class="text-sm text-slate-800">{text}</p>
</div>
