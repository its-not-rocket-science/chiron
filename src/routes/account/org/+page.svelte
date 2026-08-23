<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageProps } from './$types';

	let { data, form }: PageProps & { form: ActionData } = $props();
	let submitting = $state(false);

	function wrapEnhance() {
		submitting = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			submitting = false;
		};
	}
</script>

<svelte:head>
	<title>My org — Chiron</title>
</svelte:head>

<main class="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
	{#if !data.membership}
		<h1 class="text-2xl font-semibold text-slate-900">Create an organization</h1>
		<p class="text-sm text-slate-600">
			Create a school or district org to share lessons with other teachers. You'll be the admin.
		</p>

		{#if form?.error}
			<p role="alert" class="rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">{form.error}</p>
		{/if}

		<form method="POST" action="?/createOrg" class="flex gap-3" use:enhance={wrapEnhance}>
			<input
				name="name"
				type="text"
				required
				placeholder="e.g. Riverside High School"
				class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
			/>
			<button
				type="submit"
				disabled={submitting}
				class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
			>
				Create
			</button>
		</form>
	{:else}
		<header>
			<h1 class="text-2xl font-semibold text-slate-900">{data.membership.orgs?.name}</h1>
			<p class="mt-1 text-sm text-slate-500">
				You are a{data.isAdmin ? 'n admin' : ' teacher'} in this org.
			</p>
		</header>

		<section>
			<h2 class="mb-3 text-sm font-medium text-slate-800">Members</h2>
			<ul class="flex flex-col gap-1.5 text-sm text-slate-600">
				{#each data.members ?? [] as member (member.id)}
					<li>
						{member.profiles_public?.display_name} —
						<span class="text-slate-400">{member.role}</span>
					</li>
				{/each}
			</ul>
		</section>

		{#if data.isAdmin}
			<section>
				<h2 class="mb-3 text-sm font-medium text-slate-800">Invite a teacher</h2>

				{#if form?.error}
					<p role="alert" class="mb-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-800">
						{form.error}
					</p>
				{/if}
				{#if form?.inviteLink}
					<p
						role="status"
						class="mb-3 rounded-md bg-slate-50 px-4 py-3 text-sm break-all text-slate-700"
					>
						Invite created — share this link: <code>{form.inviteLink}</code>
					</p>
				{/if}

				<form
					method="POST"
					action="?/invite"
					class="flex flex-wrap gap-3"
					use:enhance={wrapEnhance}
				>
					<input type="hidden" name="orgId" value={data.membership.org_id} />
					<input
						name="email"
						type="email"
						required
						placeholder="teacher@school.edu"
						class="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					/>
					<select
						name="role"
						class="rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none"
					>
						<option value="teacher">Teacher</option>
						<option value="admin">Admin</option>
					</select>
					<button
						type="submit"
						disabled={submitting}
						class="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
					>
						Send invite
					</button>
				</form>

				{#if (data.invites ?? []).length > 0}
					<ul class="mt-4 flex flex-col gap-2 text-sm">
						{#each data.invites ?? [] as invite (invite.id)}
							<li class="flex items-center justify-between">
								<span class="text-slate-600"
									>{invite.email} — <span class="text-slate-400">{invite.role}</span></span
								>
								<form method="POST" action="?/revokeInvite" use:enhance={wrapEnhance}>
									<input type="hidden" name="inviteId" value={invite.id} />
									<button
										type="submit"
										class="text-xs text-slate-500 underline hover:text-slate-800"
									>
										Revoke
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>

			<section>
				<h2 class="mb-3 text-sm font-medium text-slate-800">Org-shared lessons</h2>
				{#if (data.orgLessons ?? []).length === 0}
					<p class="text-sm text-slate-500">No lessons have been shared with the org yet.</p>
				{:else}
					<ul class="flex flex-col gap-2 text-sm">
						{#each data.orgLessons ?? [] as lesson (lesson.id)}
							<li
								class="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2"
							>
								<div>
									<span class="font-medium text-slate-800">{lesson.title}</span>
									<span class="text-slate-400"> — by {lesson.profiles_public?.display_name}</span>
								</div>
								<form method="POST" action="?/toggleFeatured" use:enhance={wrapEnhance}>
									<input type="hidden" name="lessonId" value={lesson.id} />
									<input type="hidden" name="featured" value={(!lesson.featured).toString()} />
									<button
										type="submit"
										class="text-xs text-slate-500 underline hover:text-slate-800"
									>
										{lesson.featured ? 'Unfeature' : 'Feature'}
									</button>
								</form>
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/if}
	{/if}
</main>
