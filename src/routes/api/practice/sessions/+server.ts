import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { getPracticeCase, listPracticeCasesPublic } from '$lib/domain/practiceCases';
import { toPublicPracticeCase } from '$lib/domain/practiceSchemas';
import { checkRateLimit } from '$lib/server/rateLimit';
import { getServiceRoleClient } from '$lib/server/serviceRoleClient';
import { practiceSessionFromRow, type PracticeSessionRow } from '$lib/server/practiceSessionRow';
import { isValidTestCohort, TEST_COHORT_COOKIE } from '$lib/server/userTestCohorts';

const RequestBodySchema = z.object({ caseId: z.string().min(1) });
const RATE_LIMIT = { requests: 30, windowMs: 10 * 60 * 1000 };

/**
 * Starts a new Phase 2A practice session for one of the static
 * canonical cases (docs/PHASE2A_IMPLEMENTATION.md Section 6). Returns
 * only the public view of the case (`docs/PHASE2.md`'s "answerSpec
 * never reaches the client before completion" guardrail) — never the
 * full case object, which lives only in server-side module scope
 * (ADR-019) and is never serialized into a response.
 */
export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.user || !locals.supabase) {
		return json(
			{ error: { message: 'You must be signed in to start a practice case.' } },
			{ status: 401 }
		);
	}

	// Keyed by user id, not IP (Prompt 31) — this route is always
	// authenticated, and Chiron's target market is schools, where many
	// real students can share one IP. An IP-keyed limit would let one
	// student's activity throttle a whole classroom.
	const rateLimit = await checkRateLimit(
		`practice-session:${locals.user.id}`,
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

	const parsedBody = RequestBodySchema.safeParse(body);
	if (!parsedBody.success) {
		return json({ error: { message: 'Invalid request.' } }, { status: 400 });
	}

	const practiceCase = getPracticeCase(parsedBody.data.caseId);
	if (!practiceCase) {
		return json({ error: { message: 'Unknown case id.' } }, { status: 400 });
	}

	// Re-validated here, not just trusted from the cookie having been set
	// once — a cohort removed from the allowlist after a tester's cookie
	// was already stamped must stop being honored immediately.
	const cookieCohort = cookies.get(TEST_COHORT_COOKIE) ?? null;
	const testCohort = cookieCohort && isValidTestCohort(cookieCohort) ? cookieCohort : null;

	// Writes to practice_sessions go through the service-role client, not
	// locals.supabase — ADR-020: no RLS policy grants authenticated
	// clients INSERT/UPDATE on this table at all, specifically so FSM
	// integrity can't be bypassed via a direct REST call. student_id is
	// always locals.user.id here, never client-supplied.
	const { data, error } = await getServiceRoleClient()
		.from('practice_sessions')
		.insert({
			student_id: locals.user.id,
			case_id: practiceCase.id,
			fsm_state: 'PRESENT_SCENARIO',
			revealed_evidence_ids: [],
			transcript: [],
			initial_judgment: null,
			update_criterion_text: null,
			revised_judgment: null,
			reflection_text: null,
			test_cohort: testCohort
		})
		.select(
			'id, student_id, case_id, fsm_state, revealed_evidence_ids, transcript, initial_judgment, update_criterion_text, revised_judgment, reflection_text, created_at, updated_at'
		)
		.maybeSingle()
		.overrideTypes<PracticeSessionRow>();

	if (error || !data) {
		return json({ error: { message: 'Could not start a practice session.' } }, { status: 400 });
	}

	const session = practiceSessionFromRow(data);
	return json({
		sessionId: session.id,
		fsmState: session.fsmState,
		case: toPublicPracticeCase(practiceCase),
		testCohort
	});
};

/** GET lists the three canonical cases (public view only) — used by the /practice landing page's load function too, exposed here for direct API access. */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: { message: 'You must be signed in.' } }, { status: 401 });
	}
	return json({ cases: listPracticeCasesPublic() });
};
