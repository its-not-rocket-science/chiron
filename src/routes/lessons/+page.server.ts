import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { SCORING_PROMPT_VERSION } from '$lib/providers/scoringPrompt';

interface LessonListRow {
	id: string;
	title: string;
	subject_profile_id: string;
	grade_level: string | null;
	visibility: 'private' | 'org-shared' | 'public-template';
	created_at: string;
	lesson_versions: { scores: { prompt_version: string | null } | null } | null;
}

export interface LessonListItem {
	id: string;
	title: string;
	subject_profile_id: string;
	grade_level: string | null;
	visibility: 'private' | 'org-shared' | 'public-template';
	created_at: string;
	/** `prompt.txt` Prompt G5 point 2 — the current version's score used an
	 * earlier revision of the scoring rubric than `SCORING_PROMPT_VERSION`.
	 * Computed here, server-side, rather than shipping SCORING_PROMPT_VERSION
	 * comparison logic to the client, so "what counts as current" has one
	 * source of truth. A lesson with no score at all isn't stale — there's
	 * nothing to re-score yet. */
	isStale: boolean;
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/lessons');
	if (!locals.supabase) return { lessons: [] as LessonListItem[] };

	const { data } = await locals.supabase
		.from('lessons')
		.select(
			`id, title, subject_profile_id, grade_level, visibility, created_at,
			 lesson_versions!lessons_current_version_fk(scores(prompt_version))`
		)
		.eq('owner_id', locals.user.id)
		.order('created_at', { ascending: false })
		.returns<LessonListRow[]>();

	const lessons: LessonListItem[] = (data ?? []).map((row) => {
		const promptVersion = row.lesson_versions?.scores?.prompt_version ?? null;
		return {
			id: row.id,
			title: row.title,
			subject_profile_id: row.subject_profile_id,
			grade_level: row.grade_level,
			visibility: row.visibility,
			created_at: row.created_at,
			isStale: promptVersion !== null && promptVersion !== SCORING_PROMPT_VERSION
		};
	});

	return { lessons };
};
