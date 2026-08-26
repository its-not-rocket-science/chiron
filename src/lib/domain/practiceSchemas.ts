/**
 * Zod schemas for the Phase 2A student-practice domain model
 * (docs/PHASE2.md, docs/PHASE2A_IMPLEMENTATION.md — `prompts.txt`
 * Prompt 20). Kept in a dedicated module rather than appended to
 * `schemas.ts`: Phase 1's schema file is already substantial, this is a
 * large and logically separate surface (nothing in Phase 1 depends on
 * it, and per ADR-019 the case content here isn't even
 * database-backed), and splitting keeps Phase 1's schemas untouched
 * rather than silently reshaping them to make room.
 *
 * Pure TypeScript + Zod only — no Svelte, no Supabase client, no
 * vendor LLM SDK. Same rule as schemas.ts: every externally-sourced or
 * LLM-produced payload must be parsed through one of these before the
 * app treats it as trusted.
 */
import { z } from 'zod';
import { CTSkillIdSchema } from './schemas';

const id = () => z.uuid();
const timestamp = () => z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------
// Judgment model (docs/PHASE2.md Section 2, Prompt 16)
// ---------------------------------------------------------------------------

export const evidenceSupportJudgmentOrder = [
	'strongly_unsupported',
	'somewhat_unsupported',
	'uncertain',
	'somewhat_supported',
	'strongly_supported'
] as const;

export const EvidenceSupportJudgmentSchema = z.enum(evidenceSupportJudgmentOrder);
export type EvidenceSupportJudgment = z.infer<typeof EvidenceSupportJudgmentSchema>;

/** Ordinal position on the scale — for range/ordering checks, not for display. */
function judgmentRank(j: EvidenceSupportJudgment): number {
	return evidenceSupportJudgmentOrder.indexOf(j);
}

// Phase 2A implements only 'evidence_support_scale'. 'categorical' and
// 'decision' are named, not designed (docs/PHASE2.md Section 2) — a
// future case type needing a different response shape is a new branch
// elsewhere, not a rewrite of this schema.
export const ResponseModeSchema = z.enum(['evidence_support_scale', 'categorical', 'decision']);
export type ResponseMode = z.infer<typeof ResponseModeSchema>;

/** 0-100. Kept separate from Phase 1's low/medium/high `Confidence` (schemas.ts) — a different scale for a different purpose. */
export const ConfidenceRatingSchema = z.number().int().min(0).max(100);
export type ConfidenceRating = z.infer<typeof ConfidenceRatingSchema>;

/**
 * `prompts.txt` Prompt 32 — "maximum learner free-text length," shared
 * between the transition route's server-side validation (the real
 * enforcement) and the practice UI's `maxlength` attributes (an
 * immediate-feedback nicety, not itself the guarantee). Every one of
 * these fields is echoed into a tutor/classifier prompt directly or via
 * the transcript, so an unbounded length is a cost-abuse vector, not
 * just a UX concern. 2000 characters is well beyond what a thoughtful
 * paragraph response needs.
 */
export const FREE_TEXT_MAX_LENGTH = 2000;

/**
 * What a student actually submits at a judgment step: the scale value,
 * their confidence, and their free-text reasoning. Used for both the
 * initial and revised judgment — the FSM collects judgment and
 * confidence as two separate interaction steps (docs/PHASE2.md Section
 * 3: ASK_INITIAL_JUDGMENT then ASK_CONFIDENCE), but they're stored as
 * one record once both are given.
 */
export const LearnerJudgmentSchema = z.object({
	judgment: EvidenceSupportJudgmentSchema,
	confidence: ConfidenceRatingSchema,
	reasoning: z.string().min(1)
});
export type LearnerJudgment = z.infer<typeof LearnerJudgmentSchema>;

// ---------------------------------------------------------------------------
// Reasoning signals (docs/PHASE2.md Section 1a, Prompts 15/17)
// ---------------------------------------------------------------------------

