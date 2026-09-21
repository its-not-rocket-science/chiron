<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { getSubjectProfile } from '$lib/domain/subjectProfiles';
	import {
		ScoringResultSchema,
		type PillarId,
		type Score,
		type SkillCoverageEntry,
		type Suggestion
	} from '$lib/domain/schemas';
	import type { CTSkillId } from '$lib/domain/taxonomy';
	import LessonInputForm from '$lib/components/LessonInputForm.svelte';
	import ScoreDisplay from '$lib/components/ScoreDisplay.svelte';
	import SkillChecklist from '$lib/components/SkillChecklist.svelte';
	import SuggestionList from '$lib/components/SuggestionList.svelte';
	import BeforeAfterView from '$lib/components/BeforeAfterView.svelte';
	import HonestyNote from '$lib/components/HonestyNote.svelte';
	import LicenseBadge from '$lib/components/LicenseBadge.svelte';
	import ReportCard from '$lib/components/ReportCard.svelte';
	import ReportSection from '$lib/components/ReportSection.svelte';
	import PillarSummaryStrip from '$lib/components/PillarSummaryStrip.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const visibilityLabel: Record<string, string> = {
		private: 'Private',
		'org-shared': 'Shared with org',
		'public-template': 'Public template'
	};

	function toScore(
		scores: NonNullable<NonNullable<typeof data.lesson.lesson_versions>['scores']>
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
			NonNullable<typeof data.lesson.lesson_versions>['scores']
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
		items: NonNullable<NonNullable<typeof data.lesson.lesson_versions>['scores']>['suggestions']
	): Suggestion[] {
		return items.map((s) => ({
			id: s.id,
			scoreId: '',
			pillar: s.pillar as PillarId,
			text: s.text,
			suggestedScriptSwap: null
		}));
	}

	type Phase = 'view' | 'edit' | 'scoring';
	let phase = $state<Phase>('view');
	let deleteConfirming = $state(false);
	let deleting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Local, client-owned copy of "what's currently shown" — updated
	// directly from a successful revise response rather than reloading
	// `data` from the server, so the page doesn't flicker/refetch after an
	// edit. Initialized from the server-loaded lesson.
	let title = $state(untrack(() => data.lesson.title));
	let currentText = $state(untrack(() => data.lesson.lesson_versions?.raw_text ?? ''));
	let currentSubjectProfileId = $state(untrack(() => data.lesson.subject_profile_id));
	let currentGradeLevel = $state(untrack(() => data.lesson.grade_level ?? ''));
	let currentVersionNumber = $state(
		untrack(() => data.lesson.lesson_versions?.version_number ?? 1)
	);
	let currentScoreRow = $state(untrack(() => data.lesson.lesson_versions?.scores ?? null));

	// Edit-form-local state, separate from "current" so cancelling an edit
	// never mutates what's actually shown.
	let editText = $state(untrack(() => currentText));
	let editSubjectProfileId = $state(untrack(() => currentSubjectProfileId));
	let editGradeLevel = $state(untrack(() => currentGradeLevel));

	let previousScore = $state<Score | null>(null);

	function startEdit() {
		editText = currentText;
		editSubjectProfileId = currentSubjectProfileId;
		editGradeLevel = currentGradeLevel;
		errorMessage = null;
		phase = 'edit';
	}

	function cancelEdit() {
		phase = 'view';
		errorMessage = null;
	}

	async function handleResubmit(input: {
		lessonText: string;
		subjectProfileId: string;
		source: 'paste' | 'upload';
	}) {
		phase = 'scoring';
		errorMessage = null;

		try {
			const scoreResponse = await fetch('/api/lessons/score', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					lessonText: input.lessonText,
					subjectProfileId: input.subjectProfileId
				})
			});
			const scoreBody = await scoreResponse.json();
			if (!scoreResponse.ok) {
				errorMessage = scoreBody.error?.message ?? 'Something went wrong scoring this revision.';
				phase = 'edit';
				return;
			}
			const scoringResult = ScoringResultSchema.parse(scoreBody);

			const reviseResponse = await fetch(`/api/lessons/${data.lesson.id}/revise`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					subjectProfileId: input.subjectProfileId,
					gradeLevel: editGradeLevel.trim() || null,
					source: input.source,
					lessonText: input.lessonText,
					scoringResult
				})
			});
			const reviseBody = await reviseResponse.json();
			if (!reviseResponse.ok) {
				errorMessage = reviseBody.error?.message ?? 'Could not save your revision.';
				phase = 'edit';
				return;
			}

			previousScore = currentScoreRow ? toScore(currentScoreRow) : null;
			currentText = input.lessonText;
			currentSubjectProfileId = input.subjectProfileId;
			currentGradeLevel = editGradeLevel.trim();
			currentVersionNumber += 1;
			currentScoreRow = {
				id: scoringResult.score.id,
				dialogue_score: scoringResult.score.dialogueScore,
				dialogue_justification: scoringResult.score.dialogueJustification,
				authenticity_score: scoringResult.score.authenticityScore,
				authenticity_justification: scoringResult.score.authenticityJustification,
				mentoring_score: scoringResult.score.mentoringScore,
				mentoring_justification: scoringResult.score.mentoringJustification,
				model_id: scoringResult.score.modelId,
				prompt_version: scoringResult.score.promptVersion,
				created_at: scoringResult.score.createdAt,
				skill_coverage_entries: scoringResult.skillCoverage.map((sc) => ({
					id: sc.id,
					skill: sc.skill,
					covered: sc.covered,
					confidence: sc.confidence,
					justification: sc.justification
				})),
				suggestions: scoringResult.suggestions.map((s) => ({
					id: s.id,
					pillar: s.pillar,
					text: s.text
				}))
			};
			phase = 'view';
		} catch {
			errorMessage = 'Something went wrong saving your revision. Please try again.';
			phase = 'edit';
		}
	}
