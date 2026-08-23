<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<svelte:head>
	<title>Sign up — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-6 py-12">
	<h1 class="text-2xl font-semibold text-slate-900">Create your account</h1>

	{#if form?.confirmationRequired}
		<p role="status" class="rounded-md bg-slate-50 px-4 py-3 text-sm text-slate-700">
			Check your email to confirm your account, then <a href={resolve('/login')} class="underline"
				>log in</a
			>.
		</p>
	{:else}
		{#if form?.error}
			<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
		{/if}

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
				<label for="displayName" class="mb-1 block text-sm font-medium text-slate-700">Name</label>
				<input
					id="displayName"
					name="displayName"
					type="text"
					required
					autocomplete="name"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
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
			<div>
				<label for="password" class="mb-1 block text-sm font-medium text-slate-700">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					required
					minlength="8"
					autocomplete="new-password"
					class="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
				/>
			</div>
			<button
				type="submit"
				disabled={submitting}
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
			>
				{submitting ? 'Creating account…' : 'Sign up'}
			</button>
		</form>

		<p class="text-sm text-slate-600">
			Already have an account? <a href={resolve('/login')} class="underline">Log in</a>
		</p>
	{/if}
</main>
