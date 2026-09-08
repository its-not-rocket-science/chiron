<script lang="ts">
	import { licenseBadge } from '$lib/domain/licenseBadge';
	import type { LessonLicense } from '$lib/domain/schemas';

	interface Props {
		license: LessonLicense;
	}

	let { license }: Props = $props();

	const badge = $derived(licenseBadge(license));
</script>

<span
	title={badge.label}
	class="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
>
	{badge.shortLabel}
</span>
