/**
 * Scoring orchestration (docs/ARCHITECTURE.md Section 5). This is the one
 * place domain code touches a `ScoringProvider` — it resolves the subject
 * profile and delegates to whatever provider it's given. No Anthropic
 * import here; that lives in `providers/AnthropicScoringProvider.ts`.
 */
import { createHash } from 'node:crypto';
import { getSubjectProfile } from './subjectProfiles';
import type { ScoringProvider } from '../providers/ScoringProvider';
import { restampScoringResult } from '../providers/llmScoringCore';
import { SCORING_PROMPT_VERSION } from '../providers/scoringPrompt';
import type { DataStore } from '../providers/DataStore';
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

/**
 * SHA-256 of the three things that fully determine a scoring judgment —
 * a NUL separator between fields prevents ambiguous concatenation
 * (e.g. "ab"+"c" colliding with "a"+"bc") (prompts.txt Prompt P5).
 */
export function computeScoringContentHash(
	lessonText: string,
	subjectProfileId: string,
	promptVersion: string = SCORING_PROMPT_VERSION
): string {
	return createHash('sha256')
		.update(lessonText)
		.update('\0')
		.update(subjectProfileId)
		.update('\0')
		.update(promptVersion)
		.digest('hex');
}

export async function scoreLesson(
	provider: ScoringProvider,
	input: ScoreLessonInput,
	cache?: Pick<DataStore, 'getCachedScore' | 'saveCachedScore'>
): Promise<ScoringResult> {
	const subjectProfile = getSubjectProfile(input.subjectProfileId);
	if (!subjectProfile) throw new UnknownSubjectProfileError(input.subjectProfileId);

	const contentHash = computeScoringContentHash(input.lessonText, input.subjectProfileId);

	if (cache) {
		const cached = await cache.getCachedScore(contentHash);
		if (cached) return restampScoringResult(cached, input.lessonVersionId);
	}

	const result = await provider.scoreLesson({
		lessonVersionId: input.lessonVersionId,
		lessonText: input.lessonText,
		subjectProfile
	});

	if (cache) await cache.saveCachedScore(contentHash, result);

	return result;
}