</script>

<svelte:head>
	<title>{title} — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<div class="flex items-start justify-between gap-4">
		<div>
			<a href={resolve('/lessons')} class="text-sm text-slate-500 underline hover:text-slate-700"
				>&larr; My lessons</a
			>
			<h1 class="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
			<p class="mt-1 text-sm text-slate-500">
				{getSubjectProfile(currentSubjectProfileId)?.name ?? currentSubjectProfileId}
				{#if currentGradeLevel}
					· Grade {currentGradeLevel}
				{/if}
				· {visibilityLabel[data.lesson.visibility]} · Version {currentVersionNumber}
			</p>
			{#if data.lesson.attribution_name && data.lesson.license}
				<div class="mt-2">
					<LicenseBadge license={data.lesson.license} />
					{#if data.lesson.attribution_url}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- always an external https attribution URL, never an in-app route -->
						<a
							href={data.lesson.attribution_url}
							target="_blank"
							rel="noopener noreferrer"
							class="ml-2 text-sm font-medium text-brand-text underline"
						>
							Source: {data.lesson.attribution_name} ↗
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}
				</div>
			{/if}
		</div>

		{#if data.isOwner && phase === 'view'}
			<div class="flex shrink-0 gap-2">
				<button
					type="button"
					onclick={startEdit}
					class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Edit
				</button>
				{#if !deleteConfirming}
					<button
						type="button"
						onclick={() => (deleteConfirming = true)}
						class="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
					>
						Delete
					</button>
				{/if}
			</div>
		{/if}
	</div>

	{#if deleteConfirming}
		<div class="rounded-md border border-red-200 bg-red-50 px-4 py-3">
			<p class="text-sm text-red-800">
				Delete this lesson permanently? This removes all its saved versions and scores, and cannot
				be undone.
			</p>
			<form
				method="POST"
				action="?/delete"
				class="mt-3 flex gap-2"
				use:enhance={() => {
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
					};
				}}
			>
				<button
					type="submit"
					disabled={deleting}
					class="rounded-md bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-50"
				>
					{deleting ? 'Deleting…' : 'Yes, delete it'}
				</button>
				<button
					type="button"
					onclick={() => (deleteConfirming = false)}
					disabled={deleting}
					class="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
				>
					Cancel
				</button>
			</form>
			{#if form?.error}
				<p role="alert" class="mt-2 text-sm text-red-800">{form.error}</p>
			{/if}
		</div>
	{/if}

	{#if errorMessage}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>
	{/if}

	{#if phase === 'edit'}
		<section class="flex flex-col gap-4">
			<div>
				<label for="edit-grade" class="mb-1 block text-sm font-medium text-slate-700">
					Grade level (optional)
				</label>
				<input
					id="edit-grade"
					type="text"
					bind:value={editGradeLevel}
					placeholder="e.g. 9"
					class="w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<LessonInputForm
				bind:lessonText={editText}
				bind:subjectProfileId={editSubjectProfileId}
				submitLabel="Resubmit for re-scoring"
				onSubmit={handleResubmit}
			/>
			<button
				type="button"
				onclick={cancelEdit}
				class="self-start text-sm text-slate-500 underline hover:text-slate-700"
			>
				Cancel
			</button>
		</section>
	{:else if phase === 'scoring'}
		<p role="status" aria-live="polite" class="text-sm text-slate-600">Scoring your revision…</p>
	{:else}
		<div class="rounded-md bg-slate-50 p-4 font-serif text-base whitespace-pre-wrap text-slate-700">
			{currentText}
		</div>

		{#if previousScore && currentScoreRow}
			<div>
				<h3 class="mb-2 text-sm font-medium text-slate-800">Before → After</h3>
				<BeforeAfterView before={previousScore} after={toScore(currentScoreRow)} />
			</div>
		{/if}

		{#if currentScoreRow}
			{@const scoreRow = currentScoreRow}
			<ReportCard>
				{#snippet summary()}
					<PillarSummaryStrip score={toScore(scoreRow)} />
				{/snippet}
				<ReportSection title="Pillar scores">
					<ScoreDisplay score={toScore(scoreRow)} />
				</ReportSection>
				<ReportSection title="Critical-thinking skills">
					<SkillChecklist skillCoverage={toSkillCoverage(scoreRow.skill_coverage_entries)} />
				</ReportSection>
				{#if scoreRow.suggestions.length > 0}
					<ReportSection title="Suggestions" accent>
						<SuggestionList suggestions={toSuggestions(scoreRow.suggestions)} />
					</ReportSection>
				{/if}
			</ReportCard>

			<HonestyNote />
		{:else}
			<p class="text-sm text-slate-500">This lesson has no scored version yet.</p>
		{/if}
	{/if}
</main>
