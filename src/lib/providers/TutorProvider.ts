/**
 * Provider-independent Socratic-tutor interface (docs/PHASE2.md
 * Section 6, docs/PHASE2A_IMPLEMENTATION.md Section 7, `prompts.txt`
 * Prompt 24). `DeepSeekTutorProvider.ts` is the real implementation;
 * `MockTutorProvider.ts` remains for tests that don't want live model
 * spend.
 *
 * `selectAndPhraseChallenge` must never be given `answerSpec`, hidden
 * evidence, `educatorNotes`, or any reasoning-rule/credit data — this is
 * enforced by its own type signature simply not accepting any of it,
 * not by caller discipline alone (docs/PHASE2.md Section 3's
 * non-negotiable invariant; ADR-015).
 */
import type {
	ConfidenceRating,
	EvidenceSupportJudgment,
	TutorAction
} from '$lib/domain/practiceSchemas';

export interface TutorTranscriptTurn {
	action: TutorAction;
	questionText: string;
	response: string | null;
}

export interface TutorProvider {
	/**
	 * Classifies free-text judgment language into a structured category.
	 * Named in docs/PHASE2.md Section 6 for a free-text judgment-entry
	 * UI; the Phase 2A UI (Prompt 28) captures judgment via a structured
	 * five-level control instead, so no current route calls this yet —
	 * kept on the interface for design completeness and any future
	 * free-text entry mode, not dead weight to be deleted.
	 */
	classifyJudgment(freeText: string): Promise<{ judgment: string; confidence?: number }>;

	/**
	 * Picks ONE action from the fixed pedagogical vocabulary
	 * (docs/PHASE2.md Section 3) and phrases it naturally. Receives only
	 * the evidence actually revealed so far, the transcript, the
	 * learner's current judgment/confidence/reasoning, and the skill
	 * tags this case targets (`prompts.txt` Prompt 24's exact input
	 * list) — never the case's answer key, hidden evidence, or scoring
	 * rules.
	 */
	selectAndPhraseChallenge(input: {
		transcript: readonly TutorTranscriptTurn[];
		revealedEvidenceTexts: readonly string[];
		scenario: string;
		claim: string;
		learnerJudgment: EvidenceSupportJudgment;
		learnerConfidence: ConfidenceRating;
		learnerReasoning: string;
		targetSkillTags: readonly string[];
	}): Promise<{ action: TutorAction; questionText: string }>;
}
