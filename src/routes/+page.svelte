<script lang="ts">
	import { subjectProfiles } from '$lib/domain/subjectProfiles';
	import { ScoringResultSchema, type LessonSource, type ScoringResult } from '$lib/domain/schemas';
	import { nextVersionNumber } from '$lib/domain/versioning';
	import LessonInputForm from '$lib/components/LessonInputForm.svelte';
	import ScoreDisplay from '$lib/components/ScoreDisplay.svelte';
	import SkillChecklist from '$lib/components/SkillChecklist.svelte';
	import SuggestionList from '$lib/components/SuggestionList.svelte';
	import BeforeAfterView from '$lib/components/BeforeAfterView.svelte';
	import HonestyNote from '$lib/components/HonestyNote.svelte';
	import SaveLessonForm from '$lib/components/SaveLessonForm.svelte';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Phase = 'input' | 'loading' | 'results';

	let phase = $state<Phase>('input');
	let lessonText = $state('');
	let subjectProfileId = $state(subjectProfiles[0].id);
	let lastSource = $state<LessonSource>('paste');
	let currentResult = $state<ScoringResult | null>(null);
	let previousResult = $state<ScoringResult | null>(null);
	let versions = $state<{ versionNumber: number }[]>([]);
	let errorMessage = $state<string | null>(null);
	let resultsHeading: HTMLHeadingElement | undefined = $state();

	const orgOption = $derived(
		data.membership
			? { orgId: data.membership.org_id as string, orgName: data.membership.orgs?.name ?? '' }
			: null
	);

	$effect(() => {
		if (phase === 'results') resultsHeading?.focus();
	});

	async function handleSubmit(input: {
		lessonText: string;
		subjectProfileId: string;
		source: LessonSource;
	}) {
		phase = 'loading';
		errorMessage = null;
		lastSource = input.source;

		try {
			const response = await fetch('/api/lessons/score', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lessonText: input.lessonText,
					subjectProfileId: input.subjectProfileId,
					lessonVersionId: crypto.randomUUID()
				})
			});
			const body = await response.json();

			if (!response.ok) {
				errorMessage = body.error?.message ?? 'Something went wrong scoring this lesson.';
				phase = currentResult ? 'results' : 'input';
				return;
			}

			const result = ScoringResultSchema.parse(body);
			if (currentResult) previousResult = currentResult;
			currentResult = result;
			versions = [...versions, { versionNumber: nextVersionNumber(versions) }];
			phase = 'results';
		} catch {
			errorMessage = 'Something went wrong scoring this lesson. Please try again.';
			phase = currentResult ? 'results' : 'input';
		}
	}

	function handleRevise() {
		errorMessage = null;
		phase = 'input';
	}

	function handleStartOver() {
		lessonText = '';
		subjectProfileId = subjectProfiles[0].id;
		currentResult = null;
		previousResult = null;
		versions = [];
		errorMessage = null;
		phase = 'input';
	}
</script>

<svelte:head>
	<title>Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<header>
		<h1 class="text-3xl font-semibold text-slate-900">Chiron</h1>
		<p class="mt-1 text-slate-600">
			Score a lesson plan against a peer-reviewed critical-thinking framework and get
			subject-specific suggestions for making it stronger.
		</p>
	</header>

	{#if errorMessage}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>
	{/if}

	{#if phase === 'input'}
		<LessonInputForm
			bind:lessonText
			bind:subjectProfileId
			submitLabel={currentResult ? 'Rescore this lesson' : 'Score this lesson'}
			onSubmit={handleSubmit}
		/>
	{:else if phase === 'loading'}
		<p role="status" aria-live="polite" class="text-sm text-slate-600">Scoring your lesson…</p>
	{:else if phase === 'results' && currentResult}
		<section class="flex flex-col gap-8">
			<div class="flex items-center justify-between">
				<h2
					bind:this={resultsHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					Results — Version {versions.length}
				</h2>
			</div>

			{#if previousResult}
				<div>
					<h3 class="mb-2 text-sm font-medium text-slate-800">Before → After</h3>
					<BeforeAfterView before={previousResult.score} after={currentResult.score} />
				</div>
			{/if}

			<div>
				<h3 class="mb-3 text-sm font-medium text-slate-800">Pillar scores</h3>
				<ScoreDisplay score={currentResult.score} />
			</div>

			<div>
				<h3 class="mb-3 text-sm font-medium text-slate-800">Critical-thinking skills</h3>
				<SkillChecklist skillCoverage={currentResult.skillCoverage} />
			</div>

			<div>
				<h3 class="mb-3 text-sm font-medium text-slate-800">Suggestions</h3>
				<SuggestionList suggestions={currentResult.suggestions} />
			</div>

			<HonestyNote />

			{#if data.user}
				<SaveLessonForm
					{lessonText}
					{subjectProfileId}
					source={lastSource}
					scoringResult={currentResult}
					{orgOption}
				/>
			{:else}
				<p class="text-sm text-slate-500">
					<a href={resolve('/login?redirect=/')} class="underline">Log in</a> to save this lesson to your
					library.
				</p>
			{/if}

			<div class="flex gap-3">
				<button
					type="button"
					onclick={handleRevise}
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Revise &amp; resubmit
				</button>
				<button
					type="button"
					onclick={handleStartOver}
					class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Start over with a new lesson
				</button>
			</div>
		</section>
	{/if}
</main>
