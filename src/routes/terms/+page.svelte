<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Terms of service — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-slate-900">Terms of service</h1>
		<p class="mt-1 text-sm text-slate-500">Last updated 2026-09-22.</p>
	</header>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Chiron is in active development</h2>
		<p>
			Chiron is a working product that is still being actively built and changed. Features, scoring
			behavior, and this page itself may change as development continues. See also our
			<a href={resolve('/privacy')} class="underline">privacy page</a> for what data we collect and how
			it's handled.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">What Chiron's scoring is — and isn't</h2>
		<p>
			Chiron applies a peer-reviewed critical-thinking framework (Abrami et al., 2015) to score
			lesson plans and generate suggestions. Chiron's own scoring hasn't itself been independently
			validated as an instrument — treat its results as a coaching tool and a starting point for
			reflection, not a verdict, a certification, or a validated assessment instrument. Don't use
			Chiron's scores as the sole basis for a formal evaluation of a teacher or a lesson.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Acceptable use</h2>
		<ul class="list-disc space-y-2 pl-5">
			<li>
				Use Chiron for its intended purpose: submitting and reviewing lesson plans, and (for
				students) working through practice cases.
			</li>
			<li>
				Don't attempt to disrupt the service, probe it for vulnerabilities without authorization, or
				use it to generate or submit content you don't have the right to share (see the licensing
				terms on any example lesson you duplicate).
			</li>
			<li>
				Don't attempt to extract another user's or organization's data that isn't shared with you.
			</li>
			<li>
				Don't use Chiron to process content involving real students' personal information beyond
				what the practice feature itself is designed to collect.
			</li>
		</ul>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Your account</h2>
		<p>
			You're responsible for the accuracy of the information you provide and for keeping your
			account credentials secure. If you're a member of an organization within Chiron, your org's
			admins can see content you've explicitly shared with that org, per the org-sharing settings
			you choose when saving a lesson.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">No warranty</h2>
		<p>
			Chiron is provided as-is, without warranty of any kind, express or implied. Given the product
			is under active development, expect rough edges, and expect scoring output to sometimes be
			wrong — always apply your own professional judgment.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Changes to these terms</h2>
		<p>
			As Chiron develops, these terms may change. We'll update the "last updated" date above when
			they do.
		</p>
	</section>

	<p class="text-sm text-slate-500">
		See also <a href={resolve('/privacy')} class="underline">Privacy</a>.
	</p>
</main>
