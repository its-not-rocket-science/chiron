<script lang="ts">
	interface Props {
		value: number;
		label: string;
		id: string;
		disabled?: boolean;
	}

	let { value = $bindable(), label, id, disabled = false }: Props = $props();
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-baseline justify-between">
		<label for={id} class="text-base font-medium text-slate-800">{label}</label>
		<output for={id} class="text-sm font-semibold text-slate-900 tabular-nums">{value}%</output>
	</div>
	<input
		{id}
		type="range"
		min="0"
		max="100"
		step="5"
		bind:value
		{disabled}
		aria-valuetext={`${value} percent confident`}
		class="w-full accent-indigo-600 disabled:opacity-60"
	/>
	<div class="flex justify-between text-xs text-slate-400">
		<span>Not confident at all</span>
		<span>Completely confident</span>
	</div>
</div>
