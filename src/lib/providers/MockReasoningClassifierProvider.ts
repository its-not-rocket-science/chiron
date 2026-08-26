/**
 * Deterministic, no-network stand-in for ReasoningClassifierProvider —
 * used by the Phase 2A routes until `prompts.txt` Prompt 23 lands the
 * real DeepSeek-backed implementation. Classifies a candidate signal as
 * present only when its id (with underscores turned to spaces) appears
 * as a substring of the student's text — crude, but real enough to
 * exercise the full pipeline (including the "evidenceQuote must be
 * found in the source text" discipline) without any live model spend.
 */
import type { SignalClassification } from '$lib/domain/practiceSchemas';
import type { ReasoningClassifierProvider } from './ReasoningClassifierProvider';

export class MockReasoningClassifierProvider implements ReasoningClassifierProvider {
	async classifySignals(input: {
		freeText: string;
		scenario: string;
		claim: string;
		revealedEvidenceTexts: readonly string[];
		candidateSignals: readonly string[];
	}): Promise<SignalClassification[]> {
		const lowerText = input.freeText.toLowerCase();
		return input.candidateSignals.map((signal) => {
			const keyword = signal.replace(/_/g, ' ');
			const present = lowerText.includes(keyword);
			return {
				signal,
				present,
				confidence: present ? 'medium' : 'low',
				evidenceQuote: present ? input.freeText : '(no match)'
			};
		});
	}
}
