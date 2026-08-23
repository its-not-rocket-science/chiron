/**
 * Domain type re-exports. Types are derived from the Zod schemas in
 * `schemas.ts` (single source of truth — a hand-written type and its
 * runtime schema drifting apart is exactly the bug schema validation is
 * meant to prevent), so this file just gives them one importable home
 * matching docs/ARCHITECTURE.md Section 10's repo layout.
 */
export type {
	User,
	Org,
	Membership,
	MembershipRole,
	Visibility,
	Lesson,
	LessonSource,
	LessonVersion,
	RubricScoreValue,
	Score,
	Confidence,
	SkillCoverageEntry,
	PillarId,
	Suggestion,
	ScoringResult,
	LibraryEntry
} from './schemas';
