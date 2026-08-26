/**
 * Deterministic, no-network stand-in for TutorProvider — used by tests
 * that don't want live model spend. Not LLM-backed at all: cycles
 * through the fixed action vocabulary in a stable order, so the FSM and
 * routes are provable end-to-end without any live model spend
 * (docs/PHASE2A_IMPLEMENTATION.md milestone 3).
 */
import type {
	ConfidenceRating,
	EvidenceSupportJudgment,
	TutorAction
} from '$lib/domain/practiceSchemas';
import type { TutorProvider, TutorTranscriptTurn } from './TutorProvider';

const ACTION_CYCLE: TutorAction[] = [
	{ action: 'ASK_FOR_REASONING' },
	{ action: 'ASK_FOR_ALTERNATIVE' },
	{ action: 'ASK_FOR_MISSING_EVIDENCE' },
	{ action: 'REQUEST_CONFIDENCE_JUSTIFICATION' }
];

export class MockTutorProvider implements TutorProvider {
	async classifyJudgment(freeText: string): Promise<{ judgment: string; confidence?: number }> {
		void freeText; // unused — this mock always classifies as 'uncertain'
		return { judgment: 'uncertain', confidence: undefined };
	}

	async selectAndPhraseChallenge(input: {
		transcript: readonly TutorTranscriptTurn[];
		revealedEvidenceTexts: readonly string[];
		scenario: string;
		claim: string;
		learnerJudgment: EvidenceSupportJudgment;
		learnerConfidence: ConfidenceRating;
		learnerReasoning: string;
		targetSkillTags: readonly string[];
	}): Promise<{ action: TutorAction; questionText: string }> {
		const action = ACTION_CYCLE[input.transcript.length % ACTION_CYCLE.length];
		return { action, questionText: mockQuestionText(action) };
	}
}

function mockQuestionText(action: TutorAction): string {
	switch (action.action) {
		case 'ASK_FOR_REASONING':
			return 'Why do you believe that?';
		case 'ASK_FOR_ALTERNATIVE':
			return "What's another explanation for this evidence?";
		case 'ASK_FOR_MISSING_EVIDENCE':
			return 'What additional information would change your mind?';
		case 'ASK_ABOUT_CAUSALITY':
			return 'Could something else explain this pattern besides the claim you’re evaluating?';
		case 'ASK_ABOUT_SOURCE':
			return 'How independent are these sources from each other?';
		case 'ASK_ABOUT_NUMBERS':
			return 'What does that figure look like in absolute terms, not just relative terms?';
		case 'REQUEST_CONFIDENCE_JUSTIFICATION':
			return 'Why that confidence level, not higher or lower?';
		case 'REFER_TO_REVEALED_EVIDENCE':
			return 'How does that fit with the evidence you’ve already seen?';
		case 'ACKNOWLEDGE_AND_ADVANCE':
			return "Noted — let's continue.";
		case 'PROMPT_REFLECTION':
			return 'What changed, if anything, and why?';
	}
}
