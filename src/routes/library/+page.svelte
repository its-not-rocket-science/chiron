<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { getSubjectProfile, subjectProfiles } from '$lib/domain/subjectProfiles';
	import HonestyNote from '$lib/components/HonestyNote.svelte';
	import type { ActionData, PageProps } from './$types';

	let { data, form }: PageProps & { form: ActionData } = $props();
	let submittingId = $state<string | null>(null);

	const scoreOptions = [0, 1, 2, 3];

	function subjectName(id: string): string {
		return getSubjectProfile(id)?.name ?? id;
	}
</script>

<svelte:head>
	<title>Shared library — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<h1 class="text-2xl font-semibold text-slate-900">Shared library</h1>
	<HonestyNote />

	{#if form?.error}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
	{/if}
	{#if form?.copiedLessonId}
		<p role="status" class="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">
			Copied to your lessons. <a href={resolve('/lessons')} class="underline">View it</a>.
		</p>
	{/if}

	<form method="GET" class="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 p-4">
		<div>
			<label for="filter-subject" class="mb-1 block text-xs font-medium text-slate-700"
				>Subject</label
			>
			<select
				id="filter-subject"
				name="subject"
				value={data.filters.subjectProfileId}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
			>
				<option value="">All subjects</option>
				{#each subjectProfiles as profile (profile.id)}
					<option value={profile.id}>{profile.name}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="filter-grade" class="mb-1 block text-xs font-medium text-slate-700"
				>Grade level</label
			>
			<input
				id="filter-grade"
				name="grade"
				type="text"
				value={data.filters.gradeLevel}
				placeholder="e.g. 9"
				class="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
			/>
		</div>
		<div>
			<label for="filter-dialogue" class="mb-1 block text-xs font-medium text-slate-700">
				Min. dialogue
			</label>
			<select
				id="filter-dialogue"
				name="minDialogue"
				value={data.filters.minDialogue}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
			>
				{#each scoreOptions as score (score)}
					<option value={score}>{score === 0 ? 'Any' : `${score}+`}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="filter-authenticity" class="mb-1 block text-xs font-medium text-slate-700">
				Min. authenticity
			</label>
			<select
				id="filter-authenticity"
				name="minAuthenticity"
				value={data.filters.minAuthenticity}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
			>
				{#each scoreOptions as score (score)}
					<option value={score}>{score === 0 ? 'Any' : `${score}+`}</option>
				{/each}
			</select>
		</div>
		<div>
			<label for="filter-mentoring" class="mb-1 block text-xs font-medium text-slate-700">
				Min. mentoring
			</label>
			<select
				id="filter-mentoring"
				name="minMentoring"
				value={data.filters.minMentoring}
				class="rounded-md border border-slate-300 px-3 py-1.5 text-sm"
			>
				{#each scoreOptions as score (score)}
					<option value={score}>{score === 0 ? 'Any' : `${score}+`}</option>
				{/each}
			</select>
		</div>
		<button
			type="submit"
			class="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
		>
			Filter
		</button>
	</form>

	<section>
		<h2 class="mb-3 text-sm font-medium text-slate-800">
			{data.myOrgName ? `${data.myOrgName} — shared with your org` : "Your org's shared lessons"}
		</h2>
		{#if !data.myOrgName}
			<p class="text-sm text-slate-500">
				You're not part of an org yet — see "My org" to create or join one.
			</p>
		{:else if data.orgLessons.length === 0}
			<p class="text-sm text-slate-500">No lessons match these filters.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.orgLessons as lesson (lesson.id)}
					<li class="rounded-md border border-slate-200 p-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								{#if lesson.featured}
									<span
										class="mb-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
									>
										Featured
									</span>
								{/if}
								<h3 class="font-medium text-slate-800">{lesson.title}</h3>
								<p class="text-sm text-slate-500">
									{subjectName(lesson.subject_profile_id)}
									{#if lesson.grade_level}
										· Grade {lesson.grade_level}
									{/if}
									· by {lesson.profiles?.display_name ?? 'a teacher'}
								</p>
								{#if lesson.lesson_versions?.scores}
									{@const s = lesson.lesson_versions.scores}
									<p class="mt-1 text-xs text-slate-400">
										Dialogue {s.dialogue_score} · Authenticity {s.authenticity_score} · Mentoring {s.mentoring_score}
									</p>
								{/if}
							</div>
							<form
								method="POST"
								action="?/saveCopy"
								use:enhance={() => {
									submittingId = lesson.id;
									return async ({ update }) => {
										await update();
										submittingId = null;
									};
								}}
							>
								<input type="hidden" name="lessonId" value={lesson.id} />
								<button
									type="submit"
									disabled={submittingId === lesson.id}
									class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								>
									{submittingId === lesson.id ? 'Copying…' : 'Save a copy'}
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2 class="mb-3 text-sm font-medium text-slate-800">Public templates</h2>
		<p class="mb-3 text-xs text-slate-400">Visible to any signed-in Chiron user, from any org.</p>
		{#if data.publicLessons.length === 0}
			<p class="text-sm text-slate-500">No public templates match these filters.</p>
		{:else}
			<ul class="flex flex-col gap-3">
				{#each data.publicLessons as lesson (lesson.id)}
					<li class="rounded-md border border-slate-200 p-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								<h3 class="font-medium text-slate-800">{lesson.title}</h3>
								<p class="text-sm text-slate-500">
									{subjectName(lesson.subject_profile_id)}
									{#if lesson.grade_level}
										· Grade {lesson.grade_level}
									{/if}
									· by {lesson.profiles?.display_name ?? 'a teacher'}
								</p>
								{#if lesson.lesson_versions?.scores}
									{@const s = lesson.lesson_versions.scores}
									<p class="mt-1 text-xs text-slate-400">
										Dialogue {s.dialogue_score} · Authenticity {s.authenticity_score} · Mentoring {s.mentoring_score}
									</p>
								{/if}
							</div>
							<form
								method="POST"
								action="?/saveCopy"
								use:enhance={() => {
									submittingId = lesson.id;
									return async ({ update }) => {
										await update();
										submittingId = null;
									};
								}}
							>
								<input type="hidden" name="lessonId" value={lesson.id} />
								<button
									type="submit"
									disabled={submittingId === lesson.id}
									class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								>
									{submittingId === lesson.id ? 'Copying…' : 'Save a copy'}
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