export const reasoningSignalIds = [
	'identifies_missing_evidence',
	'distinguishes_correlation_from_causation',
	'identifies_confounder',
	'generates_alternative_hypothesis',
	'identifies_source_problem',
	'identifies_denominator_problem',
	'identifies_base_rate_issue',
	'acknowledges_uncertainty',
	'updates_for_relevant_evidence',
	'resists_irrelevant_evidence',
	'states_update_criterion',
	'relevant_update_criterion',
	'follows_declared_update_criterion',
	'moves_goalposts_after_evidence',
	'recognises_limit_of_available_evidence'
] as const;

/** The closed, cross-case signal vocabulary. Case-specific update-criterion signals are NOT members of this set — see UpdateCriterionSchema. */
export const ReasoningSignalSchema = z.enum(reasoningSignalIds);
export type ReasoningSignal = z.infer<typeof ReasoningSignalSchema>;

/**
 * Base shape (permissive on `signal`) — because a classification's
 * allowed signal set is dynamic: either the closed cross-case
 * vocabulary above, or one case's own `updateCriteria` ids (Section
 * 3's per-case-scoped validation discipline). Use
 * `signalClassificationSchemaFor()` to validate against a specific
 * call's actual allowed set — never trust `signal` against the closed
 * enum unconditionally, since that would wrongly reject legitimate
 * update-criterion classifications.
 */
export const SignalClassificationSchema = z
	.object({
		signal: z.string().min(1),
		present: z.boolean(),
		confidence: z.enum(['low', 'medium', 'high']),
		// A literal span copied from the learner's own submitted text — not
		// a paraphrase. Structural verification (is it actually found in the
		// source text) is the caller's job at parse time (provider-layer
		// work, Prompt 23), not this schema's — Zod can't see the source text.
		// Meaningful only when present: true — required non-empty
		// unconditionally here until `prompts.txt` Prompt 34, which
		// surfaced a real live-classifier failure: the model naturally
		// returns an empty evidenceQuote for present: false entries (there
		// is nothing to quote), and Prompt 34's added initial-reasoning
		// classifier call — whose typically thinner text produces far more
		// present: false results than the richer revised-reasoning call
		// ever did — made this common enough to reliably fail the whole
		// classification, falling back to "no signals detected."
		evidenceQuote: z.string()
	})
	.refine((c) => !c.present || c.evidenceQuote.length > 0, {
		message: 'evidenceQuote must be non-empty when present is true',
		path: ['evidenceQuote']
	});
export type SignalClassification = z.infer<typeof SignalClassificationSchema>;

/** Validates `signal` against exactly the ids allowed for one classification call. */
export function signalClassificationSchemaFor(allowedSignals: readonly string[]) {
	return SignalClassificationSchema.refine((c) => allowedSignals.includes(c.signal), {
		message: 'signal is not in the allowed set for this call',
		path: ['signal']
	});
}

// ---------------------------------------------------------------------------
// Evidence and case stages
// ---------------------------------------------------------------------------

