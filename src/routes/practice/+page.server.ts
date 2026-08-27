import { redirect } from '@sveltejs/kit';
import { listPracticeCasesPublic } from '$lib/domain/practiceCases';
import { isValidTestCohort, TEST_COHORT_COOKIE } from '$lib/server/userTestCohorts';
import type { PageServerLoad } from './$types';

/**
 * Entry point for a cohort tester (`?test=<id>`,
 * chiron_calibration_feedback_and_automation_prompts.txt). The cohort
 * only ever gets written to a cookie when it passes the server-side
 * allowlist check — "do not blindly persist arbitrary query strings" —
 * so a normal user never gets this cookie set at all, and their
 * behavior is unchanged.
 */
export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/practice');

	const testParam = url.searchParams.get('test');
	if (testParam && isValidTestCohort(testParam)) {
		cookies.set(TEST_COHORT_COOKIE, testParam, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
	}

	// listPracticeCasesPublic() strips answerSpec/evidencePool/updateCriteria/
	// educatorNotes down to what a student may see before completing an
	// attempt (docs/PHASE2.md's "authored scoring metadata never reaches
	// the client before completion" guardrail) — safe to return directly.
	return { cases: listPracticeCasesPublic() };
};
