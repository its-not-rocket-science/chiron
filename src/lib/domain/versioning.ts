/**
 * Lesson version history and before/after comparison
 * (docs/ARCHITECTURE.md Section 1, Section 6). A lesson's versions are
 * append-only and numbered from 1; revising and resubmitting a lesson
 * never mutates a prior version, it creates a new one.
 */
import type { LessonVersion, PillarId, Score } from './schemas';

/** The version number the next revision of this lesson should get. */
export function nextVersionNumber(
	existingVersions: readonly Pick<LessonVersion, 'versionNumber'>[]
): number {
	if (existingVersions.length === 0) return 1;
	return Math.max(...existingVersions.map((v) => v.versionNumber)) + 1;
}

export interface PillarDelta {
	pillar: PillarId;
	before: Score['dialogueScore'];
	after: Score['dialogueScore'];
	change: number;
}

/** Per-pillar score changes between two scored versions, for the before/after view. */
export function compareScores(before: Score, after: Score): PillarDelta[] {
	const pillars: { pillar: PillarId; scoreKey: keyof Score }[] = [
		{ pillar: 'dialogue', scoreKey: 'dialogueScore' },
		{ pillar: 'authenticity', scoreKey: 'authenticityScore' },
		{ pillar: 'mentoring', scoreKey: 'mentoringScore' }
	];

	return pillars.map(({ pillar, scoreKey }) => {
		const beforeScore = before[scoreKey] as Score['dialogueScore'];
		const afterScore = after[scoreKey] as Score['dialogueScore'];
		return { pillar, before: beforeScore, after: afterScore, change: afterScore - beforeScore };
	});
}
