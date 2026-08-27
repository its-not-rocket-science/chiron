import { redirect } from '@sveltejs/kit';
import { isValidTestCohort, TEST_COHORT_COOKIE } from '$lib/server/userTestCohorts';
import type { PageServerLoad } from './$types';

// No case data fetched here — the session-start API route
// (POST /api/practice/sessions) is the only thing that resolves a
// caseId, validates it, and returns the public case view. This load
// function only gates auth; params.caseId is passed straight through
// to the client, which starts (or reports "unknown case id" for) the
// session itself.
//
// Also handles ?test=<id> here, not just on /practice's own load — a
// shared cohort link might point straight at a case rather than the
// case picker.
export const load: PageServerLoad = async ({ locals, params, url, cookies }) => {
	if (!locals.user) throw redirect(303, `/login?redirect=/practice/${params.caseId}`);

	const testParam = url.searchParams.get('test');
	if (testParam && isValidTestCohort(testParam)) {
		cookies.set(TEST_COHORT_COOKIE, testParam, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60 * 24 * 30
		});
	}

	return { caseId: params.caseId };
};
