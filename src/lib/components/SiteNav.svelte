<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	interface Props {
		user: { id: string; email: string | null } | null;
	}
	let { user }: Props = $props();

	// prompt.txt Prompt D3 point 2: a secondary nav bar under the header,
	// not a sidebar — kept because every existing page layout is a
	// centered max-w-2xl column with no sidebar chrome anywhere yet, and
	// D3 comes before the D4 visual-design pass that would actually decide
	// the app's real information-architecture shape. Introducing a
	// persistent sidebar now would mean redesigning every page's layout
	// twice (once here, again once D4 lands) for no real gain yet — a
	// secondary bar keeps today's centered-column look intact while still
	// decluttering the header itself. Revisit once D4 has an actual plan.
	const primaryLinks = [
		{ href: '/practice', label: 'Practice' },
		{ href: '/lessons', label: 'My lessons' },
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/library', label: 'Library' },
		{ href: '/examples', label: 'Examples' }
	] as const;

	let mobileMenuOpen = $state(false);

	function isActive(href: (typeof primaryLinks)[number]['href']): boolean {
		const target = resolve(href);
		const path = page.url.pathname;
		return path === target || path.startsWith(`${target}/`);
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<header class="border-b border-slate-200">
	<div class="mx-auto flex max-w-2xl items-center justify-between px-6 py-3">
		<a
			href={resolve('/')}
			class="rounded font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none"
		>
			Chiron
		</a>

		<!-- Mobile: a single control collapses the account affordance AND the
			primary nav below it (D3 point 1) — shown only below md. -->
		<button
			type="button"
			class="rounded p-1.5 text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none md:hidden"
			aria-expanded={mobileMenuOpen}
			aria-controls="mobile-menu"
			aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
			onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
		>
			{#if mobileMenuOpen}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					class="h-6 w-6"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
				</svg>
			{:else}
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					class="h-6 w-6"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					aria-hidden="true"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5"
					/>
				</svg>
			{/if}
		</button>

		<!-- Desktop account affordance: a native <details> menu needs no
			extra state and stays keyboard/focus-accessible for free. -->
		<div class="hidden items-center gap-4 text-sm md:flex">
			{#if user}
				<details class="relative">
					<summary
						class="cursor-pointer list-none rounded px-2 py-1 text-slate-600 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none [&::-webkit-details-marker]:hidden"
					>
						{user.email}
					</summary>
					<div
						class="absolute right-0 z-10 mt-1 flex w-40 flex-col rounded-md border border-slate-200 bg-white py-1 shadow-md"
					>
						<a href={resolve('/account/org')} class="px-3 py-1.5 text-slate-700 hover:bg-slate-50"
							>My org</a
						>
						<form method="POST" action="/logout">
							<button
								type="submit"
								class="w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
								>Log out</button
							>
						</form>
					</div>
				</details>
			{:else}
				<a href={resolve('/login')} class="text-slate-600 hover:text-slate-900">Log in</a>
				<a href={resolve('/signup')} class="text-slate-600 hover:text-slate-900">Sign up</a>
			{/if}
		</div>
	</div>
</header>

{#if user}
	<nav aria-label="Primary" class="hidden border-b border-slate-200 md:block">
		<div class="mx-auto flex max-w-2xl gap-6 px-6 text-sm">
			{#each primaryLinks as link (link.href)}
				<a
					href={resolve(link.href)}
					aria-current={isActive(link.href) ? 'page' : undefined}
					class="border-b-2 py-2.5 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none {isActive(
						link.href
					)
						? 'border-brand font-medium text-brand-text'
						: 'border-transparent text-slate-600 hover:text-slate-900'}"
				>
					{link.label}
				</a>
			{/each}
		</div>
	</nav>
{/if}

{#if mobileMenuOpen}
	<div id="mobile-menu" class="border-b border-slate-200 md:hidden">
		<nav aria-label="Primary" class="flex flex-col px-6 py-2 text-sm">
			{#if user}
				{#each primaryLinks as link (link.href)}
					<a
						href={resolve(link.href)}
						aria-current={isActive(link.href) ? 'page' : undefined}
						onclick={closeMobileMenu}
						class="rounded px-2 py-2 focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none {isActive(
							link.href
						)
							? 'font-medium text-brand-text'
							: 'text-slate-600 hover:text-slate-900'}"
					>
						{link.label}
					</a>
				{/each}
				<div class="my-1 border-t border-slate-100"></div>
				<a
					href={resolve('/account/org')}
					onclick={closeMobileMenu}
					class="rounded px-2 py-2 text-slate-600 hover:text-slate-900">My org</a
				>
				<span class="px-2 py-1 text-xs text-slate-400">{user.email}</span>
				<form method="POST" action="/logout">
					<button
						type="submit"
						onclick={closeMobileMenu}
						class="w-full rounded px-2 py-2 text-left text-slate-600 hover:text-slate-900"
						>Log out</button
					>
				</form>
			{:else}
				<a
					href={resolve('/login')}
					onclick={closeMobileMenu}
					class="rounded px-2 py-2 text-slate-600 hover:text-slate-900">Log in</a
				>
				<a
					href={resolve('/signup')}
					onclick={closeMobileMenu}
					class="rounded px-2 py-2 text-slate-600 hover:text-slate-900">Sign up</a
				>
			{/if}
		</nav>
	</div>
{/if}
