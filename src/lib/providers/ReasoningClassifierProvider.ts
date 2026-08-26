/**
 * Provider-independent reasoning-signal classifier interface
 * (docs/PHASE2.md Section 1a/6, docs/PHASE2A_IMPLEMENTATION.md
 * Section 7, `prompts.txt` Prompt 23). `MockReasoningClassifierProvider`
 * is a deterministic stand-in; `DeepSeekReasoningClassifierProvider`
 * (this pass) is the real implementation.
 *
 * Classification only — never a credit decision (ADR-015). This
 * interface's shape is itself the enforcement of Prompt 23's "must NOT
 * receive" list: no field here can carry `answerSpec`, accepted final
 * judgments, score weights, or a skill score, because none of those
 * concepts have a place in this input type at all. `candidateSignals`
 * is caller-supplied and scoped per call: either the cross-case
 * vocabulary (general reasoning classification) or one case's own
 * `updateCriteria` signals (docs/PHASE2.md Section 1a's per-case-scoped
 * discipline) — never a hardcoded global list inside an implementation.
 */
import type { SignalClassification } from '$lib/domain/practiceSchemas';

export interface ReasoningClassifierProvider {
	classifySignals(input: {
		/** The learner's own free text — the only thing actually being classified. */
		freeText: string;
		/** Case context visible to the student at this point — never the answer key. */
		scenario: string;
		claim: string;
		/** Only evidence already revealed to this student in this session — never the full evidencePool. */
		revealedEvidenceTexts: readonly string[];
		/** The closed set the classifier must choose from for this call — general vocabulary or one case's own updateCriteria signals, never both merged and never invented. */
		candidateSignals: readonly string[];
	}): Promise<SignalClassification[]>;
}
