/**
 * Maps between practice_sessions' snake_case DB row shape and the
 * camelCase PracticeSession domain type. Small and route-local rather
 * than a DataStore abstraction — routes call `locals.supabase` directly
 * for Phase 2A persistence, the same as everywhere else in this
 * codebase (ADR-014).
 */
import { PracticeSessionSchema, type PracticeSession } from '$lib/domain/practiceSchemas';

// jsonb columns transported loosely; practiceSessionFromRow() re-validates
// everything through PracticeSessionSchema immediately below, so `any`
// here costs nothing real. Using `unknown` instead trips up
// supabase-js's `.overrideTypes<T>()` type-level compatibility check.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PracticeSessionRow {
	id: string;
	student_id: string;
	case_id: string;
	fsm_state: string;
	revealed_evidence_ids: any;
	transcript: any;
	initial_judgment: any;
	update_criterion_text: string | null;
	revised_judgment: any;
	reflection_text: string | null;
	created_at: string;
	updated_at: string;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export function practiceSessionFromRow(row: PracticeSessionRow): PracticeSession {
	return PracticeSessionSchema.parse({
		id: row.id,
		studentId: row.student_id,
		caseId: row.case_id,
		fsmState: row.fsm_state,
		revealedEvidenceIds: row.revealed_evidence_ids,
		transcript: row.transcript,
		initialJudgment: row.initial_judgment,
		updateCriterionText: row.update_criterion_text,
		revisedJudgment: row.revised_judgment,
		reflectionText: row.reflection_text,
		createdAt: row.created_at,
		updatedAt: row.updated_at
	});
}

/** Fields updatable after the initial insert — everything but id/studentId/caseId/createdAt. */
export function practiceSessionToUpdateRow(session: PracticeSession) {
	return {
		fsm_state: session.fsmState,
		revealed_evidence_ids: session.revealedEvidenceIds,
		transcript: session.transcript,
		initial_judgment: session.initialJudgment,
		update_criterion_text: session.updateCriterionText,
		revised_judgment: session.revisedJudgment,
		reflection_text: session.reflectionText
	};
}
