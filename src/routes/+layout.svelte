<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { resolve } from '$app/paths';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<nav class="border-b border-slate-200">
	<div class="mx-auto flex max-w-2xl items-center justify-between px-6 py-3 text-sm">
		<a href={resolve('/')} class="font-semibold text-slate-900">Chiron</a>
		<div class="flex items-center gap-4">
			{#if data.user}
				<a href={resolve('/practice')} class="text-slate-600 hover:text-slate-900">Practice</a>
				<a href={resolve('/lessons')} class="text-slate-600 hover:text-slate-900">My lessons</a>
				<a href={resolve('/dashboard')} class="text-slate-600 hover:text-slate-900">Dashboard</a>
				<a href={resolve('/library')} class="text-slate-600 hover:text-slate-900">Library</a>
				<a href={resolve('/account/org')} class="text-slate-600 hover:text-slate-900">My org</a>
				<span class="text-slate-400">{data.user.email}</span>
				<form method="POST" action="/logout">
					<button type="submit" class="text-slate-600 underline hover:text-slate-900"
						>Log out</button
					>
				</form>
			{:else}
				<a href={resolve('/login')} class="text-slate-600 hover:text-slate-900">Log in</a>
				<a href={resolve('/signup')} class="text-slate-600 hover:text-slate-900">Sign up</a>
			{/if}
		</div>
	</div>
</nav>

{@render children()}
