import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { defaultFilters, parseFilters, passesScoreFilter, type LibraryLessonRow } from './filters';

interface MembershipWithOrgName {
	org_id: string;
	orgs: { name: string } | null;
}

/**
 * The shared library (docs/ARCHITECTURE.md Section 2.2, Prompt 9):
 * org-shared lessons in the signed-in user's own org, plus public
 * templates from anyone. RLS is the actual visibility gate — the
 * `.in('visibility', ...)` filter below just excludes the caller's own
 * *private* lessons from a browsing page that isn't meant to show them
 * (those live on `/lessons`), it isn't what keeps other orgs' lessons
 * out (the lessons SELECT policy already does that).
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/library');
	if (!locals.supabase) {
		return { orgLessons: [], publicLessons: [], myOrgName: null, filters: defaultFilters() };
	}

	const supabase = locals.supabase;
	const filters = parseFilters(url);

	const { data: membership } = await supabase
		.from('memberships')
		.select('org_id, orgs(name)')
		.eq('user_id', locals.user.id)
		.maybeSingle()
		.returns<MembershipWithOrgName>();

	let query = supabase
		.from('lessons')
		.select(
			`id, title, subject_profile_id, grade_level, visibility, featured, org_id, owner_id,
			 profiles_public(display_name),
			 lesson_versions!lessons_current_version_fk(scores(dialogue_score, authenticity_score, mentoring_score))`
		)
		.in('visibility', ['org-shared', 'public-template'])
		// System-example onboarding lessons (Prompt E2/E3) are a separate,
		// clearly-labeled category (see /examples, Prompt E4) — never mixed
		// into this ordinary-user browsing view, which also keeps
		// `owner_id`/`profiles_public` here always representing a real user.
		.eq('origin', 'user');

	if (filters.subjectProfileId) query = query.eq('subject_profile_id', filters.subjectProfileId);
	if (filters.gradeLevel) query = query.eq('grade_level', filters.gradeLevel);

	const { data } = await query.returns<LibraryLessonRow[]>();
	const rows = (data ?? []).filter((row) => passesScoreFilter(row, filters));

	const orgLessons = rows
		.filter((row) => row.visibility === 'org-shared')
		.sort((a, b) => Number(b.featured) - Number(a.featured));
	const publicLessons = rows.filter((row) => row.visibility === 'public-template');

	return { orgLessons, publicLessons, myOrgName: membership?.orgs?.name ?? null, filters };
};

export const actions: Actions = {
	saveCopy: async ({ request, locals }) => {
		if (!locals.supabase) return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		if (typeof lessonId !== 'string') return fail(400, { error: 'Missing lesson id.' });

		const { data, error } = await locals.supabase.rpc('copy_lesson', {
			source_lesson_id: lessonId
		});
		if (error || !data) {
			return fail(400, { error: 'Could not copy this lesson. It may no longer be available.' });
		}

		return { copiedLessonId: data as string };
	},

	// prompt.txt Prompt G4: any signed-in user can flag a public-template
	// lesson as inappropriate — logged for a Chiron moderator to review
	// (docs/OPERATIONS.md), never auto-unpublished on a report (that would
	// be its own abuse vector — one report shouldn't be able to take down
	// another teacher's lesson). A plain insert, not an RPC — reporting
	// needs no cross-table check (lesson_reports' own RLS policy is just
	// "reporter_id = auth.uid()", supabase/migrations/0021), and
	// deliberately doesn't `.select()` the inserted row back: this table's
	// SELECT policy only grants moderators read access, and Postgres
	// re-checks a returned row against the SELECT policy (ADR-010 point
	// 3) — a reporter asking for their own row back would get nothing,
	// not because the insert failed.
	reportLesson: async ({ request, locals }) => {
		if (!locals.supabase || !locals.user)
			return fail(500, { error: 'Accounts are not configured yet.' });

		const formData = await request.formData();
		const lessonId = formData.get('lessonId');
		const reason = formData.get('reason');
		if (typeof lessonId !== 'string' || typeof reason !== 'string' || !reason.trim()) {
			return fail(400, { error: 'Please explain why you are reporting this lesson.' });
		}

		const { error } = await locals.supabase
			.from('lesson_reports')
			.insert({ lesson_id: lessonId, reporter_id: locals.user.id, reason: reason.trim() });
		if (error) return fail(400, { error: 'Could not submit this report. Please try again.' });

		return { reportedLessonId: lessonId };
	}
};
