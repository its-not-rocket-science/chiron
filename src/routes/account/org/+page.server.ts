import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface MembershipWithOrg {
	id: string;
	role: 'admin' | 'teacher';
	org_id: string;
	orgs: { id: string; name: string } | null;
}

interface MemberRow {
	id: string;
	role: 'admin' | 'teacher';
	profiles_public: { display_name: string } | null;
}

interface OrgLessonRow {
	id: string;
	title: string;
	subject_profile_id: string;
	grade_level: string | null;
	featured: boolean;
	owner_id: string;
	profiles_public: { display_name: string } | null;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/account/org');
	if (!locals.supabase) return { membership: null };

	const supabase = locals.supabase;

	const { data: membership } = await supabase
		.from('memberships')
		.select('id, role, org_id, orgs(id, name)')
		.eq('user_id', locals.user.id)
		.maybeSingle()
		.returns<MembershipWithOrg>();

	if (!membership) return { membership: null };

	const isAdmin = membership.role === 'admin';

	const [membersResult, invitesResult, lessonsResult] = await Promise.all([
		supabase
			.from('memberships')
			.select('id, role, profiles_public(display_name)')
			.eq('org_id', membership.org_id)
			.returns<MemberRow[]>(),
		isAdmin
			? supabase
					.from('org_invites')
					.select('id, email, role, created_at, expires_at')
					.eq('org_id', membership.org_id)
					.is('accepted_at', null)
					.order('created_at', { ascending: false })
			: Promise.resolve({ data: [] }),
		supabase
			.from('lessons')
			.select(
				'id, title, subject_profile_id, grade_level, featured, owner_id, profiles_public(display_name)'
			)
			.eq('org_id', membership.org_id)
			.eq('visibility', 'org-shared')
			.order('featured', { ascending: false })
			.returns<OrgLessonRow[]>()
	]);

	return {
		membership,
		isAdmin,
		members: membersResult.data ?? [],
		invites: invitesResult.data ?? [],
		orgLessons: lessonsResult.data ?? []
	};
};

export const actions: Actions = {
	createOrg: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const name = formData.get('name');
		if (typeof name !== 'string' || !name.trim()) {
			return fail(400, { error: 'Please enter an organization name.' });
		}

		const { error } = await locals.supabase.rpc('create_org', { org_name: name.trim() });
		if (error) return fail(400, { error: error.message });

		return { success: true };
	},

	invite: async ({ request, locals }) => {
		if (!locals.supabase || !locals.user)
			return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const orgId = formData.get('orgId');
		const email = formData.get('email');
		const role = formData.get('role');

		if (
			typeof orgId !== 'string' ||
			typeof email !== 'string' ||
			!email.trim() ||
			(role !== 'admin' && role !== 'teacher')
		) {
			return fail(400, { error: 'A valid email and role are required.' });
		}

		const { data, error } = await locals.supabase
			.from('org_invites')
			.insert({ org_id: orgId, email: email.trim(), role, invited_by: locals.user.id })
			.select('token')
			.single();

		if (error)
			return fail(400, { error: 'Could not create invite. Are you an admin of this org?' });

		// No email-sending service wired up yet (docs/DECISIONS.md ADR-009) —
		// hand the admin a shareable link to send however they like.
		return { inviteLink: `/invites/${data.token}` };
	},

	revokeInvite: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const inviteId = formData.get('inviteId');
		if (typeof inviteId !== 'string') return fail(400, { error: 'Missing invite id.' });

		// .select() so a zero-row result (RLS silently blocked a non-admin —
		// Postgres/PostgREST don't treat that as an error) is distinguishable
		// from an actual delete, rather than being reported as success either way.
		const { data, error } = await locals.supabase
			.from('org_invites')
			.delete()
			.eq('id', inviteId)
			.select('id');
		if (error || !data || data.length === 0) {
			return fail(403, { error: 'Could not revoke that invite. Are you an admin of this org?' });
		}

		return { success: true };
	},

	toggleFeatured: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		const featured = formData.get('featured') === 'true';
		if (typeof lessonId !== 'string') return fail(400, { error: 'Missing lesson id.' });

		// Same reasoning as revokeInvite above: a non-admin's update matches
		// zero rows under RLS rather than erroring, so .select() is required
		// to tell "blocked" apart from "succeeded."
		const { data, error } = await locals.supabase
			.from('lessons')
			.update({ featured })
			.eq('id', lessonId)
			.select('id');
		if (error || !data || data.length === 0) {
			return fail(403, { error: 'Could not update that lesson. Are you an org admin?' });
		}

		return { success: true };
	}
};
