import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LessonLicense } from '$lib/domain/schemas';

export interface ExampleLessonRow {
	id: string;
	title: string;
	subject_profile_id: string;
	attribution_name: string;
	attribution_url: string;
	license: LessonLicense;
	license_note: string | null;
	lesson_versions: {
		id: string;
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
 * Onboarding examples (Prompt E4) — seeded system-example lessons
 * (Prompt E3), pre-scored at seed time. This reads the stored score;
 * it never re-calls the LLM on view, per the prompt's explicit
 * instruction.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/examples');
	if (!locals.supabase) return { examples: [] };

	const { data, error } = await locals.supabase
		.from('lessons')
		.select(
			`id, title, subject_profile_id, attribution_name, attribution_url, license, license_note,
			 lesson_versions!lessons_current_version_fk(
				id, raw_text,
				scores(
					id, dialogue_score, dialogue_justification, authenticity_score, authenticity_justification,
					mentoring_score, mentoring_justification, model_id, prompt_version, created_at,
					skill_coverage_entries(id, skill, covered, confidence, justification),
					suggestions(id, pillar, text)
				)
			 )`
		)
		.eq('origin', 'system_example')
		.order('subject_profile_id', { ascending: true })
		.returns<ExampleLessonRow[]>();

	if (error) {
		// A stored suggestion never carries `suggestedScriptSwap` today —
		// no route in this app persists it (src/routes/api/lessons/+server.ts
		// drops it the same way when saving a regular lesson) — so this
		// select deliberately doesn't ask for a column that doesn't exist.
		// Log defensively rather than silently returning an empty page.
		console.error('Failed to load onboarding examples:', error.message);
	}
	return { examples: data ?? [] };
};

export const actions: Actions = {
	duplicate: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		if (typeof lessonId !== 'string') return fail(400, { error: 'Missing lesson id.' });

		const { data, error } = await locals.supabase.rpc('copy_lesson', {
			source_lesson_id: lessonId
		});
		if (error || !data) {
			return fail(400, { error: 'Could not copy this example. Please try again.' });
		}

		return { copiedLessonId: data as string };
	}
};
