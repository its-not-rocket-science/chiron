import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

interface LessonRow {
	id: string;
	title: string;
	current_version_id: string | null;
	created_at: string;
}

interface ScoreRow {
	lesson_version_id: string;
	dialogue_score: number;
	authenticity_score: number;
	mentoring_score: number;
}

export interface DashboardTrendPoint {
	lessonId: string;
	title: string;
	createdAt: string;
	dialogueScore: number;
	authenticityScore: number;
	mentoringScore: number;
}

export interface OrgBenchmark {
	dialogue_avg: number | null;
	authenticity_avg: number | null;
	mentoring_avg: number | null;
	lesson_count: number;
}

/**
 * Personal trend: the current user's own pillar scores over their last
 * 10 scored lessons — no new access-control work needed, RLS already
 * scopes reads to the caller's own data (docs/ARCHITECTURE.md Section
 * 6). Fetched as two flat queries (lessons, then their scores by
 * `lesson_version_id`) rather than one PostgREST embedded/nested-filter
 * query, to keep this join unambiguous rather than depending on
 * multi-level embedded-resource filtering behavior.
 *
 * Org benchmark: only requested when the user has a membership, and
 * only ever calls `get_org_score_benchmark()` with no arguments — see
 * that function (migration 0015) and ADR-010 for why this must never
 * become a client-supplied `org_id` query.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/dashboard');
	if (!locals.supabase) return { trend: [], orgBenchmark: null };

	const { data: lessons } = await locals.supabase
		.from('lessons')
		.select('id, title, current_version_id, created_at')
		.eq('owner_id', locals.user.id)
		.not('current_version_id', 'is', null)
		.order('created_at', { ascending: false })
		.limit(10)
		.returns<LessonRow[]>();

	const versionIds = (lessons ?? [])
		.map((lesson) => lesson.current_version_id)
		.filter((id): id is string => id !== null);

	const { data: scores } =
		versionIds.length > 0
			? await locals.supabase
					.from('scores')
					.select('lesson_version_id, dialogue_score, authenticity_score, mentoring_score')
					.in('lesson_version_id', versionIds)
					.returns<ScoreRow[]>()
			: { data: [] as ScoreRow[] };

	const scoreByVersionId = new Map((scores ?? []).map((score) => [score.lesson_version_id, score]));

	const trend: DashboardTrendPoint[] = (lessons ?? [])
		.flatMap((lesson) => {
			const score = lesson.current_version_id
				? scoreByVersionId.get(lesson.current_version_id)
				: undefined;
			if (!score) return [];
			return [
				{
					lessonId: lesson.id,
					title: lesson.title,
					createdAt: lesson.created_at,
					dialogueScore: score.dialogue_score,
					authenticityScore: score.authenticity_score,
					mentoringScore: score.mentoring_score
				}
			];
		})
		.reverse();

	const { data: membership } = await locals.supabase
		.from('memberships')
		.select('org_id')
		.eq('user_id', locals.user.id)
		.maybeSingle();

	let orgBenchmark: OrgBenchmark | null = null;
	if (membership) {
		const { data } = await locals.supabase.rpc('get_org_score_benchmark');
		orgBenchmark = (data?.[0] as OrgBenchmark | undefined) ?? null;
	}

	return { trend, orgBenchmark };
};
