<script lang="ts">
	import { getSubjectProfile, subjectProfiles } from '$lib/domain/subjectProfiles';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const visibilityLabel: Record<string, string> = {
		private: 'Private',
		'org-shared': 'Shared with org',
		'public-template': 'Public template'
	};

	// prompt.txt Prompt G5 point 1: client-side search/filter over the
	// already-fetched list — fine at today's scale (this page shows a
	// handful of lessons per teacher). Move filtering server-side (a
	// `load` query param, same shape as /library's filters.ts) once a
	// user's lesson count makes fetching the full list on every load
	// impractical — a reasonable threshold to revisit at is roughly
	// 200+ lessons for one user, well past what this UI stays usable for
	// as a flat list either way.
	let searchTerm = $state('');
	let subjectFilter = $state('');

	let filteredLessons = $derived(
		data.lessons.filter((lesson) => {
			const matchesSearch =
				searchTerm.trim() === '' ||
				lesson.title.toLowerCase().includes(searchTerm.trim().toLowerCase());
			const matchesSubject = subjectFilter === '' || lesson.subject_profile_id === subjectFilter;
			return matchesSearch && matchesSubject;
		})
	);
</script>

<svelte:head>
	<title>My lessons — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
	<div class="flex items-center justify-between">
		<h1 class="text-2xl font-semibold text-slate-900">My lessons</h1>
		<a href={resolve('/')} class="text-sm text-slate-600 underline hover:text-slate-900"
			>Score a new lesson</a
		>
	</div>

	{#if data.lessons.length === 0}
		<p class="text-sm text-slate-500">You haven't saved any lessons yet.</p>
	{:else}
		<div class="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-4">
			<div class="flex-1">
				<label for="lesson-search" class="mb-1 block text-xs font-medium text-slate-700"
					>Search by title</label
				>
				<input
					id="lesson-search"
					type="text"
					bind:value={searchTerm}
					placeholder="e.g. density lab"
					class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<div>
				<label for="lesson-subject-filter" class="mb-1 block text-xs font-medium text-slate-700"
					>Subject</label
				>
				<select
					id="lesson-subject-filter"
					bind:value={subjectFilter}
					class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
				>
					<option value="">All subjects</option>
					{#each subjectProfiles as profile (profile.id)}
						<option value={profile.id}>{profile.name}</option>
					{/each}
				</select>
			</div>
		</div>

		{#if filteredLessons.length === 0}
			<p class="text-sm text-slate-500">No lessons match your search.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each filteredLessons as lesson (lesson.id)}
					<li class="rounded-md border border-slate-200 px-4 py-3">
						<div class="flex items-center justify-between">
							<a
								href={resolve('/lessons/[id]', { id: lesson.id })}
								class="font-medium text-slate-800 underline hover:text-slate-900">{lesson.title}</a
							>
							<span class="text-xs text-slate-400">{visibilityLabel[lesson.visibility]}</span>
						</div>
						<p class="mt-1 text-sm text-slate-500">
							{getSubjectProfile(lesson.subject_profile_id)?.name ?? lesson.subject_profile_id}
							{#if lesson.grade_level}
								· Grade {lesson.grade_level}
							{/if}
						</p>
						{#if lesson.isStale}
							<p class="mt-1.5 text-xs text-amber-700">
								Scored with an earlier version of Chiron's rubric —
								<a
									href={resolve('/lessons/[id]', { id: lesson.id })}
									class="underline hover:text-amber-900">re-score for the latest feedback</a
								>.
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>
