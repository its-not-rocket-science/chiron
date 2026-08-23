/**
 * Scoring orchestration (docs/ARCHITECTURE.md Section 5). This is the one
 * place domain code touches a `ScoringProvider` — it resolves the subject
 * profile and delegates to whatever provider it's given. No Anthropic
 * import here; that lives in `providers/AnthropicScoringProvider.ts`.
 */
import { getSubjectProfile } from './subjectProfiles';
import type { ScoringProvider } from '../providers/ScoringProvider';
import type { ScoringResult } from './schemas';

export class UnknownSubjectProfileError extends Error {
	constructor(subjectProfileId: string) {
		super(`Unknown subject profile: ${subjectProfileId}`);
	}
}

export interface ScoreLessonInput {
	lessonVersionId: string;
	lessonText: string;
	subjectProfileId: string;
}

export async function scoreLesson(
	provider: ScoringProvider,
	input: ScoreLessonInput
): Promise<ScoringResult> {
	const subjectProfile = getSubjectProfile(input.subjectProfileId);
	if (!subjectProfile) throw new UnknownSubjectProfileError(input.subjectProfileId);

	return provider.scoreLesson({
		lessonVersionId: input.lessonVersionId,
		lessonText: input.lessonText,
		subjectProfile
	});
}
