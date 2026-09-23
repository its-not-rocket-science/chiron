import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { LessonLicense } from '$lib/domain/schemas';
import { reportError } from '$lib/server/errorReporting';

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
	if (!locals.supabase) return { examples: [], existingCopies: {} };

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
		reportError('Failed to load onboarding examples', error.message);
	}

	// Load-time idempotency signal (prompt.txt Prompt D1 part 2) — this must
	// be correct on a plain revisit, not just immediately after a fresh
	// submission, so the page needs to know on every load which examples
	// this user already has a private copy of. copied_from_lesson_id
	// (migration 0018) is the lineage column copy_lesson() already writes;
	// RLS's "owner can view own lessons" branch covers this query.
	const existingCopies: Record<string, string> = {};
	if (data && data.length > 0) {
		const { data: copies } = await locals.supabase
			.from('lessons')
			.select('id, copied_from_lesson_id')
			.eq('owner_id', locals.user.id)
			.in(
				'copied_from_lesson_id',
				data.map((e) => e.id)
			);
		for (const copy of copies ?? []) {
			if (copy.copied_from_lesson_id) existingCopies[copy.copied_from_lesson_id] = copy.id;
		}
	}

	return { examples: data ?? [], existingCopies };
};

/**
 * Every branch returns the same three fields (error/copiedLessonId null
 * where not applicable) so `ActionData` is one consistent shape rather
 * than a union the template has to narrow — `sourceLessonId` lets the
 * page show feedback next to the button that was actually clicked,
 * instead of only at the top of a long page the user has scrolled away
 * from (found live: the success case had this same bug — the
 * confirmation rendered off-screen, which read as "the button does
 * nothing" even though the copy had actually succeeded).
 */
export const actions: Actions = {
	duplicate: async ({ request, locals }) => {
		if (!locals.supabase || !locals.user)
			return fail(500, {
				error: 'Accounts are not configured yet.',
				copiedLessonId: null,
				sourceLessonId: null,
				alreadyExisted: false
			});

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		if (typeof lessonId !== 'string')
			return fail(400, {
				error: 'Missing lesson id.',
				copiedLessonId: null,
				sourceLessonId: null,
				alreadyExisted: false
			});

		// Idempotency (prompt.txt Prompt D1 part 1): without this, clicking
		// "Duplicate and try your own edit" a second time silently created a
		// second identical private lesson — RLS-scoped to the caller's own
		// rows, so this can only ever find (or fail to find) their own copy,
		// never another user's.
		const { data: existing } = await locals.supabase
			.from('lessons')
			.select('id')
			.eq('owner_id', locals.user.id)
			.eq('copied_from_lesson_id', lessonId)
			.maybeSingle();
		if (existing) {
			return {
				error: null,
				copiedLessonId: existing.id,
				sourceLessonId: lessonId,
				alreadyExisted: true
			};
		}

		const { data, error } = await locals.supabase.rpc('copy_lesson', {
			source_lesson_id: lessonId
		});
		if (error || !data) {
			return fail(400, {
				error: 'Could not copy this example. Please try again.',
				copiedLessonId: null,
				sourceLessonId: lessonId,
				alreadyExisted: false
			});
		}

		return {
			error: null,
			copiedLessonId: data as string,
			sourceLessonId: lessonId,
			alreadyExisted: false
		};
	}
};
