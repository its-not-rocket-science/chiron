<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const DIFFICULTY_LABELS: Record<string, string> = {
		intro: 'Intro',
		core: 'Core',
		stretch: 'Stretch'
	};
	const SKILL_LABELS: Record<string, string> = {
		interpretation: 'Interpretation',
		analysis: 'Analysis',
		evaluation: 'Evaluation',
		inference: 'Inference',
		explanation: 'Explanation',
		self_regulation: 'Self-regulation'
	};
</script>

<svelte:head>
	<title>Practice — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-slate-900">Practice cases</h1>
		<p class="mt-1 text-slate-600">
			Investigate a real-feeling scenario, commit to a judgement, and see how it holds up once the
			rest of the evidence comes in.
		</p>
	</header>

	<ul class="flex flex-col gap-4">
		{#each data.cases as practiceCase (practiceCase.id)}
			<li class="rounded-md border border-slate-200 px-5 py-4">
				<div class="flex items-start justify-between gap-3">
					<h2 class="text-lg font-medium text-slate-900">{practiceCase.title}</h2>
					<span
						class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
					>
						{DIFFICULTY_LABELS[practiceCase.difficulty] ?? practiceCase.difficulty}
					</span>
				</div>
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each practiceCase.skillTags as skill (skill)}
						<span class="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800">
							{SKILL_LABELS[skill] ?? skill}
						</span>
					{/each}
				</div>
				<a
					href={resolve('/practice/[caseId]', { caseId: practiceCase.id })}
					class="mt-3 inline-block rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Start investigation
				</a>
			</li>
		{/each}
	</ul>
</main>
