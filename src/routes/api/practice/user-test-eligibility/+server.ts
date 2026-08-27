import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { checkUserTestEligibility, isValidTestCohort } from '$lib/server/userTestCohorts';

/**
 * Tells the client whether the signed-in tester has completed all three
 * canonical cases in the given cohort, and whether they've already
 * submitted feedback for it — used to decide whether to offer the
 * feedback form after a case completes
 * (chiron_calibration_feedback_and_automation_prompts.txt Section 2).
 * `/practice/feedback`'s own load function runs the same check
 * server-side before rendering the form — this endpoint is what the
 * client polls right after finishing a case, that load function is the
 * actual gate.
 *
 * No service-role client needed: `practice_sessions`/`user_test_feedback`
 * SELECT policies already scope every read to `student_id = auth.uid()`
 * (ADR-020/this migration), so a plain `locals.supabase` read can only
 * ever see the caller's own rows regardless of the cohort filter — this
 * is a read of the caller's own data, not an integrity-sensitive write.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user || !locals.supabase) {
		return json({ error: { message: 'You must be signed in.' } }, { status: 401 });
	}

	const cohort = url.searchParams.get('cohort');
	if (!cohort || !isValidTestCohort(cohort)) {
		return json({ eligible: false, alreadySubmitted: false });
	}

	const result = await checkUserTestEligibility(locals.supabase, locals.user.id, cohort);
	return json(result);
};
