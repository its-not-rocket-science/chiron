<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageProps } from './$types';

	let { data, form }: PageProps & { form: ActionData } = $props();
	let submittingId = $state<string | null>(null);
	// Which report's unpublish-reason form (if any) is expanded.
	let unpublishingReportId = $state<string | null>(null);
</script>

<svelte:head>
	<title>Moderation — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-slate-900">Moderation queue</h1>
		<p class="mt-1 text-sm text-slate-500">
			Open reports on public-template lessons. Dismiss a report with no action, or unpublish the
			lesson (returns it to private) with a required reason.
		</p>
	</header>

	{#if form?.error}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
	{/if}

	{#if data.reports.length === 0}
		<p class="text-sm text-slate-500">No open reports.</p>
	{:else}
		<ul class="flex flex-col gap-4">
			{#each data.reports as report (report.id)}
				<li class="rounded-md border border-slate-200 p-4">
					<div class="flex items-start justify-between gap-3">
						<div>
							<h2 class="font-medium text-slate-800">
								{report.lessons?.title ?? '(lesson no longer available)'}
							</h2>
							{#if report.lessons}
								<p class="text-xs text-slate-500">
									by {report.lessons.owner?.display_name ?? 'a teacher'} · currently {report.lessons
										.visibility}
								</p>
							{/if}
						</div>
						<span class="text-xs text-slate-400">
							{new Date(report.created_at).toLocaleDateString()}
						</span>
					</div>

					<p class="mt-2 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
						<span class="font-medium">Reported by {report.reporter?.display_name ?? 'a user'}:</span
						>
						{report.reason}
					</p>

					{#if unpublishingReportId === report.id}
						<form
							method="POST"
							action="?/unpublish"
							class="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3"
							use:enhance={() => {
								submittingId = report.id;
								return async ({ update }) => {
									await update();
									submittingId = null;
									unpublishingReportId = null;
								};
							}}
						>
							<input type="hidden" name="lessonId" value={report.lesson_id} />
							<label for="unpublish-reason-{report.id}" class="text-xs font-medium text-slate-700">
								Reason for unpublishing (required — logged in the moderation history)
							</label>
							<textarea
								id="unpublish-reason-{report.id}"
								name="reason"
								required
								rows="2"
								class="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
							></textarea>
							<div class="flex gap-2">
								<button
									type="submit"
									disabled={submittingId === report.id}
									class="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
								>
									Confirm unpublish
								</button>
								<button
									type="button"
									onclick={() => (unpublishingReportId = null)}
									class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
								>
									Cancel
								</button>
							</div>
						</form>
					{:else}
						<div class="mt-3 flex gap-2 border-t border-slate-100 pt-3">
							<button
								type="button"
								onclick={() => (unpublishingReportId = report.id)}
								class="rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
							>
								Unpublish
							</button>
							<form
								method="POST"
								action="?/dismiss"
								use:enhance={() => {
									submittingId = report.id;
									return async ({ update }) => {
										await update();
										submittingId = null;
									};
								}}
							>
								<input type="hidden" name="reportId" value={report.id} />
								<button
									type="submit"
									disabled={submittingId === report.id}
									class="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
								>
									Dismiss
								</button>
							</form>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	<p class="text-sm text-slate-600">
		<a href={resolve('/library')} class="underline">Back to the library</a>
	</p>
</main>
