import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { ScoringResultSchema } from '$lib/domain/schemas';
import { getSubjectProfile } from '$lib/domain/subjectProfiles';
import { reportRlsDenial } from '$lib/server/errorReporting';

const ReviseLessonRequestSchema = z.object({
	subjectProfileId: z.string().min(1),
	gradeLevel: z.string().min(1).nullable().optional(),
	source: z.enum(['paste', 'upload']),
	lessonText: z.string().min(1),
	scoringResult: ScoringResultSchema
});

/**
 * Persists a revision of an EXISTING saved lesson as a new LessonVersion
 * (prompt.txt Prompt D2 — the lesson-detail page's "revise and resubmit").
 * Distinct from `POST /api/lessons` (`save_lesson`), which always creates
 * a brand-new lesson (ADR-007) — there was no prior code path to add a
 * version to a lesson the caller already owns. Scoring itself already
 * happened via `POST /api/lessons/score`; this only persists that result,
 * same division of labor as `POST /api/lessons`.
 */
export const POST: RequestHandler = async ({ request, locals, params }) => {
	if (!locals.user || !locals.supabase) {
		return json(
			{ error: { message: 'You must be signed in to revise a lesson.' } },
			{ status: 401 }
		);
	}

	const lessonId = params.id;
	if (!lessonId) return json({ error: { message: 'Missing lesson id.' } }, { status: 400 });

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { message: 'Request body must be JSON.' } }, { status: 400 });
	}

	const parsedBody = ReviseLessonRequestSchema.safeParse(body);
	if (!parsedBody.success) {
		return json(
			{ error: { message: 'Invalid request.', issues: parsedBody.error.issues } },
			{ status: 400 }
		);
	}

	const { subjectProfileId, gradeLevel, source, lessonText, scoringResult } = parsedBody.data;

	if (!getSubjectProfile(subjectProfileId)) {
		return json(
			{ error: { message: `Unknown subject profile: ${subjectProfileId}` } },
			{ status: 400 }
		);
	}

	// Belt-and-suspenders ownership check, same discipline as every other
	// owner-only mutation in this app (e.g. examples/+page.server.ts's
	// duplicate action) — never trust the RPC's own check as the only
	// layer. RLS's "view lessons per visibility rules" policy means a
	// non-owner viewing a public-template/org-shared lesson could otherwise
	// reach this far with a real lesson id; this returns a clean 403
	// instead of leaking a generic RPC failure.
	const { data: lesson } = await locals.supabase
		.from('lessons')
		.select('id, owner_id')
		.eq('id', lessonId)
		.maybeSingle();
	if (!lesson) return json({ error: { message: 'Lesson not found.' } }, { status: 404 });
	if (lesson.owner_id !== locals.user.id) {
		reportRlsDenial('lessons/[id]/revise: non-owner attempted to revise a lesson');
		return json(
			{ error: { message: 'You do not have permission to edit this lesson.' } },
			{ status: 403 }
		);
	}

	const { score, skillCoverage, suggestions } = scoringResult;

	const { data: versionId, error } = await locals.supabase.rpc('add_lesson_version', {
		p_lesson_id: lessonId,
		p_subject_profile_id: subjectProfileId,
		p_grade_level: gradeLevel ?? null,
		p_source: source,
		p_raw_text: lessonText,
		p_dialogue_score: score.dialogueScore,
		p_dialogue_justification: score.dialogueJustification,
		p_authenticity_score: score.authenticityScore,
		p_authenticity_justification: score.authenticityJustification,
		p_mentoring_score: score.mentoringScore,
		p_mentoring_justification: score.mentoringJustification,
		p_model_id: score.modelId,
		p_prompt_version: score.promptVersion,
		p_skill_coverage: skillCoverage.map(({ skill, covered, confidence, justification }) => ({
			skill,
			covered,
			confidence,
			justification
		})),
		p_suggestions: suggestions.map(({ pillar, text }) => ({ pillar, text }))
	});

	if (error || !versionId) {
		return json(
			{ error: { message: 'Could not save your revision. Please try again.' } },
			{ status: 400 }
		);
	}

	return json({ versionId });
};
