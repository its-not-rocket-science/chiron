<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Privacy — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	<header>
		<h1 class="text-2xl font-semibold text-slate-900">Privacy</h1>
		<p class="mt-1 text-sm text-slate-500">Last updated 2026-09-22.</p>
	</header>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">What this page is</h2>
		<p>
			This describes what Chiron actually does with your data today, as verified against the real
			code and configuration rather than assumed. Chiron is in active development, and two specific
			policy decisions below are genuinely not yet made — where that's true, this page says so
			directly instead of guessing.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">What we collect</h2>
		<ul class="list-disc space-y-2 pl-5">
			<li>
				<strong>Account information.</strong> The email address you sign up with, handled by our authentication
				provider, Supabase.
			</li>
			<li>
				<strong>Lesson plans you submit.</strong> The lesson text you upload or paste, the scores and
				suggestions Chiron generates for it, and any organization-sharing settings you choose.
			</li>
			<li>
				<strong>Practice-session data.</strong> If you use Chiron's student practice feature, we store
				your responses within a practice case (your stated reasoning, the criteria you commit to, your
				answers to follow-up challenges, and end-of-case reflections) together with a reference to your
				account. No student practice data is visible to any other student, or to a teacher or org admin
				— it's private to the student who created it.
			</li>
		</ul>
		<p>We don't collect anything beyond what each feature above actually needs to function.</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Who processes it</h2>
		<ul class="list-disc space-y-2 pl-5">
			<li>
				<strong>Supabase</strong> hosts our database and handles authentication. Your account email, lesson
				text, scores, and practice data are stored there.
			</li>
			<li>
				<strong>DeepSeek</strong>, an AI model provider, receives lesson text (to generate scores
				and suggestions) and practice-session text (to run the practice tutor and classify your
				reasoning) as part of generating those results. We don't send this text to any other AI
				vendor.
			</li>
			<li>
				<strong>Vercel</strong> hosts the application itself.
			</li>
		</ul>
		<p>We don't sell your data, and we don't use it for advertising.</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">What we log</h2>
		<p>
			Our application code does not log lesson text, practice-session text, or any other personal
			data — only a sanitized error name and message on the rare occasion an AI request fails
			outright. This has been directly verified against the codebase, not merely assumed.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Uploaded files</h2>
		<p>
			If you upload a lesson as a file (e.g. a .docx or .pdf), the original file itself is never
			written to disk — only the extracted text is kept. There's currently no self-serve way to
			delete a saved lesson or your account from within the app; lesson and account data is retained
			as long as your account exists.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">What we haven't decided yet</h2>
		<p>
			Two things are genuinely open, and we're not going to guess at them here just to fill in a
			number:
		</p>
		<ul class="list-disc space-y-2 pl-5">
			<li>
				<strong>Data retention.</strong> We don't yet have a stated retention or deletion policy for practice-session
				data — it's currently kept indefinitely while this policy is finalized. We're working on a real
				retention timeline appropriate for a product used by schools and districts.
			</li>
			<li>
				<strong>Applicable regulation.</strong> Depending on where Chiron is deployed and the age of the
				students using it, regimes like FERPA or COPPA (in the US) or other jurisdictions' equivalents
				may apply. We haven't finalized which apply to a given deployment, and we won't claim compliance
				with a specific regulation until that's actually determined.
			</li>
		</ul>
		<p>
			If either of these matters to your deployment, please raise it with whoever manages your
			Chiron account before relying on this page for a compliance decision.
		</p>
	</section>

	<section class="flex flex-col gap-3 text-slate-700">
		<h2 class="text-lg font-semibold text-slate-900">Questions</h2>
		<p>
			We haven't yet published a dedicated privacy contact channel. Until we do, questions about
			this page should go through whoever set up your Chiron account or organization.
		</p>
	</section>

	<p class="text-sm text-slate-500">
		See also <a href={resolve('/terms')} class="underline">Terms of service</a>.
	</p>
</main>
