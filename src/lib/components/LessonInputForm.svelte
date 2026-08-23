<script lang="ts">
	import { subjectProfiles } from '$lib/domain/subjectProfiles';

	interface Props {
		lessonText: string;
		subjectProfileId: string;
		disabled?: boolean;
		submitLabel?: string;
		onSubmit: (input: {
			lessonText: string;
			subjectProfileId: string;
			source: 'paste' | 'upload';
		}) => void;
	}

	let {
		lessonText = $bindable(),
		subjectProfileId = $bindable(),
		disabled = false,
		submitLabel = 'Score this lesson',
		onSubmit
	}: Props = $props();

	let uploadStatus = $state<'idle' | 'uploading' | 'error'>('idle');
	let uploadError = $state('');
	let fileInput: HTMLInputElement | undefined = $state();
	let source = $state<'paste' | 'upload'>('paste');

	async function handleFileChange(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		uploadStatus = 'uploading';
		uploadError = '';

		try {
			const formData = new FormData();
			formData.append('file', file);
			const response = await fetch('/api/lessons/upload', { method: 'POST', body: formData });
			const body = await response.json();

			if (!response.ok) {
				uploadStatus = 'error';
				uploadError = body.error?.message ?? 'Something went wrong reading that file.';
				return;
			}

			lessonText = body.text;
			uploadStatus = 'idle';
			source = 'upload';
		} catch {
			uploadStatus = 'error';
			uploadError = 'Something went wrong reading that file. Please try again.';
		} finally {
			if (fileInput) fileInput.value = '';
		}
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!lessonText.trim() || !subjectProfileId) return;
		onSubmit({ lessonText, subjectProfileId, source });
	}

	const isBusy = $derived(disabled || uploadStatus === 'uploading');
</script>

<form class="flex flex-col gap-6" onsubmit={handleSubmit}>
	<div>
		<label for="subject-profile" class="mb-1 block text-sm font-medium text-slate-700">
			Subject
		</label>
		<select
			id="subject-profile"
			bind:value={subjectProfileId}
			disabled={isBusy}
			class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
		>
			{#each subjectProfiles as profile (profile.id)}
				<option value={profile.id}>{profile.name}</option>
			{/each}
		</select>
	</div>

	<div>
		<label for="lesson-text" class="mb-1 block text-sm font-medium text-slate-700">
			Lesson plan
		</label>
		<textarea
			id="lesson-text"
			bind:value={lessonText}
			disabled={isBusy}
			oninput={() => (source = 'paste')}
			rows="12"
			placeholder="Paste or type your lesson plan here..."
			class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
		></textarea>
	</div>

	<div>
		<label for="lesson-file" class="mb-1 block text-sm font-medium text-slate-700">
			Or upload a .docx / .pdf file
		</label>
		<input
			id="lesson-file"
			bind:this={fileInput}
			type="file"
			accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
			disabled={isBusy}
			onchange={handleFileChange}
			class="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-60"
		/>
		{#if uploadStatus === 'uploading'}
			<p class="mt-1 text-xs text-slate-500" role="status">Reading file…</p>
		{/if}
		{#if uploadStatus === 'error'}
			<p class="mt-1 text-xs text-red-700" role="alert">{uploadError}</p>
		{/if}
	</div>

	<button
		type="submit"
		disabled={isBusy || !lessonText.trim()}
		class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
	>
		{submitLabel}
	</button>
</form>
