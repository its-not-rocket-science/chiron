import { redirect } from '@sveltejs/kit';
import { checkUserTestEligibility, isValidTestCohort } from '$lib/server/userTestCohorts';
import type { PageServerLoad } from './$types';

/**
 * The one-time feedback form shown after a cohort tester completes all
 * three canonical cases (chiron_calibration_feedback_and_automation_
 * prompts.txt Section 2). `?test=<id>` is required and re-validated here
 * — a stale or missing cohort just bounces back to the case picker
 * rather than showing a broken form.
 *
 * Eligibility is re-checked here too, not just by the client before it
 * shows the "Continue to feedback" link — the same
 * `checkUserTestEligibility` the eligibility endpoint uses, so a tester
 * who navigates here directly before finishing all three cases lands
 * back on the picker instead of a form they can't legitimately submit,
 * and one who already submitted sees a "thanks, already recorded" state
 * instead of the form and a 409 on submit.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/practice');
	if (!locals.supabase) throw redirect(303, '/practice');

	const testCohort = url.searchParams.get('test');
	if (!testCohort || !isValidTestCohort(testCohort)) throw redirect(303, '/practice');

	const { eligible, alreadySubmitted } = await checkUserTestEligibility(
		locals.supabase,
		locals.user.id,
		testCohort
	);
	if (!eligible && !alreadySubmitted) throw redirect(303, '/practice');

	return { testCohort, alreadySubmitted };
};
