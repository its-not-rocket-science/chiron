import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function safeRedirectTarget(raw: string | null): string {
	return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/';
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user) throw redirect(303, safeRedirectTarget(url.searchParams.get('redirect')));
};

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.supabase) {
			return fail(500, { error: 'Accounts are not configured yet.' });
		}

		const formData = await request.formData();
		const email = formData.get('email');
		const password = formData.get('password');
		const displayName = formData.get('displayName');

		if (
			typeof email !== 'string' ||
			typeof password !== 'string' ||
			typeof displayName !== 'string'
		) {
			return fail(400, { error: 'Name, email, and password are required.' });
		}
		if (!displayName.trim()) {
			return fail(400, { error: 'Please enter your name.' });
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}

		// Supabase's confirmation email redirects to Site URL by default,
		// not wherever the app is actually running — without this,
		// confirming lands the user on whatever the dashboard's Site URL
		// happens to be (e.g. a leftover localhost default) instead of this
		// deployment. url.origin makes it correct regardless of
		// environment; the target still needs to be on Supabase's Redirect
		// URLs allowlist (Authentication > URL Configuration) or Supabase
		// silently falls back to Site URL anyway.
		const emailRedirectTo = `${url.origin}${safeRedirectTarget(url.searchParams.get('redirect'))}`;

		const { data, error } = await locals.supabase.auth.signUp({
			email,
			password,
			options: { data: { display_name: displayName.trim() }, emailRedirectTo }
		});

		if (error) return fail(400, { error: error.message });

		// If email confirmation is required, signUp succeeds but no session
		// is issued yet — the user needs to click the confirmation link first.
		if (!data.session) {
			return { confirmationRequired: true };
		}

		throw redirect(303, safeRedirectTarget(url.searchParams.get('redirect')));
	}
};
