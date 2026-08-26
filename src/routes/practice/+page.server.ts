import { redirect } from '@sveltejs/kit';
import { listPracticeCasesPublic } from '$lib/domain/practiceCases';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/practice');
	// listPracticeCasesPublic() strips answerSpec/evidencePool/updateCriteria/
	// educatorNotes down to what a student may see before completing an
	// attempt (docs/PHASE2.md's "authored scoring metadata never reaches
	// the client before completion" guardrail) — safe to return directly.
	return { cases: listPracticeCasesPublic() };
};
