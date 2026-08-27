import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { UserTestFeedbackInputSchema } from '$lib/domain/userTestFeedback';
import { isValidTestCohort } from '$lib/server/userTestCohorts';
import { checkRateLimit } from '$lib/server/rateLimit';

const RATE_LIMIT = { requests: 10, windowMs: 10 * 60 * 1000 };

/**
 * Records one tester's end-of-cohort feedback submission
 * (chiron_calibration_feedback_and_automation_prompts.txt Section 2).
 * Written via `locals.supabase`, not the service-role client — unlike
 * `practice_sessions`/`practice_attempts` (ADR-020), there's no FSM
 * integrity to protect here, so the normal owner-scoped RLS INSERT
 * policy (migration 0016) is sufficient on its own.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user || !locals.supabase) {
		return json({ error: { message: 'You must be signed in.' } }, { status: 401 });
	}

	const rateLimit = await checkRateLimit(
		`user-test-feedback:${locals.user.id}`,
		RATE_LIMIT.requests,
		RATE_LIMIT.windowMs
	);
	if (!rateLimit.allowed) {
		return json(
			{ error: { message: 'Too many requests. Please wait a bit and try again.' } },
			{ status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
		);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: { message: 'Request body must be JSON.' } }, { status: 400 });
	}

	const parsed = UserTestFeedbackInputSchema.safeParse(body);
	if (!parsed.success) {
		return json({ error: { message: 'Invalid request.' } }, { status: 400 });
	}

	if (!isValidTestCohort(parsed.data.testCohort)) {
		return json({ error: { message: 'Unknown or inactive test cohort.' } }, { status: 400 });
	}

	const input = parsed.data;
	const { error } = await locals.supabase.from('user_test_feedback').insert({
		student_id: locals.user.id,
		test_cohort: input.testCohort,
		cases_understandable: input.casesUnderstandable,
		tutor_made_think: input.tutorMadeThink,
		new_evidence_meaningful: input.newEvidenceMeaningful,
		tutor_repetitive: input.tutorRepetitive,
		confidence_understandable: input.confidenceUnderstandable,
		update_criterion_understandable: input.updateCriterionUnderstandable,
		perceived_steering: input.perceivedSteering,
		perceived_steering_explanation: input.perceivedSteeringExplanation,
		would_continue: input.wouldContinue,
		what_worked_best: input.whatWorkedBest,
		what_needs_changing: input.whatNeedsChanging
	});

	if (error) {
		// 23505 = unique_violation — one submission per (student, cohort),
		// migration 0016. A second submit isn't a server error, it's the
		// expected "you already did this" case.
		if (error.code === '23505') {
			return json(
				{ error: { message: 'Feedback for this cohort was already submitted.' } },
				{
					status: 409
				}
			);
		}
		return json(
			{ error: { message: 'Could not record feedback. Please try again.' } },
			{
				status: 400
			}
		);
	}

	return json({ ok: true });
};
