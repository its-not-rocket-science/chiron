import type { PageServerLoad } from './$types';

interface MembershipWithOrgName {
	org_id: string;
	orgs: { name: string } | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user || !locals.supabase) return { membership: null, hasScoredLessons: true };

	const { data } = await locals.supabase
		.from('memberships')
		.select('org_id, orgs(name)')
		.eq('user_id', locals.user.id)
		.maybeSingle()
		.returns<MembershipWithOrgName>();

	// "Has this user ever scored a lesson" doubles as the first-time-user
	// signal for the /examples banner (Prompt E4) — cheaply derivable from
	// an existing query rather than a new onboarding-flag column. A brand
	// new signup has zero rows here; `true` once they've saved their first.
	const { data: anyLesson } = await locals.supabase
		.from('lessons')
		.select('id')
		.eq('owner_id', locals.user.id)
		.limit(1)
		.maybeSingle();

	return { membership: data, hasScoredLessons: Boolean(anyLesson) };
};
