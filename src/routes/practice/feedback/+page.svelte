<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import type { UpdateCriterionUnderstandable } from '$lib/domain/userTestFeedback';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let casesUnderstandable = $state<number | null>(null);
	let tutorMadeThink = $state<number | null>(null);
	let newEvidenceMeaningful = $state<number | null>(null);
	let tutorRepetitive = $state<number | null>(null);
	let confidenceUnderstandable = $state<number | null>(null);
	let updateCriterionUnderstandable = $state<UpdateCriterionUnderstandable | null>(null);
	let perceivedSteering = $state<boolean | null>(null);
	let perceivedSteeringExplanation = $state('');
	let wouldContinue = $state<boolean | null>(null);
	let whatWorkedBest = $state('');
	let whatNeedsChanging = $state('');

	let submitting = $state(false);
	let errorMessage = $state<string | null>(null);
	// Only ever needs data's INITIAL value — once true, submitted stays
	// true locally regardless of any later reload of `data` (there is no
	// resubmit-then-un-submit path), and a fresh submit also sets this
	// directly. untrack() is the deliberate, Svelte-endorsed way to take
	// a one-time snapshot from a $derived source into local $state.
	let submitted = $state(untrack(() => data.alreadySubmitted));

	const canSubmit = $derived(
		casesUnderstandable !== null &&
			tutorMadeThink !== null &&
			newEvidenceMeaningful !== null &&
			tutorRepetitive !== null &&
			confidenceUnderstandable !== null &&
			updateCriterionUnderstandable !== null &&
			perceivedSteering !== null &&
			wouldContinue !== null
	);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (!canSubmit) return;
		submitting = true;
		errorMessage = null;
		try {
			const response = await fetch('/api/practice/user-test-feedback', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					testCohort: data.testCohort,
					casesUnderstandable,
					tutorMadeThink,
					newEvidenceMeaningful,
					tutorRepetitive,
					confidenceUnderstandable,
					updateCriterionUnderstandable,
					perceivedSteering,
					perceivedSteeringExplanation: perceivedSteeringExplanation.trim() || null,
					wouldContinue,
					whatWorkedBest: whatWorkedBest.trim() || null,
					whatNeedsChanging: whatNeedsChanging.trim() || null
				})
			});
			const body = await response.json();
			if (!response.ok) {
				errorMessage = body.error?.message ?? 'Something went wrong. Please try again.';
				return;
			}
			submitted = true;
		} catch {
			errorMessage = 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	function ratingLabel(id: string): string {
		return {
			cases: 'How understandable were the cases?',
			think: 'Did the tutor make you think more carefully?',
			evidence: 'Did new evidence feel meaningful?',
			repetitive: 'Did the tutor feel repetitive?',
			confidence: 'Were confidence percentages understandable?'
		}[id]!;
	}
</script>

<svelte:head>
	<title>Feedback — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
	<h1 class="text-2xl font-semibold text-slate-900">Quick feedback</h1>
	<p class="text-slate-600">
		You've completed all three cases — a few quick questions while it's fresh. This takes about a
		minute.
	</p>

	{#if errorMessage}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>
	{/if}

	{#if submitted}
		<p role="status" class="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
			Thanks — your feedback was recorded.
		</p>
		<a
			href={resolve('/practice')}
			class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
		>
			Back to practice cases
		</a>
	{:else}
		<form class="flex flex-col gap-6" onsubmit={handleSubmit}>
			{#each [{ id: 'cases', get: () => casesUnderstandable, set: (v: number) => (casesUnderstandable = v) }, { id: 'think', get: () => tutorMadeThink, set: (v: number) => (tutorMadeThink = v) }, { id: 'evidence', get: () => newEvidenceMeaningful, set: (v: number) => (newEvidenceMeaningful = v) }, { id: 'repetitive', get: () => tutorRepetitive, set: (v: number) => (tutorRepetitive = v) }, { id: 'confidence', get: () => confidenceUnderstandable, set: (v: number) => (confidenceUnderstandable = v) }] as field (field.id)}
				<fieldset class="flex flex-col gap-2">
					<legend class="text-sm font-medium text-slate-800">{ratingLabel(field.id)}</legend>
					<div class="flex gap-2">
						{#each [1, 2, 3, 4, 5] as rating (rating)}
							<label
								class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-sm font-medium text-slate-700 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-900"
							>
								<input
									type="radio"
									name={field.id}
									value={rating}
									checked={field.get() === rating}
									onchange={() => field.set(rating)}
									disabled={submitting}
									class="sr-only"
								/>
								{rating}
							</label>
						{/each}
					</div>
				</fieldset>
			{/each}

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium text-slate-800">
					Did "what would change your mind?" make sense as a question?
				</legend>
				<p class="text-xs text-slate-500">Only applies if you saw that question in one case.</p>
				<div class="flex flex-wrap gap-3">
					{#each [['yes', 'Yes'], ['mostly', 'Mostly'], ['no', 'No'], ['not_applicable', "Didn't see it"]] as [value, label] (value)}
						<label class="flex items-center gap-1.5 text-sm text-slate-700">
							<input
								type="radio"
								name="update-criterion-understandable"
								{value}
								checked={updateCriterionUnderstandable === value}
								onchange={() =>
									(updateCriterionUnderstandable = value as UpdateCriterionUnderstandable)}
								disabled={submitting}
							/>
							{label}
						</label>
					{/each}
				</div>
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium text-slate-800">
					Did Chiron seem to steer you toward a particular answer, rather than just checking your
					reasoning?
				</legend>
				<div class="flex gap-4">
					<label class="flex items-center gap-1.5 text-sm text-slate-700">
						<input
							type="radio"
							name="perceived-steering"
							checked={perceivedSteering === true}
							onchange={() => (perceivedSteering = true)}
							disabled={submitting}
						/>
						Yes
					</label>
					<label class="flex items-center gap-1.5 text-sm text-slate-700">
						<input
							type="radio"
							name="perceived-steering"
							checked={perceivedSteering === false}
							onchange={() => (perceivedSteering = false)}
							disabled={submitting}
						/>
						No
					</label>
				</div>
				{#if perceivedSteering}
					<label for="perceived-steering-explanation" class="sr-only">When did this happen?</label>
					<textarea
						id="perceived-steering-explanation"
						bind:value={perceivedSteeringExplanation}
						disabled={submitting}
						rows="3"
						placeholder="When did this happen?"
						class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
					></textarea>
				{/if}
			</fieldset>

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium text-slate-800">
					Would you voluntarily do another case?
				</legend>
				<div class="flex gap-4">
					<label class="flex items-center gap-1.5 text-sm text-slate-700">
						<input
							type="radio"
							name="would-continue"
							checked={wouldContinue === true}
							onchange={() => (wouldContinue = true)}
							disabled={submitting}
						/>
						Yes
					</label>
					<label class="flex items-center gap-1.5 text-sm text-slate-700">
						<input
							type="radio"
							name="would-continue"
							checked={wouldContinue === false}
							onchange={() => (wouldContinue = false)}
							disabled={submitting}
						/>
						No
					</label>
				</div>
			</fieldset>

			<div>
				<label for="what-worked-best" class="mb-1 block text-sm font-medium text-slate-800">
					What worked best? (optional)
				</label>
				<textarea
					id="what-worked-best"
					bind:value={whatWorkedBest}
					disabled={submitting}
					rows="3"
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
			</div>

			<div>
				<label for="what-needs-changing" class="mb-1 block text-sm font-medium text-slate-800">
					What most needs changing? (optional)
				</label>
				<textarea
					id="what-needs-changing"
					bind:value={whatNeedsChanging}
					disabled={submitting}
					rows="3"
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
			</div>

			<button
				type="submit"
				disabled={!canSubmit || submitting}
				class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
			>
				{submitting ? 'Submitting…' : 'Submit feedback'}
			</button>
		</form>
	{/if}
</main>
