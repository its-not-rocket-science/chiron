import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { reportRlsDenial } from '$lib/server/errorReporting';

export interface LessonDetailRow {
	id: string;
	owner_id: string | null;
	title: string;
	subject_profile_id: string;
	grade_level: string | null;
	visibility: 'private' | 'org-shared' | 'public-template';
	attribution_name: string | null;
	attribution_url: string | null;
	license:
		| 'CC-BY-4.0'
		| 'CC-BY-SA-4.0'
		| 'Public-Domain-US-Govt'
		| 'Public-Domain-Expired'
		| 'Other-Permission-Granted'
		| null;
	license_note: string | null;
	lesson_versions: {
		id: string;
		version_number: number;
		raw_text: string;
		scores: {
			id: string;
			dialogue_score: 0 | 1 | 2 | 3;
			dialogue_justification: string;
			authenticity_score: 0 | 1 | 2 | 3;
			authenticity_justification: string;
			mentoring_score: 0 | 1 | 2 | 3;
			mentoring_justification: string;
			model_id: string;
			prompt_version: string | null;
			created_at: string;
			skill_coverage_entries: {
				id: string;
				skill: string;
				covered: boolean;
				confidence: 'low' | 'medium' | 'high';
				justification: string;
			}[];
			suggestions: {
				id: string;
				pillar: string;
				text: string;
			}[];
		} | null;
	} | null;
}

/**
 * The lesson detail view (prompt.txt Prompt D2) — first route in this app
 * that renders a single *saved* lesson's full content and score.
 * Read access follows the same "view lessons per visibility rules" RLS
 * policy the library and examples pages already rely on (own private
 * lessons, org-shared within the caller's org, or any public-template) —
 * no extra filter needed here beyond `.eq('id', ...)`, matching
 * library/+page.server.ts's own comment that RLS is the actual gate.
 * `isOwner` drives which CONTROLS (edit/delete) the page shows — write
 * access itself is independently enforced by RLS plus an explicit check
 * in the delete action and the revise API route, never by this flag
 * alone.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) throw redirect(303, `/login?redirect=/lessons/${params.id}`);
	if (!locals.supabase) throw error(500, 'Accounts are not configured yet.');

	const { data, error: loadError } = await locals.supabase
		.from('lessons')
		.select(
			`id, owner_id, title, subject_profile_id, grade_level, visibility,
			 attribution_name, attribution_url, license, license_note,
			 lesson_versions!lessons_current_version_fk(
				id, version_number, raw_text,
				scores(
					id, dialogue_score, dialogue_justification, authenticity_score, authenticity_justification,
					mentoring_score, mentoring_justification, model_id, prompt_version, created_at,
					skill_coverage_entries(id, skill, covered, confidence, justification),
					suggestions(id, pillar, text)
				)
			 )`
		)
		.eq('id', params.id)
		.maybeSingle()
		.returns<LessonDetailRow>();

	// A row missing here means either it doesn't exist, or RLS correctly
	// hid it (another user's private lesson) — both cases are a plain 404
	// to the caller, never distinguished, so a non-owner can't use this
	// route to probe which private lesson ids exist.
	if (loadError || !data) throw error(404, 'Lesson not found.');

	return { lesson: data, isOwner: data.owner_id === locals.user.id };
};

export const actions: Actions = {
	delete: async ({ locals, params }) => {
		if (!locals.user || !locals.supabase)
			return fail(500, { error: 'Accounts are not configured yet.' });

		// Explicit .eq('owner_id', ...) mirrors the "owner can delete their
		// own lessons" RLS policy's own condition — defense in depth, not
		// the only thing stopping a non-owner (RLS would reject the delete
		// either way), but it also means a non-owner's request affects zero
		// rows rather than relying solely on the policy to silently no-op.
		const { error: deleteError, count } = await locals.supabase
			.from('lessons')
			.delete({ count: 'exact' })
			.eq('id', params.id!)
			.eq('owner_id', locals.user.id);

		if (deleteError) return fail(400, { error: 'Could not delete this lesson. Please try again.' });
		if (!count) {
			reportRlsDenial('lessons/[id] delete: non-owner attempted to delete a lesson');
			return fail(403, { error: 'You do not have permission to delete this lesson.' });
		}

		throw redirect(303, '/lessons');
	}
};
