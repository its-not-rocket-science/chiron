import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// No case data fetched here — the session-start API route
// (POST /api/practice/sessions) is the only thing that resolves a
// caseId, validates it, and returns the public case view. This load
// function only gates auth; params.caseId is passed straight through
// to the client, which starts (or reports "unknown case id" for) the
// session itself.
export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(303, `/login?redirect=/practice/${params.caseId}`);
	return { caseId: params.caseId };
};
