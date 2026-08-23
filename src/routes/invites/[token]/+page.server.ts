import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface InviteWithOrgName {
	email: string;
	role: 'admin' | 'teacher';
	orgs: { name: string } | null;
}

export const load: PageServerLoad = async ({ params, locals, url }) => {
	if (!locals.supabase) return { invite: null, needsAuth: false };

	if (!locals.user) {
		return { invite: null, needsAuth: true, redirectPath: url.pathname };
	}

	const { data: invite } = await locals.supabase
		.from('org_invites')
		.select('email, role, orgs(name)')
		.eq('token', params.token)
		.is('accepted_at', null)
		.gt('expires_at', new Date().toISOString())
		.maybeSingle()
		.returns<InviteWithOrgName>();

	return { invite, needsAuth: false };
};

export const actions: Actions = {
	default: async ({ params, locals }) => {
		if (!locals.supabase || !locals.user) {
			return fail(401, { error: 'Please log in first.' });
		}

		const { error } = await locals.supabase.rpc('accept_org_invite', {
			invite_token: params.token
		});
		if (error) return fail(400, { error: error.message });

		throw redirect(303, '/account/org');
	}
};
