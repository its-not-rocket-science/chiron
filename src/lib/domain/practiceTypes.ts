/**
 * Domain type re-exports for the Phase 2A student-practice model.
 * Types are derived from the Zod schemas in `practiceSchemas.ts` (single
 * source of truth) — mirrors `types.ts`'s role for Phase 1's schemas.
 */
export type {
	EvidenceSupportJudgment,
	ResponseMode,
	ConfidenceRating,
	LearnerJudgment,
	ReasoningSignal,
	SignalClassification,
	EvidenceItem,
	CaseStage,
	ReasoningRule,
	ReasoningRubric,
	CreditableAnswerSpec,
	UpdateCriterion,
	PracticeCase,
	PublicPracticeCase,
	TutorState,
	TutorAction,
	PracticeSession,
	ScoringExplanation,
	PracticeAttempt,
	ScoringEvent
} from './practiceSchemas';
