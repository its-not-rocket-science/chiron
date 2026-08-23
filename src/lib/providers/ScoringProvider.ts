import type { SubjectProfile } from '$lib/domain/subjectProfiles';
import type { ScoringResult } from '$lib/domain/schemas';

export interface ScoringProviderInput {
	/** The LessonVersion this score will belong to — assigned by the caller, not generated here. */
	lessonVersionId: string;
	lessonText: string;
	subjectProfile: SubjectProfile;
}

/**
 * Provider-independent scoring interface (docs/ARCHITECTURE.md Section 5).
 * Domain code (`domain/scoreLesson.ts`) depends only on this shape;
 * `AnthropicScoringProvider` is the concrete implementation.
 */
export interface ScoringProvider {
	scoreLesson(input: ScoringProviderInput): Promise<ScoringResult>;
}

/** Thrown when the model can't be coaxed into a valid, schema-conforming result after a retry. */
export class ScoringError extends Error {}
