<script lang="ts">
	import { getSubjectProfile } from '$lib/domain/subjectProfiles';
	import { resolve } from '$app/paths';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const visibilityLabel: Record<string, string> = {
		private: 'Private',
		'org-shared': 'Shared with org',
		'public-template': 'Public template'
	};
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
		<ul class="flex flex-col gap-3">
			{#each data.lessons as lesson (lesson.id)}
				<li class="rounded-md border border-slate-200 px-4 py-3">
					<div class="flex items-center justify-between">
						<span class="font-medium text-slate-800">{lesson.title}</span>
						<span class="text-xs text-slate-400">{visibilityLabel[lesson.visibility]}</span>
					</div>
					<p class="mt-1 text-sm text-slate-500">
						{getSubjectProfile(lesson.subject_profile_id)?.name ?? lesson.subject_profile_id}
						{#if lesson.grade_level}
							· Grade {lesson.grade_level}
						{/if}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</main>
