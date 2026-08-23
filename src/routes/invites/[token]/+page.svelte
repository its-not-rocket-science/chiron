<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData, PageProps } from './$types';

	let { data, form }: PageProps & { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Join organization — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
	<h1 class="text-2xl font-semibold text-slate-900">Organization invite</h1>

	{#if data.needsAuth}
		<p class="text-sm text-slate-600">Log in or sign up to accept this invite.</p>
		<div class="flex gap-3">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- base path is resolve()-validated; only the redirect query VALUE is dynamic -->
			<a
				href={`${resolve('/login')}?redirect=${encodeURIComponent(data.redirectPath ?? '/')}`}
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
			>
				Log in
			</a>
			<a
				href={`${resolve('/signup')}?redirect=${encodeURIComponent(data.redirectPath ?? '/')}`}
				class="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
			>
				Sign up
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	{:else if !data.invite}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
			This invite is invalid, expired, or already used.
		</p>
	{:else}
		{#if form?.error}
			<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
		{/if}

		<p class="text-sm text-slate-600">
			You've been invited to join <strong>{data.invite.orgs?.name}</strong> as a
			<strong>{data.invite.role}</strong>.
		</p>

		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<button
				type="submit"
				disabled={submitting}
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
			>
				{submitting ? 'Joining…' : `Join ${data.invite.orgs?.name}`}
			</button>
		</form>
	{/if}
</main>
