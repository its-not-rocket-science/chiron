import type { PageServerLoad } from './$types';

interface MembershipWithOrgName {
	org_id: string;
	orgs: { name: string } | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !locals.supabase) return { membership: null };

	const { data } = await locals.supabase
		.from('memberships')
		.select('org_id, orgs(name)')
		.eq('user_id', locals.user.id)
		.maybeSingle()
		.returns<MembershipWithOrgName>();

	return { membership: data };
};
