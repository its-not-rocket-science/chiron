import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		if (!locals.supabase) {
			return fail(500, { error: 'Accounts are not configured yet.' });
		}

		const formData = await request.formData();
		const email = formData.get('email');

		if (typeof email !== 'string' || !email.trim()) {
			return fail(400, { error: 'Please enter your email address.' });
		}

		// Deliberately discard the result — Supabase's own resetPasswordForEmail
		// never reveals whether the email belongs to a real account (prompt.txt
		// Prompt F3), and branching the response on `error` here would undo
		// that: an attacker could otherwise enumerate registered emails by
		// watching which ones produce a different UI outcome. Always report
		// success, same as Supabase's own API already does at its layer.
		await locals.supabase.auth.resetPasswordForEmail(email.trim(), {
			redirectTo: `${url.origin}/reset-password`
		});

		return { success: true };
	}
};
