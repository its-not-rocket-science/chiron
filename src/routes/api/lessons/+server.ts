import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { ScoringResultSchema } from '$lib/domain/schemas';
import { getSubjectProfile } from '$lib/domain/subjectProfiles';

const SaveLessonRequestSchema = z.object({
	title: z.string().min(1),
	subjectProfileId: z.string().min(1),
	gradeLevel: z.string().min(1).nullable().optional(),
	visibility: z.enum(['private', 'org-shared', 'public-template']),
	orgId: z.uuid().nullable().optional(),
	source: z.enum(['paste', 'upload']),
	lessonText: z.string().min(1),
	scoringResult: ScoringResultSchema
});

/**
 * Persists an already-scored lesson (docs/ARCHITECTURE.md Section 6, 8).
 * Scoring itself already happened via POST /api/lessons/score — this just
 * saves that result. One RPC call (`save_lesson`, see the migration) does
 * lesson + version + score + skill coverage + suggestions atomically,
 * running as the signed-in user so RLS still governs every insert.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.supabase) {
		return json({ error: { message: 'You must be signed in to save a lesson.' } }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { message: 'Request body must be JSON.' } }, { status: 400 });
	}

	const parsedBody = SaveLessonRequestSchema.safeParse(body);
	if (!parsedBody.success) {
		return json(
			{ error: { message: 'Invalid request.', issues: parsedBody.error.issues } },
			{ status: 400 }
		);
	}

	const {
		title,
		subjectProfileId,
		gradeLevel,
		visibility,
		orgId,
		source,
		lessonText,
		scoringResult
	} = parsedBody.data;

	if (!getSubjectProfile(subjectProfileId)) {
		return json(
			{ error: { message: `Unknown subject profile: ${subjectProfileId}` } },
			{ status: 400 }
		);
	}
	if (visibility === 'org-shared' && !orgId) {
		return json(
			{ error: { message: 'A lesson can only be org-shared if an org is selected.' } },
			{ status: 400 }
		);
	}

	const { score, skillCoverage, suggestions } = scoringResult;

	const { data: lessonId, error } = await locals.supabase.rpc('save_lesson', {
		p_title: title,
		p_subject_profile_id: subjectProfileId,
		p_grade_level: gradeLevel ?? null,
		p_visibility: visibility,
		p_org_id: orgId ?? null,
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

	if (error || !lessonId) {
		return json(
			{ error: { message: 'Could not save this lesson. Please try again.' } },
			{ status: 400 }
		);
	}

	return json({ lessonId });
};
