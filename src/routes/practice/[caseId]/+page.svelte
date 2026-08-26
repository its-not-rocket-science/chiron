<script lang="ts">
	import { resolve } from '$app/paths';
	import { dispositionClusters } from '$lib/domain/taxonomy';
	import {
		FREE_TEXT_MAX_LENGTH,
		type EvidenceSupportJudgment,
		type LearnerJudgment,
		type PublicPracticeCase,
		type ScoringEvent,
		type SignalClassification,
		type UpdateCriterionConsistencyResult
	} from '$lib/domain/practiceSchemas';
	import JudgmentPicker from '$lib/components/practice/JudgmentPicker.svelte';
	import ConfidenceSlider from '$lib/components/practice/ConfidenceSlider.svelte';
	import EvidenceCard from '$lib/components/practice/EvidenceCard.svelte';
	import ReasoningEventList from '$lib/components/practice/ReasoningEventList.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Step =
		| 'starting'
		| 'error'
		| 'intro'
		| 'scenario'
		| 'claim'
		| 'initial_judgment'
		| 'initial_reasoning'
		| 'initial_confidence'
		| 'update_criterion'
		| 'challenge'
		| 'revised_judgment'
		| 'revised_reasoning'
		| 'revised_confidence'
		| 'reflection'
		| 'disposition_checkin'
		| 'complete';

	interface CaseResult {
		outcome: 'correct' | 'incorrect';
		teachingExplanation: string;
		initialJudgment: LearnerJudgment;
		revisedJudgment: LearnerJudgment;
		scoringEvents: ScoringEvent[];
		updateCriterion: {
			text: string;
			classification: SignalClassification | null;
			consistency: UpdateCriterionConsistencyResult;
		} | null;
		pushFurtherHints: string[];
	}

	interface EvidenceEntry {
		text: string;
		isNew: boolean;
	}

	let step = $state<Step>('starting');
	let errorMessage = $state<string | null>(null);
	let submitting = $state(false);

	let sessionId = $state<string | null>(null);
	let publicCase = $state<PublicPracticeCase | null>(null);

	let initialJudgment = $state<EvidenceSupportJudgment | null>(null);
	let initialReasoning = $state('');
	let initialConfidence = $state(50);
	let capturedInitialJudgment = $state<LearnerJudgment | null>(null);

	let updateCriterionText = $state('');

	let evidenceSoFar = $state<EvidenceEntry[]>([]);
	let tutorQuestion = $state<string | null>(null);
	let challengeResponse = $state('');

	let revisedJudgment = $state<EvidenceSupportJudgment | null>(null);
	let revisedReasoning = $state('');
	let revisedConfidence = $state(50);

	let reflectionText = $state('');
	let dispositionResponse = $state(3);
	let caseResult = $state<CaseResult | null>(null);

	let stepHeading: HTMLHeadingElement | undefined = $state();

	$effect(() => {
		void step;
		stepHeading?.focus();
	});

	const dispositionItem = $derived.by(() => {
		if (!publicCase) return '';
		const cluster = dispositionClusters.find((c) => publicCase!.dispositionTags.includes(c.id));
		return cluster?.items[0] ?? 'Sticking with a hard problem';
	});

	async function post(url: string, body: unknown) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		});
		const json = await response.json();
		if (!response.ok) {
			throw new Error(json.error?.message ?? 'Something went wrong. Please try again.');
		}
		return json;
	}

	async function startSession() {
		step = 'starting';
		errorMessage = null;
		try {
			const json = await post('/api/practice/sessions', { caseId: data.caseId });
			sessionId = json.sessionId;
			publicCase = json.case;
			step = 'intro';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Could not start this case.';
			step = 'error';
		}
	}

	let hasStarted = false;
	$effect(() => {
		if (hasStarted) return;
		hasStarted = true;
		startSession();
	});

	function applyEvidenceReveal(revealedEvidenceText: string | null) {
		if (!revealedEvidenceText) return;
		evidenceSoFar = [
			...evidenceSoFar.map((e) => ({ ...e, isNew: false })),
			{ text: revealedEvidenceText, isNew: true }
		];
	}

	async function submitInitialReasoning() {
		if (!initialJudgment || !initialReasoning.trim() || !sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_INITIAL_JUDGMENT',
				judgment: initialJudgment,
				reasoning: initialReasoning
			});
			step = 'initial_confidence';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitInitialConfidence() {
		if (!sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			capturedInitialJudgment = {
				judgment: initialJudgment!,
				confidence: initialConfidence,
				reasoning: initialReasoning
			};
			const json = await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_INITIAL_CONFIDENCE',
				confidence: initialConfidence
			});
			if (json.fsmState === 'COMMIT_UPDATE_CRITERION') {
				step = 'update_criterion';
			} else {
				applyEvidenceReveal(json.revealedEvidenceText);
				tutorQuestion = json.tutorQuestion;
				step = 'challenge';
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitUpdateCriterion() {
		if (!updateCriterionText.trim() || !sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			const json = await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_UPDATE_CRITERION',
				text: updateCriterionText
			});
			applyEvidenceReveal(json.revealedEvidenceText);
			tutorQuestion = json.tutorQuestion;
			step = 'challenge';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitChallengeResponse() {
		if (!challengeResponse.trim() || !sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			const json = await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_CHALLENGE_RESPONSE',
				response: challengeResponse
			});
			challengeResponse = '';
			applyEvidenceReveal(json.revealedEvidenceText);
			if (json.fsmState === 'AWAIT_CHALLENGE_RESPONSE') {
				tutorQuestion = json.tutorQuestion;
			} else {
				evidenceSoFar = evidenceSoFar.map((e) => ({ ...e, isNew: false }));
				step = 'revised_judgment';
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitRevisedReasoning() {
		if (!revisedJudgment || !revisedReasoning.trim() || !sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_REVISED_JUDGMENT',
				judgment: revisedJudgment,
				reasoning: revisedReasoning
			});
			step = 'revised_confidence';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitRevisedConfidence() {
		if (!sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_REVISED_CONFIDENCE',
				confidence: revisedConfidence
			});
			step = 'reflection';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitReflection() {
		if (!reflectionText.trim() || !sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			const json = await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_REFLECTION',
				text: reflectionText
			});
			if (json.result) caseResult = json.result;
			step = 'disposition_checkin';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}

	async function submitDispositionCheckin() {
		if (!sessionId) return;
		submitting = true;
		errorMessage = null;
		try {
			await post(`/api/practice/sessions/${sessionId}/transition`, {
				type: 'SUBMIT_DISPOSITION_CHECKIN',
				dispositionItem,
				response: dispositionResponse
			});
			step = 'complete';
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>{publicCase?.title ?? 'Practice'} — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-10">
	{#if errorMessage}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</p>
	{/if}

	{#if step === 'starting'}
		<p role="status" aria-live="polite" class="text-sm text-slate-600">Starting the case…</p>
	{:else if step === 'error'}
		<div class="flex flex-col gap-3">
			<p class="text-sm text-slate-600">This case couldn't be started.</p>
			<button
				type="button"
				onclick={startSession}
				class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Try again
			</button>
		</div>
	{:else if publicCase}
		{#if step === 'intro'}
			<section class="flex flex-col gap-4">
				<h1
					bind:this={stepHeading}
					tabindex="-1"
					class="text-2xl font-semibold text-slate-900 outline-none"
				>
					{publicCase.title}
				</h1>
				<p class="text-slate-600">
					This is an investigation, not a quiz. You'll form a first read, defend it, see more of the
					evidence, and decide whether to update your view — there's no penalty for changing your
					mind, and "uncertain" is often the most defensible answer.
				</p>
				<button
					type="button"
					onclick={() => (step = 'scenario')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Begin the investigation
				</button>
			</section>
		{:else if step === 'scenario'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					The scenario
				</h2>
				<p class="text-lg text-slate-800">{publicCase.scenario}</p>
				<button
					type="button"
					onclick={() => (step = 'claim')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Continue
				</button>
			</section>
		{:else if step === 'claim'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					The claim you'll evaluate
				</h2>
				<p class="rounded-md border border-slate-300 bg-slate-50 px-4 py-3 text-lg text-slate-900">
					{publicCase.claim}
				</p>
				<button
					type="button"
					onclick={() => (step = 'initial_judgment')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Give my initial read
				</button>
			</section>
		{:else if step === 'initial_judgment'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					How strongly does the evidence so far support this claim?
				</h2>
				<JudgmentPicker
					bind:value={initialJudgment}
					name="initial-judgment"
					legend="Your initial judgement"
				/>
				<button
					type="button"
					disabled={!initialJudgment}
					onclick={() => (step = 'initial_reasoning')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'initial_reasoning'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					Why do you think that?
				</h2>
				<label for="initial-reasoning" class="sr-only">Your reasoning</label>
				<textarea
					id="initial-reasoning"
					bind:value={initialReasoning}
					disabled={submitting}
					rows="5"
					maxlength={FREE_TEXT_MAX_LENGTH}
					placeholder="What makes you lean that way?"
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
				<button
					type="button"
					disabled={!initialReasoning.trim() || submitting}
					onclick={submitInitialReasoning}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'initial_confidence'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					How confident are you?
				</h2>
				<p class="text-sm text-slate-600">
					How confident are you that this is the best-supported judgement given the evidence
					currently available?
				</p>
				<ConfidenceSlider
					bind:value={initialConfidence}
					label="Your confidence"
					id="initial-confidence"
				/>
				<button
					type="button"
					disabled={submitting}
					onclick={submitInitialConfidence}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'update_criterion'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					What would change your mind?
				</h2>
				<p class="text-sm text-slate-600">
					Before more evidence comes in: what additional evidence would make you substantially more
					or less confident?
				</p>
				<label for="update-criterion" class="sr-only">What would change your mind</label>
				<textarea
					id="update-criterion"
					bind:value={updateCriterionText}
					disabled={submitting}
					rows="4"
					maxlength={FREE_TEXT_MAX_LENGTH}
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
				<button
					type="button"
					disabled={!updateCriterionText.trim() || submitting}
					onclick={submitUpdateCriterion}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'challenge'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					{tutorQuestion}
				</h2>
				{#if evidenceSoFar.length > 0}
					<div class="flex flex-col gap-3">
						{#each evidenceSoFar as evidence, i (i)}
							<EvidenceCard text={evidence.text} isNew={evidence.isNew} />
						{/each}
					</div>
				{/if}
				<label for="challenge-response" class="sr-only">Your response</label>
				<textarea
					id="challenge-response"
					bind:value={challengeResponse}
					disabled={submitting}
					rows="4"
					maxlength={FREE_TEXT_MAX_LENGTH}
					placeholder="Your response…"
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
				<button
					type="button"
					disabled={!challengeResponse.trim() || submitting}
					onclick={submitChallengeResponse}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Respond
				</button>
			</section>
		{:else if step === 'revised_judgment'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					Now that you've seen the evidence, where do you land?
				</h2>
				{#if capturedInitialJudgment}
					<p class="text-sm text-slate-500">
						Your initial judgement was <span class="font-medium text-slate-700"
							>{capturedInitialJudgment.judgment.replace(/_/g, ' ')}</span
						> — it's fine to stay there or move, in either direction.
					</p>
				{/if}
				<JudgmentPicker
					bind:value={revisedJudgment}
					name="revised-judgment"
					legend="Your revised judgement"
				/>
				<button
					type="button"
					disabled={!revisedJudgment}
					onclick={() => (step = 'revised_reasoning')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'revised_reasoning'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					What's your reasoning now?
				</h2>
				<label for="revised-reasoning" class="sr-only">Your revised reasoning</label>
				<textarea
					id="revised-reasoning"
					bind:value={revisedReasoning}
					disabled={submitting}
					rows="5"
					maxlength={FREE_TEXT_MAX_LENGTH}
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
				<button
					type="button"
					disabled={!revisedReasoning.trim() || submitting}
					onclick={submitRevisedReasoning}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'revised_confidence'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					How confident are you now?
				</h2>
				{#if capturedInitialJudgment}
					<p class="text-sm text-slate-500">
						You started at {capturedInitialJudgment.confidence}% confident.
					</p>
				{/if}
				<ConfidenceSlider
					bind:value={revisedConfidence}
					label="Your revised confidence"
					id="revised-confidence"
				/>
				<button
					type="button"
					disabled={submitting}
					onclick={submitRevisedConfidence}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Continue
				</button>
			</section>
		{:else if step === 'reflection'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					What changed, if anything, and why?
				</h2>
				<label for="reflection" class="sr-only">Your reflection</label>
				<textarea
					id="reflection"
					bind:value={reflectionText}
					disabled={submitting}
					rows="5"
					maxlength={FREE_TEXT_MAX_LENGTH}
					class="w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none disabled:opacity-60"
				></textarea>
				<button
					type="button"
					disabled={!reflectionText.trim() || submitting}
					onclick={submitReflection}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{submitting ? 'Scoring…' : 'Continue'}
				</button>
			</section>
		{:else if step === 'disposition_checkin'}
			<section class="flex flex-col gap-4">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-xl font-semibold text-slate-900 outline-none"
				>
					One last quick check-in
				</h2>
				<p class="text-sm text-slate-600">
					How much did this apply to you while working through this case? "{dispositionItem}"
				</p>
				<fieldset class="flex gap-2">
					<legend class="sr-only">Rate 1 (not at all) to 5 (very much)</legend>
					{#each [1, 2, 3, 4, 5] as rating (rating)}
						<label
							class="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-slate-300 text-sm font-medium text-slate-700 has-[:checked]:border-indigo-600 has-[:checked]:bg-indigo-50 has-[:checked]:text-indigo-900"
						>
							<input
								type="radio"
								name="disposition-rating"
								value={rating}
								checked={dispositionResponse === rating}
								onchange={() => (dispositionResponse = rating)}
								class="sr-only"
							/>
							{rating}
						</label>
					{/each}
				</fieldset>
				<button
					type="button"
					disabled={submitting}
					onclick={submitDispositionCheckin}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
				>
					Finish
				</button>
			</section>
		{:else if step === 'complete' && caseResult}
			<section class="flex flex-col gap-8">
				<h2
					bind:this={stepHeading}
					tabindex="-1"
					class="text-2xl font-semibold text-slate-900 outline-none"
				>
					Case complete
				</h2>

				<div>
					<h3 class="mb-2 text-sm font-medium text-slate-800">Your reasoning path</h3>
					<div class="flex flex-col gap-3 rounded-md border border-slate-200 px-4 py-3 text-sm">
						<div>
							<p class="text-slate-700">
								Initial: <span class="font-medium"
									>{caseResult.initialJudgment.judgment.replace(/_/g, ' ')}</span
								>
								at {caseResult.initialJudgment.confidence}% confidence.
							</p>
							<p class="mt-1 text-slate-500 italic">"{caseResult.initialJudgment.reasoning}"</p>
						</div>
						<div>
							<p class="text-slate-700">
								Revised: <span class="font-medium"
									>{caseResult.revisedJudgment.judgment.replace(/_/g, ' ')}</span
								>
								at {caseResult.revisedJudgment.confidence}% confidence.
							</p>
							<p class="mt-1 text-slate-500 italic">"{caseResult.revisedJudgment.reasoning}"</p>
						</div>
						<p class="text-slate-500">
							{caseResult.initialJudgment.judgment === caseResult.revisedJudgment.judgment
								? 'You held your judgement steady — that can be exactly as reasonable as changing it.'
								: 'You changed your judgement — that can be exactly as reasonable as holding steady.'}
						</p>
					</div>
				</div>

				{#if evidenceSoFar.length > 0}
					<div>
						<h3 class="mb-2 text-sm font-medium text-slate-800">Evidence that mattered</h3>
						<div class="flex flex-col gap-3">
							{#each evidenceSoFar as evidence, i (i)}
								<EvidenceCard text={evidence.text} />
							{/each}
						</div>
					</div>
				{/if}

				{#if caseResult.updateCriterion}
					<div>
						<h3 class="mb-2 text-sm font-medium text-slate-800">Your update criterion</h3>
						<p class="rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-700">
							{caseResult.updateCriterion.consistency.explanation}
						</p>
					</div>
				{/if}

				<div>
					<h3 class="mb-2 text-sm font-medium text-slate-800">Reasoning moves observed</h3>
					<ReasoningEventList events={caseResult.scoringEvents} />
				</div>

				{#if caseResult.pushFurtherHints.length > 0}
					<div>
						<h3 class="mb-2 text-sm font-medium text-slate-800">Where you could push further</h3>
						<ul class="flex flex-col gap-2">
							{#each caseResult.pushFurtherHints as hint, i (i)}
								<li class="rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-700">
									{hint}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				<div>
					<h3 class="mb-2 text-sm font-medium text-slate-800">What the evidence shows</h3>
					<p class="text-sm text-slate-500">
						{caseResult.outcome === 'correct'
							? "Your final judgement aligned with what this case's evidence most directly supports."
							: "Your final judgement didn't fully align with what this case's evidence most directly supports — here's the fuller picture:"}
					</p>
					<p
						class="mt-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
					>
						{caseResult.teachingExplanation}
					</p>
				</div>

				<a
					href={resolve('/practice')}
					class="self-start rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
				>
					Back to practice cases
				</a>
			</section>
		{/if}
	{/if}
</main>
