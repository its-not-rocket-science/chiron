<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ScoringResult, LessonSource, Visibility } from '$lib/domain/schemas';

	interface Props {
		lessonText: string;
		subjectProfileId: string;
		source: LessonSource;
		scoringResult: ScoringResult;
		orgOption: { orgId: string; orgName: string } | null;
	}

	let { lessonText, subjectProfileId, source, scoringResult, orgOption }: Props = $props();

	let title = $state('');
	let gradeLevel = $state('');
	let visibility = $state<Visibility>('private');
	let status = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');
	let errorMessage = $state('');
	let savedLessonId = $state<string | null>(null);

	async function handleSave(event: SubmitEvent) {
		event.preventDefault();
		if (!title.trim()) return;

		status = 'saving';
		errorMessage = '';

		try {
			const response = await fetch('/api/lessons', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					title: title.trim(),
					subjectProfileId,
					gradeLevel: gradeLevel.trim() || null,
					visibility,
					orgId: visibility === 'org-shared' ? (orgOption?.orgId ?? null) : null,
					source,
					lessonText,
					scoringResult
				})
			});
			const body = await response.json();

			if (!response.ok) {
				status = 'error';
				errorMessage = body.error?.message ?? 'Could not save this lesson.';
				return;
			}

			status = 'saved';
			savedLessonId = body.lessonId;
		} catch {
			status = 'error';
			errorMessage = 'Could not save this lesson. Please try again.';
		}
	}
</script>

<div class="rounded-md border border-slate-200 p-4">
	<h3 class="mb-3 text-sm font-medium text-slate-800">Save this lesson</h3>

	{#if status === 'saved'}
		<p role="status" class="text-sm text-slate-600">
			Saved. <a href={resolve('/lessons')} class="underline">View in my lessons</a>
			{#if savedLessonId}
				<span class="sr-only">(id {savedLessonId})</span>
			{/if}
		</p>
	{:else}
		{#if errorMessage}
			<p role="alert" class="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
				{errorMessage}
			</p>
		{/if}

		<form class="flex flex-col gap-3" onsubmit={handleSave}>
			<div>
				<label for="save-title" class="mb-1 block text-xs font-medium text-slate-700">Title</label>
				<input
					id="save-title"
					type="text"
					bind:value={title}
					required
					placeholder="e.g. Density of Liquids Lab"
					class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<div class="flex gap-3">
				<div class="flex-1">
					<label for="save-grade" class="mb-1 block text-xs font-medium text-slate-700">
						Grade level (optional)
					</label>
					<input
						id="save-grade"
						type="text"
						bind:value={gradeLevel}
						placeholder="e.g. 9"
						class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
				</div>
				<div class="flex-1">
					<label for="save-visibility" class="mb-1 block text-xs font-medium text-slate-700">
						Visibility
					</label>
					<select
						id="save-visibility"
						bind:value={visibility}
						class="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					>
						<option value="private">Private — only you</option>
						{#if orgOption}
							<option value="org-shared">Shared with {orgOption.orgName}</option>
						{/if}
						<option value="public-template">Public template — any Chiron user</option>
					</select>
				</div>
			</div>
			<button
				type="submit"
				disabled={status === 'saving' || !title.trim()}
				class="self-start rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{status === 'saving' ? 'Saving…' : 'Save'}
			</button>
		</form>
	{/if}
</div>
