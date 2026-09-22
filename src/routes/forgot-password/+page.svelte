<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Forgot password — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
	<div>
		<h1 class="text-2xl font-semibold text-slate-900">Forgot password?</h1>
		<p class="mt-1 text-sm text-slate-600">
			Enter your email and we'll send you a link to reset your password.
		</p>
	</div>

	{#if form?.error}
		<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
	{:else if form?.success}
		<p role="status" class="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">
			If an account exists for that email, we've sent a link to reset your password.
		</p>
	{:else}
		<form
			method="POST"
			class="flex flex-col gap-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<div>
				<label for="email" class="mb-1 block text-sm font-medium text-slate-700">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					required
					autocomplete="email"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				disabled={submitting}
				class="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
			>
				{submitting ? 'Sending…' : 'Send reset link'}
			</button>
		</form>
	{/if}

	<p class="text-sm text-slate-600">
		<a href={resolve('/login')} class="underline">Back to log in</a>
	</p>
</main>
