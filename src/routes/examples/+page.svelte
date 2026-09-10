<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { getSubjectProfile } from '$lib/domain/subjectProfiles';
	import type { PillarId, Score, SkillCoverageEntry, Suggestion } from '$lib/domain/schemas';
	import type { CTSkillId } from '$lib/domain/taxonomy';
	import ScoreDisplay from '$lib/components/ScoreDisplay.svelte';
	import SkillChecklist from '$lib/components/SkillChecklist.svelte';
	import SuggestionList from '$lib/components/SuggestionList.svelte';
	import LicenseBadge from '$lib/components/LicenseBadge.svelte';
	import HonestyNote from '$lib/components/HonestyNote.svelte';
	import type { ActionData, PageProps } from './$types';

	let { data, form }: PageProps & { form: ActionData } = $props();
	let submittingId = $state<string | null>(null);

	function subjectName(id: string): string {
		return getSubjectProfile(id)?.name ?? id;
	}

	function toScore(
		scores: NonNullable<NonNullable<(typeof data.examples)[number]['lesson_versions']>['scores']>
	): Score {
		return {
			id: scores.id,
			lessonVersionId: '',
			dialogueScore: scores.dialogue_score,
			dialogueJustification: scores.dialogue_justification,
			authenticityScore: scores.authenticity_score,
			authenticityJustification: scores.authenticity_justification,
			mentoringScore: scores.mentoring_score,
			mentoringJustification: scores.mentoring_justification,
			modelId: scores.model_id,
			promptVersion: scores.prompt_version ?? 'unknown',
			createdAt: scores.created_at
		};
	}

	function toSkillCoverage(
		entries: NonNullable<
			NonNullable<(typeof data.examples)[number]['lesson_versions']>['scores']
		>['skill_coverage_entries']
	): SkillCoverageEntry[] {
		return entries.map((e) => ({
			id: e.id,
			scoreId: '',
			skill: e.skill as CTSkillId,
			covered: e.covered,
			confidence: e.confidence,
			justification: e.justification
		}));
	}

	function toSuggestions(
		items: NonNullable<
			NonNullable<(typeof data.examples)[number]['lesson_versions']>['scores']
		>['suggestions']
	): Suggestion[] {
		return items.map((s) => ({
			id: s.id,
			scoreId: '',
			pillar: s.pillar as PillarId,
			text: s.text,
			// Never persisted for any lesson today (src/routes/api/lessons/+server.ts
			// drops it the same way when saving a regular lesson) — nothing to read back.
			suggestedScriptSwap: null
		}));
	}
</script>

<svelte:head>
	<title>Example lessons — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-slate-900">Example lessons</h1>
		<p class="mt-1 text-slate-600">
			A few real, openly-licensed lesson plans, scored by Chiron, so you can see how the framework
			applies before submitting your own. See
			<a href={resolve('/')} class="underline">the main page</a> to score a lesson of your own.
		</p>
	</header>

	{#if data.examples.length === 0}
		<p class="text-sm text-slate-500">No example lessons are available yet.</p>
	{/if}

	{#each data.examples as example (example.id)}
		<article class="flex flex-col gap-6 rounded-md border border-slate-200 p-6">
			<div class="flex flex-col gap-2">
				<h2 class="text-lg font-semibold text-slate-900">{example.title}</h2>
				<p class="text-sm text-slate-500">{subjectName(example.subject_profile_id)}</p>
				<div class="flex flex-wrap items-center gap-2">
					<LicenseBadge license={example.license} />
					<!-- eslint-disable svelte/no-navigation-without-resolve -- always an external https attribution URL (LessonSchema requires it), never an in-app route -->
					<a
						href={example.attribution_url}
						target="_blank"
						rel="noopener noreferrer"
						class="text-sm font-medium text-indigo-700 underline"
					>
						Source: {example.attribution_name} ↗
					</a>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				</div>
				{#if example.license_note}
					<p class="text-xs text-slate-500">{example.license_note}</p>
				{/if}
			</div>

			<div class="rounded-md bg-slate-50 p-4 text-sm whitespace-pre-wrap text-slate-700">
				{example.lesson_versions?.raw_text ?? ''}
			</div>

			{#if example.lesson_versions?.scores}
				{@const scores = example.lesson_versions.scores}
				<div>
					<h3 class="mb-3 text-sm font-medium text-slate-800">Pillar scores</h3>
					<ScoreDisplay score={toScore(scores)} />
				</div>

				<div>
					<h3 class="mb-3 text-sm font-medium text-slate-800">Critical-thinking skills</h3>
					<SkillChecklist skillCoverage={toSkillCoverage(scores.skill_coverage_entries)} />
				</div>

				{#if scores.suggestions.length > 0}
					<div>
						<h3 class="mb-3 text-sm font-medium text-slate-800">Suggestions</h3>
						<SuggestionList suggestions={toSuggestions(scores.suggestions)} />
					</div>
				{/if}
			{/if}

			<HonestyNote />

			<form
				method="POST"
				action="?/duplicate"
				use:enhance={() => {
					submittingId = example.id;
					return async ({ update }) => {
						await update();
						submittingId = null;
					};
				}}
			>
				<input type="hidden" name="lessonId" value={example.id} />
				<button
					type="submit"
					disabled={submittingId === example.id}
					class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
				>
					{submittingId === example.id ? 'Copying…' : 'Duplicate and try your own edit'}
				</button>
			</form>

			{#if form?.sourceLessonId === example.id}
				{#if form.error}
					<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
						{form.error}
					</p>
				{:else if form.copiedLessonId}
					<p role="status" class="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">
						Copied to your lessons. <a href={resolve('/lessons')} class="underline">View it</a>.
					</p>
				{/if}
			{/if}
		</article>
	{/each}
</main>
