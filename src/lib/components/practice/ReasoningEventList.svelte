<script lang="ts">
	interface ReasoningEventDisplay {
		explanation: string;
		affectedSkills: readonly string[];
		evidenceQuote?: string | null;
	}

	interface Props {
		events: readonly ReasoningEventDisplay[];
	}

	let { events }: Props = $props();

	const SKILL_LABELS: Record<string, string> = {
		interpretation: 'Interpretation',
		analysis: 'Analysis',
		evaluation: 'Evaluation',
		inference: 'Inference',
		explanation: 'Explanation',
		self_regulation: 'Self-regulation'
	};
</script>

{#if events.length === 0}
	<p class="text-sm text-slate-500">
		No specific reasoning moves were detected in your final response this time — that doesn't mean
		your thinking was wrong, just that this pass didn't find a clear example to point to.
	</p>
{:else}
	<ul class="flex flex-col gap-3">
		{#each events as event, i (i)}
			<li class="rounded-md border border-slate-200 px-4 py-3">
				<p class="text-sm text-slate-800">{event.explanation}</p>
				{#if event.evidenceQuote}
					<p class="mt-1.5 text-sm text-slate-500 italic">"{event.evidenceQuote}"</p>
				{/if}
				{#if event.affectedSkills.length > 0}
					<div class="mt-2 flex flex-wrap gap-1.5">
						{#each event.affectedSkills as skill (skill)}
							<span
								class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800"
							>
								{SKILL_LABELS[skill] ?? skill}
							</span>
						{/each}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
