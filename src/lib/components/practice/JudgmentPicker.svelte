<script lang="ts">
	import {
		evidenceSupportJudgmentOrder,
		type EvidenceSupportJudgment
	} from '$lib/domain/practiceSchemas';

	interface Props {
		value: EvidenceSupportJudgment | null;
		legend: string;
		name: string;
		disabled?: boolean;
	}

	let { value = $bindable(), legend, name, disabled = false }: Props = $props();

	// Deliberately no color-coding by position on the scale, and
	// 'uncertain' gets no different treatment than any other option —
	// it's a legitimate choice, not a fallback (docs/PHASE2A_IMPLEMENTATION.md
	// Section 10's UX principles, `prompts.txt` Prompt 28).
	const LABELS: Record<EvidenceSupportJudgment, string> = {
		strongly_unsupported: 'Strongly unsupported',
		somewhat_unsupported: 'Somewhat unsupported',
		uncertain: 'Uncertain',
		somewhat_supported: 'Somewhat supported',
		strongly_supported: 'Strongly supported'
	};
</script>

<fieldset class="flex flex-col gap-3" {disabled}>
	<legend class="mb-1 text-base font-medium text-slate-800">{legend}</legend>
	<div class="grid grid-cols-1 gap-2 sm:grid-cols-5">
		{#each evidenceSupportJudgmentOrder as judgment (judgment)}
			<label
				class="flex cursor-pointer items-center justify-center rounded-md border border-slate-300 px-3 py-3 text-center text-sm font-medium text-slate-700 hover:bg-slate-50 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-900 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
			>
				<input
					type="radio"
					{name}
					value={judgment}
					checked={value === judgment}
					{disabled}
					onchange={() => (value = judgment)}
					class="sr-only"
				/>
				{LABELS[judgment]}
			</label>
		{/each}
	</div>
</fieldset>
