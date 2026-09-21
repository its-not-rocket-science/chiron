<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/chiron0.png';
	import SiteNav from '$lib/components/SiteNav.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<SiteNav user={data.user} />

{@render children()}