export const EvidenceItemSchema = z.object({
	id: id(),
	text: z.string().min(1),
	// Evidence is revealed in stages, driven by the tutor FSM, never
	// chosen or invented by the LLM at runtime. Must be unique per case
	// (see PracticeCaseSchema's refine) — two items can't share a reveal
	// step in this design; author a case stage per item.
	revealOrder: z.number().int().min(0),
	stance: z.enum(['supports_claim', 'supports_counter_claim', 'ambiguous'])
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

/**
 * One reveal step of a case, derived from `evidencePool` — NOT
 * separately authored. Kept as its own type (rather than just reading
 * `revealOrder` inline everywhere) so FSM code has one clear thing to
 * iterate: `deriveCaseStages()` below is the single place that turns
 * "evidence items with a revealOrder" into "the ordered sequence of
 * reveal steps," rather than that logic being reimplemented at every
 * call site with its own risk of drifting from the authored data.
 */
export const CaseStageSchema = z.object({
	stageNumber: z.number().int().min(0),
	evidenceItemId: id()
});
export type CaseStage = z.infer<typeof CaseStageSchema>;

export function deriveCaseStages(evidencePool: readonly EvidenceItem[]): CaseStage[] {
	return [...evidencePool]
		.sort((a, b) => a.revealOrder - b.revealOrder)
		.map((item, index) => ({ stageNumber: index, evidenceItemId: item.id }));
}

// ---------------------------------------------------------------------------
// Reasoning rubric (docs/PHASE2.md Section 2/4, Prompt 18 — ADR-018)
// ---------------------------------------------------------------------------

export const ReasoningRuleSchema = z
	.object({
		id: id(),
		acceptedJudgments: z.array(EvidenceSupportJudgmentSchema).min(1),
		// Signals (the closed vocabulary above, or this case's own
		// updateCriteria signals) that count toward satisfying this rule.
		// Validated against the case's actual allowed set at the
		// PracticeCaseSchema level below, not here — a rule in isolation
		// can't know which case it belongs to.
		requiredSignals: z.array(z.string().min(1)).default([]),
		minimumRequired: z.number().int().min(0),
		explanation: z.string().min(1)
	})
	.refine((rule) => rule.minimumRequired <= rule.requiredSignals.length, {
		message:
			'minimumRequired cannot exceed the number of requiredSignals — the rule could never be satisfied',
		path: ['minimumRequired']
	});
export type ReasoningRule = z.infer<typeof ReasoningRuleSchema>;

export const ReasoningRubricSchema = z.object({
	finalJudgmentRules: z.array(ReasoningRuleSchema).min(1),
	partialCreditSignals: z.array(z.string().min(1)).default([])
});
export type ReasoningRubric = z.infer<typeof ReasoningRubricSchema>;

/** A calibration-eligible target range may span at most this many adjacent judgment bands (`docs/CALIBRATION.md`, `prompts.txt` Prompt 27, ADR-023) — wider than this and "landed inside the range" stops being a meaningful proxy for "the confidence question was actually answerable." */
const MAX_CALIBRATION_ELIGIBLE_BAND_WIDTH = 2;

export const CreditableAnswerSpecSchema = z
	.object({
		targetRange: z.object({
			min: EvidenceSupportJudgmentSchema,
			max: EvidenceSupportJudgmentSchema
		}),
		reasoningRubric: ReasoningRubricSchema,
		rationale: z.string().min(1),
		// Case metadata deciding whether this case's confidence data is
		// valid for calibration aggregation (`prompts.txt` Prompt 27's
		// explicit requirement — "do not automatically treat every
		// practice case as calibration-scorable"). Authored, not
		// auto-computed, but structurally checked against targetRange's
		// own width below — an author can't mark a wide, deliberately
		// permissive range as calibration-eligible by mistake.
		calibrationEligible: z.boolean()
	})
	.refine((spec) => judgmentRank(spec.targetRange.min) <= judgmentRank(spec.targetRange.max), {
		message: 'targetRange.min must not rank above targetRange.max on the evidence-support scale',
		path: ['targetRange']
	})
	.refine(
		(spec) =>
			!spec.calibrationEligible ||
			judgmentRank(spec.targetRange.max) - judgmentRank(spec.targetRange.min) + 1 <=
				MAX_CALIBRATION_ELIGIBLE_BAND_WIDTH,
		{
			message: `calibrationEligible cases must have a targetRange spanning at most ${MAX_CALIBRATION_ELIGIBLE_BAND_WIDTH} adjacent judgment bands`,
			path: ['calibrationEligible']
		}
	);
export type CreditableAnswerSpec = z.infer<typeof CreditableAnswerSpecSchema>;

// ---------------------------------------------------------------------------
// Update criterion (docs/PHASE2.md Section 2/3, Prompt 17)
// ---------------------------------------------------------------------------

export const UpdateCriterionSchema = z.object({
	id: id(),
	// This case's own classification target — deliberately NOT a
	// ReasoningSignal. See SignalClassificationSchema's comment.
	signal: z.string().min(1),
	description: z.string().min(1),
	// Which evidencePool item(s) actually deliver what this criterion
	// promised — the structural link `updateCriterionConsistency.ts`
	// (`prompts.txt` Prompt 26) needs to determine "did the promised
	// evidence appear" deterministically (revealedEvidenceIds ⊇ this
	// set), rather than re-asking an LLM to judge that at scoring time.
	// Validated against the case's own evidencePool ids in
	// PracticeCaseSchema's superRefine below.
	relevantEvidenceItemIds: z.array(id()).min(1)
});
export type UpdateCriterion = z.infer<typeof UpdateCriterionSchema>;

/**
 * The five deterministic outcomes `updateCriterionConsistency.ts`
 * (`prompts.txt` Prompt 26) can reach — matching the prompt's own test
 * list exactly (criterion met + update; criterion met + no update;
 * criterion not met + no update; criterion not met + update anyway;
 * vague/unscoreable criterion). No "moved goalposts" category: Prompt
 * 26 says to be conservative about that determination, and the
 * conservative choice made here is to describe `criterion_not_met_updated`
 * factually — evidence never appeared, judgment changed anyway — without
 * asserting *why*, rather than adding an accusatory sixth status (see
 * ADR-022).
 */
export const UpdateCriterionConsistencyStatusSchema = z.enum([
	'criterion_met_and_followed',
	'criterion_met_no_update',
	'criterion_not_met_no_update',
	'criterion_not_met_updated',
	'criterion_not_relevant'
]);
export type UpdateCriterionConsistencyStatus = z.infer<
	typeof UpdateCriterionConsistencyStatusSchema
>;

export const UpdateCriterionConsistencyResultSchema = z.object({
	status: UpdateCriterionConsistencyStatusSchema,
	// Statically templated from real values (the learner's own quoted
	// criterion, factual appeared/updated booleans) — never LLM-generated
	// prose. Written in the register docs/PHASE2.md Section 3 requires:
	// "your criterion said X; when X happened, Y" — never a psychological
	// label.
	explanation: z.string().min(1),
	// Which of this case's updateCriteria was found relevant — null only
	// for 'criterion_not_relevant'.
	matchedCriterionId: id().nullable(),
	evidenceAppeared: z.boolean().nullable(),
	judgmentUpdated: z.boolean().nullable()
});
export type UpdateCriterionConsistencyResult = z.infer<
	typeof UpdateCriterionConsistencyResultSchema
>;

// ---------------------------------------------------------------------------
// PracticeCase
// ---------------------------------------------------------------------------

/**
 * A case's own authorial grounding (`prompts.txt` Prompt 21 — "include
 * source/provenance metadata"). Matters especially for a case *about*
 * media/source verification (Case 3): the case's own content must be
 * clearly fictional/synthetic, not mistaken for a real reported event
 * if quoted out of context — the same discipline Phase 1's few-shot
 * scoring examples already follow ("write these yourself; do not copy
 * real excerpts from any external source").
 */
export const CaseProvenanceSchema = z.object({
	isSynthetic: z.boolean(),
	note: z.string().min(1)
});
export type CaseProvenance = z.infer<typeof CaseProvenanceSchema>;

// No PracticeCaseVersion type: Phase 2A's three cases are static,
// hand-authored, fixed content (ADR-019) — nobody revises a published
// case the way a teacher revises a LessonVersion. Versioning has no
// requirement to satisfy in this phase; add it if/when Phase 2B's
// case-authoring workflow actually needs one, rather than building it
// speculatively now.

export const PracticeCaseSchema = z
	.object({
		id: z.string().min(1), // a stable slug, not a UUID — no practice_cases table (ADR-019), so no DB-generated id
		title: z.string().min(1),
		subjectProfileId: z.string().min(1), // same convention as Lesson.subjectProfileId — a slug, not a schema-enforced FK
		skillTags: z.array(CTSkillIdSchema).min(1),
		dispositionTags: z.array(z.enum(['approach_to_problem', 'approach_to_inquiry'])).min(1),
		difficulty: z.enum(['intro', 'core', 'stretch']),
		responseMode: ResponseModeSchema,
		scenario: z.string().min(1),
		claim: z.string().min(1),
		evidencePool: z.array(EvidenceItemSchema).min(1),
		answerSpec: CreditableAnswerSpecSchema,
		usesUpdateCriterion: z.boolean(),
		updateCriteria: z.array(UpdateCriterionSchema).optional(),
		provenance: CaseProvenanceSchema,
		// Hidden from learners entirely — same treatment as answerSpec,
		// excluded from PublicPracticeCaseSchema below. For a case
		// reviewer/author, not surfaced to a student at any point.
		educatorNotes: z.string().min(1),
		// Shown to the student, but only *after* an attempt completes —
		// excluded from PublicPracticeCaseSchema (which is what's readable
		// before/during an attempt) the same way answerSpec is, but for a
		// different reason: not a secret forever, just not yet. Section
		// 11 of docs/PHASE2A_IMPLEMENTATION.md is what eventually reads
		// this at SCORE_AND_RECORD / DISPOSITION_SELF_CHECK time.
		teachingExplanation: z.string().min(1),
		visibility: z.enum(['private', 'org-shared', 'public-template']),
		createdBy: z.enum(['system', 'teacher-generated'])
	})
	.superRefine((practiceCase, ctx) => {
		// usesUpdateCriterion <-> updateCriteria consistency.
		if (practiceCase.usesUpdateCriterion) {
			if (!practiceCase.updateCriteria || practiceCase.updateCriteria.length === 0) {
				ctx.addIssue({
					code: 'custom',
					message: 'updateCriteria must be non-empty when usesUpdateCriterion is true',
					path: ['updateCriteria']
				});
			}
		} else if (practiceCase.updateCriteria !== undefined) {
			ctx.addIssue({
				code: 'custom',
				message: 'updateCriteria must be omitted when usesUpdateCriterion is false',
				path: ['updateCriteria']
			});
		}

		// Evidence reveal order must be unique — two items can't share a
		// reveal step (see CaseStageSchema).
		const revealOrders = practiceCase.evidencePool.map((e) => e.revealOrder);
		if (new Set(revealOrders).size !== revealOrders.length) {
			ctx.addIssue({
				code: 'custom',
				message: 'evidencePool items must have unique revealOrder values',
				path: ['evidencePool']
			});
		}

		// Every updateCriterion.relevantEvidenceItemIds entry must resolve
		// to a real item in this case's own evidencePool.
		const evidenceIds = new Set(practiceCase.evidencePool.map((e) => e.id));
		for (const criterion of practiceCase.updateCriteria ?? []) {
			for (const evidenceId of criterion.relevantEvidenceItemIds) {
				if (!evidenceIds.has(evidenceId)) {
					ctx.addIssue({
						code: 'custom',
						message: `updateCriterion "${criterion.signal}" references evidence item "${evidenceId}", which is not in this case's evidencePool`,
						path: ['updateCriteria']
					});
				}
			}
		}

		// Every requiredSignals/partialCreditSignals reference must
		// resolve to either the closed cross-case vocabulary or this
		// case's own updateCriteria signals — never a typo'd or invented
		// signal that can never be detected.
		const allowedSignals = new Set<string>([
			...reasoningSignalIds,
			...(practiceCase.updateCriteria ?? []).map((c) => c.signal)
		]);
		const referenced = [
			...practiceCase.answerSpec.reasoningRubric.finalJudgmentRules.flatMap(
				(r) => r.requiredSignals
			),
			...practiceCase.answerSpec.reasoningRubric.partialCreditSignals
		];
		for (const signal of referenced) {
			if (!allowedSignals.has(signal)) {
				ctx.addIssue({
					code: 'custom',
					message: `signal "${signal}" is not in the cross-case vocabulary or this case's own updateCriteria`,
					path: ['answerSpec', 'reasoningRubric']
				});
			}
		}
	});
export type PracticeCase = z.infer<typeof PracticeCaseSchema>;

/** Fields safe to send to a student before (or during) an attempt — everything answerSpec-shaped is excluded. Hidden-metadata separation (docs/PHASE2.md's "never reaches the client before completion" guardrail) as an actual type, not just a convention to remember. */
export const PublicPracticeCaseSchema = PracticeCaseSchema.transform((c) => ({
	id: c.id,
	title: c.title,
	subjectProfileId: c.subjectProfileId,
	skillTags: c.skillTags,
	dispositionTags: c.dispositionTags,
	difficulty: c.difficulty,
	responseMode: c.responseMode,
	scenario: c.scenario,
	claim: c.claim,
	usesUpdateCriterion: c.usesUpdateCriterion,
	visibility: c.visibility
}));
export type PublicPracticeCase = z.infer<typeof PublicPracticeCaseSchema>;

export function toPublicPracticeCase(practiceCase: PracticeCase): PublicPracticeCase {
	return PublicPracticeCaseSchema.parse(practiceCase);
}

/**
 * The one piece of case content that's secret until completion but not
 * secret forever. Callers must only invoke this once an attempt has
 * actually reached SCORE_AND_RECORD — this function itself has no way
 * to check that, since it isn't given any session/attempt state; the
 * discipline lives in the route handler that calls it, the same
 * discipline that already governs when `answerSpec` may be touched.
 */
export function getTeachingExplanation(practiceCase: PracticeCase): string {
	return practiceCase.teachingExplanation;
}

// ---------------------------------------------------------------------------
// Tutor FSM (docs/PHASE2.md Section 3) — types only; transition logic is Prompt 22
// ---------------------------------------------------------------------------

// Renamed/refined from docs/PHASE2.md Section 3's original sketch to
// match `prompts.txt` Prompt 22's recommended state list exactly:
// ASK_CONFIDENCE -> ASK_INITIAL_CONFIDENCE/ASK_REVISED_CONFIDENCE (two
// distinct states, not one shared name), AWAIT_STUDENT_RESPONSE ->
// AWAIT_CHALLENGE_RESPONSE (clearer about what it's awaiting), END ->
// COMPLETE. DISPOSITION_SELF_CHECK is kept (Prompt 22's list doesn't
// mention it, but doesn't forbid it either — it's a "recommended," not
// exhaustive, list, and dropping an already-designed, already-tested
// mechanic without instruction would be an unrequested scope cut).
export const TutorStateSchema = z.enum([
	'PRESENT_SCENARIO',
	'ASK_INITIAL_JUDGMENT',
	'ASK_INITIAL_CONFIDENCE',
	'COMMIT_UPDATE_CRITERION',
	'PRESENT_CHALLENGE',
	'AWAIT_CHALLENGE_RESPONSE',
	'PRESENT_NEW_EVIDENCE',
	'ASK_REVISED_JUDGMENT',
	'ASK_REVISED_CONFIDENCE',
	'ASK_REFLECTION',
	'SCORE_AND_RECORD',
	'DISPOSITION_SELF_CHECK',
	'COMPLETE'
]);
export type TutorState = z.infer<typeof TutorStateSchema>;

/**
 * The fixed pedagogical action vocabulary (docs/PHASE2.md Section 3,
 * `prompts.txt` Prompt 24) — the only moves `PRESENT_CHALLENGE` may
 * select. `REFER_TO_REVEALED_EVIDENCE` deliberately carries no
 * `evidenceId` parameter — Prompt 24's own design choice, superseding
 * Prompt 22's placeholder `HIGHLIGHT_CONTRADICTION(evidenceId)`. An
 * id-parameterized action would need its own per-call, per-session
 * structural validation (the same shape as
 * `signalClassificationSchemaFor`'s dynamic candidate-signal scoping),
 * which is more surface area than letting the model phrase things
 * naturally from context already scoped to revealed evidence only. The
 * tradeoff this accepts — the model could still describe *unrevealed*
 * evidence in its own words without ever naming an id — is covered by
 * `tutorCore.ts`'s post-hoc no-invented-facts check plus Prompt 33's
 * adversarial neutrality suite, not by schema validation (see ADR-021).
 */
export const tutorActionIds = [
	'ASK_FOR_REASONING',
	'ASK_FOR_ALTERNATIVE',
	'ASK_FOR_MISSING_EVIDENCE',
	'ASK_ABOUT_CAUSALITY',
	'ASK_ABOUT_SOURCE',
	'ASK_ABOUT_NUMBERS',
	'REQUEST_CONFIDENCE_JUSTIFICATION',
	'REFER_TO_REVEALED_EVIDENCE',
	'ACKNOWLEDGE_AND_ADVANCE',
	'PROMPT_REFLECTION'
] as const;

export const TutorActionIdSchema = z.enum(tutorActionIds);
export type TutorActionId = z.infer<typeof TutorActionIdSchema>;

export const TutorActionSchema = z.object({ action: TutorActionIdSchema });
export type TutorAction = z.infer<typeof TutorActionSchema>;

// ---------------------------------------------------------------------------
// Sessions and attempts (docs/PHASE2.md Section 3/4, docs/PHASE2A_IMPLEMENTATION.md Section 4)
// ---------------------------------------------------------------------------

export const PracticeSessionSchema = z.object({
	id: id(),
	studentId: id(),
	caseId: z.string().min(1),
	fsmState: TutorStateSchema,
	revealedEvidenceIds: z.array(id()),
	transcript: z.array(
		z.object({
			action: TutorActionSchema,
			questionText: z.string().min(1),
			response: z.string().min(1).nullable() // null until the student replies
		})
	),
	initialJudgment: LearnerJudgmentSchema.nullable(),
	updateCriterionText: z.string().min(1).nullable(),
	// Built the same two-step way as initialJudgment (judgment+reasoning
	// at ASK_REVISED_JUDGMENT, confidence attached at
	// ASK_REVISED_CONFIDENCE) — a real, persisted field rather than
	// transient in-memory state, so an interrupted session resumes with
	// this intact instead of losing it on reload.
	revisedJudgment: LearnerJudgmentSchema.nullable(),
	// Captured at ASK_REFLECTION ("what changed, if anything, and why?")
	// — feeds the classifier at SCORE_AND_RECORD alongside
	// revisedJudgment.reasoning, and end-of-case feedback later.
	reflectionText: z.string().min(1).nullable(),
	createdAt: timestamp(),
	updatedAt: timestamp()
});
export type PracticeSession = z.infer<typeof PracticeSessionSchema>;

export const ScoringExplanationSchema = z.object({
	detectedSignals: z.array(SignalClassificationSchema),
	matchedRuleId: id().nullable(),
	outcome: z.enum(['correct', 'incorrect'])
});
export type ScoringExplanation = z.infer<typeof ScoringExplanationSchema>;

/** The itemized, per-signal/per-rule audit trail `computeScoringEvents` (`scoringEvents.ts`, `prompts.txt` Prompt 25) produces — richer than `ScoringExplanation` alone, which only carries the pass/fail outcome and the raw detected-signal list, not per-event skill/explanation mapping. */
export const ScoringEventSchema = z
	.object({
		id: id(),
		attemptId: id(),
		// Exactly one of these is set: a matched reasoningRubric rule, or
		// a bare partial-credit signal that didn't flip outcome on its own.
		ruleId: id().nullable(),
		signal: z.string().min(1).nullable(),
		affectedSkills: z.array(CTSkillIdSchema).min(1),
		explanation: z.string().min(1),
		evidenceQuote: z.string().min(1).nullable(),
		stage: TutorStateSchema,
		createdAt: timestamp()
	})
	.refine((e) => (e.ruleId === null) !== (e.signal === null), {
		message: 'exactly one of ruleId or signal must be set',
		path: ['ruleId']
	});
export type ScoringEvent = z.infer<typeof ScoringEventSchema>;

export const PracticeAttemptSchema = z.object({
	id: id(),
	studentId: id(),
	caseId: z.string().min(1),
	sessionId: id(),
	initialJudgment: LearnerJudgmentSchema,
	updateCriterion: z
		.object({
			text: z.string().min(1),
			// null only when consistency.status is 'criterion_not_relevant' —
			// no candidate signal was found present in the learner's text.
			classification: SignalClassificationSchema.nullable(),
			consistency: UpdateCriterionConsistencyResultSchema
		})
		.nullable(),
	revisedJudgment: LearnerJudgmentSchema,
	scoringExplanation: ScoringExplanationSchema,
	scoringEvents: z.array(ScoringEventSchema),
	createdAt: timestamp()
});
export type PracticeAttempt = z.infer<typeof PracticeAttemptSchema>;
