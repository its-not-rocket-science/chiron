import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

/**
 * By the time this load runs, `src/routes/+layout.server.ts`'s root load
 * has already exchanged any `?code=...` on this URL for a session (it
 * handles that for every route, not just this one — see its own comment;
 * originally built for signup's email-confirmation link, reused as-is
 * here rather than duplicating the exchange). So a valid, unexpired
 * recovery link means `locals.user` is populated here; an invalid or
 * expired one means the exchange silently failed and it's null.
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { validSession: Boolean(locals.user) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.supabase || !locals.user) {
			return fail(400, {
				error: 'This reset link has expired or is invalid. Request a new one below.'
			});
		}

		const formData = await request.formData();
		const password = formData.get('password');
		const confirmPassword = formData.get('confirmPassword');

		if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
			return fail(400, { error: 'Please fill in both password fields.' });
		}
		if (password.length < 8) {
			return fail(400, { error: 'Password must be at least 8 characters.' });
		}
		if (password !== confirmPassword) {
			return fail(400, { error: "Passwords don't match." });
		}

		const { error } = await locals.supabase.auth.updateUser({ password });
		if (error) return fail(400, { error: error.message });

		throw redirect(303, '/');
	}
};
