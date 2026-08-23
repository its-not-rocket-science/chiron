import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function safeRedirectTarget(raw: string | null): string {
	// Only ever redirect to a same-site path — never follow an absolute/external URL.
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

		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, { error: 'Email and password are required.' });
		}

		const { error } = await locals.supabase.auth.signInWithPassword({ email, password });
		if (error) return fail(400, { error: 'Incorrect email or password.' });

		throw redirect(303, safeRedirectTarget(url.searchParams.get('redirect')));
	}
};
