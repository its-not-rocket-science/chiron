import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface ReportRow {
	id: string;
	lesson_id: string;
	reason: string;
	created_at: string;
	reporter: { display_name: string } | null;
	lessons: {
		id: string;
		title: string;
		subject_profile_id: string;
		visibility: 'private' | 'org-shared' | 'public-template';
		owner: { display_name: string } | null;
	} | null;
}

/**
 * `prompt.txt` Prompt G4 — the Chiron-level (not org-level) moderation
 * queue. Gated on `is_chiron_moderator()` (supabase/migrations/0021),
 * not `locals.user`/`isAdmin`-of-any-org — a route-level check, same
 * discipline as every other authorization gate in this app: the RPC
 * functions this page's actions call (`unpublish_lesson`,
 * `resolve_lesson_report`) already enforce this server-side
 * independently, so this load-time check is UX (don't show the page to
 * someone who can't use it), not the actual security boundary.
 *
 * 404, not 403, for a non-moderator — deliberately not revealing this
 * route exists at all, matching lessons/[id]'s own "don't leak which
 * private ids exist" reasoning applied here to "don't advertise a
 * moderator-only admin panel to everyone."
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/moderation');
	if (!locals.supabase) throw error(404, 'Not found.');

	const { data: isModerator } = await locals.supabase.rpc('is_chiron_moderator');
	if (!isModerator) throw error(404, 'Not found.');

	const { data } = await locals.supabase
		.from('lesson_reports')
		.select(
			`id, lesson_id, reason, created_at,
			 reporter:profiles_public!reporter_id(display_name),
			 lessons(id, title, subject_profile_id, visibility, owner:profiles_public!owner_id(display_name))`
		)
		.is('resolved_at', null)
		.order('created_at', { ascending: true })
		.returns<ReportRow[]>();

	return { reports: data ?? [] };
};

export const actions: Actions = {
	unpublish: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		const reason = formData.get('reason');
		if (typeof lessonId !== 'string' || typeof reason !== 'string' || !reason.trim()) {
			return fail(400, { error: 'A reason is required to unpublish a lesson.' });
		}

		const { error: rpcError } = await locals.supabase.rpc('unpublish_lesson', {
			target_lesson_id: lessonId,
			reason: reason.trim()
		});
		if (rpcError) return fail(400, { error: rpcError.message });

		return { success: true };
	},

	dismiss: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const reportId = formData.get('reportId');
		if (typeof reportId !== 'string') return fail(400, { error: 'Missing report id.' });

		const { error: rpcError } = await locals.supabase.rpc('resolve_lesson_report', {
			target_report_id: reportId
		});
		if (rpcError) return fail(400, { error: rpcError.message });

		return { success: true };
	}
};
