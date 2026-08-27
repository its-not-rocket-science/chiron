/**
 * Server-side allowlist check for Phase 2A user-test cohort ids
 * (chiron_calibration_feedback_and_automation_prompts.txt). Deliberately
 * not persisted anywhere — `USER_TEST_COHORTS` is the single source of
 * truth, checked fresh on every use, so removing a cohort from the env
 * var immediately stops honoring it even for a browser that already has
 * an older cohort cookie set.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { practiceCases } from '$lib/domain/practiceCases';
import { env } from './env';

/** Cookie carrying a tester's cohort id across page loads and case sessions. */
export const TEST_COHORT_COOKIE = 'chiron_test_cohort';

/** Pure parsing, exported separately so it's testable without the `$env` virtual module. */
export function parseCohortAllowlist(raw: string | undefined): string[] {
	return (raw ?? '')
		.split(',')
		.map((c) => c.trim())
		.filter(Boolean);
}

export function isValidTestCohort(cohort: string): boolean {
	return parseCohortAllowlist(env.USER_TEST_COHORTS).includes(cohort);
}

export interface UserTestEligibility {
	eligible: boolean;
	alreadySubmitted: boolean;
}

/**
 * Whether the given student has completed all three canonical cases
 * under this cohort, and whether they've already submitted feedback for
 * it — the one check both `GET /api/practice/user-test-eligibility`
 * (the client-side "show the feedback link" check) and
 * `/practice/feedback`'s own load function (the server-side gate on the
 * form itself) must agree on, so a tester can't reach a submittable
 * form by navigating to the URL directly before actually finishing.
 * `supabase` is the caller's own request-scoped client — RLS already
 * scopes every read here to `student_id = auth.uid()`, so this never
 * needs the service-role client.
 */
export async function checkUserTestEligibility(
	supabase: SupabaseClient,
	studentId: string,
	cohort: string
): Promise<UserTestEligibility> {
	const { data: sessions } = await supabase
		.from('practice_sessions')
		.select('case_id')
		.eq('student_id', studentId)
		.eq('test_cohort', cohort)
		.eq('fsm_state', 'COMPLETE');

	const completedCaseIds = new Set((sessions ?? []).map((s) => s.case_id as string));
	const eligible = practiceCases.every((c) => completedCaseIds.has(c.id));

	const { data: existingFeedback } = await supabase
		.from('user_test_feedback')
		.select('id')
		.eq('student_id', studentId)
		.eq('test_cohort', cohort)
		.maybeSingle();

	return { eligible, alreadySubmitted: Boolean(existingFeedback) };
}
