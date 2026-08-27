/**
 * Zod schemas for the core domain model (docs/ARCHITECTURE.md Section 3).
 * These are the single source of truth for what counts as valid domain
 * data — every externally-sourced or serialized payload (API request
 * bodies, rows read back from Supabase, structured LLM output) must be
 * parsed through one of these before the app treats it as trusted.
 *
 * Pure TypeScript + Zod only — no Svelte, no Supabase client, no
 * Anthropic SDK.
 */
import { z } from 'zod';
import { ctSkillIds } from './taxonomy';

const id = () => z.uuid();
const timestamp = () => z.iso.datetime({ offset: true });

// ---------------------------------------------------------------------------
// Users, orgs, membership
// ---------------------------------------------------------------------------

export const UserSchema = z.object({
	id: id(),
	email: z.email(),
	displayName: z.string().min(1),
	createdAt: timestamp()
});
export type User = z.infer<typeof UserSchema>;

export const OrgSchema = z.object({
	id: id(),
	name: z.string().min(1),
	createdAt: timestamp()
});
export type Org = z.infer<typeof OrgSchema>;

export const MembershipRoleSchema = z.enum(['admin', 'teacher']);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const MembershipSchema = z.object({
	id: id(),
	userId: id(),
	orgId: id(),
	role: MembershipRoleSchema,
	createdAt: timestamp()
});
export type Membership = z.infer<typeof MembershipSchema>;

// ---------------------------------------------------------------------------
// Lessons and versions
// ---------------------------------------------------------------------------

export const VisibilitySchema = z.enum(['private', 'org-shared', 'public-template']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const LessonSchema = z
	.object({
		id: id(),
		ownerId: id(),
		orgId: id().nullable(),
		title: z.string().min(1),
		subjectProfileId: z.string().min(1),
		gradeLevel: z.string().min(1).nullable(),
		visibility: VisibilitySchema,
		featured: z.boolean(),
		createdAt: timestamp(),
		updatedAt: timestamp(),
		currentVersionId: id().nullable(),
		/** Set when this lesson was created via "save a copy" in the shared library. */
		copiedFromLessonId: id().nullable()
	})
	.refine((lesson) => !(lesson.visibility === 'org-shared' && lesson.orgId === null), {
		message: 'A lesson with no org cannot be org-shared',
		path: ['visibility']
	});
export type Lesson = z.infer<typeof LessonSchema>;

export const LessonSourceSchema = z.enum(['paste', 'upload']);
export type LessonSource = z.infer<typeof LessonSourceSchema>;

export const LessonVersionSchema = z.object({
	id: id(),
	lessonId: id(),
	versionNumber: z.int().positive(),
	source: LessonSourceSchema,
	rawText: z.string().min(1),
	createdAt: timestamp(),
	scoreId: id().nullable()
});
export type LessonVersion = z.infer<typeof LessonVersionSchema>;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export const RubricScoreSchema = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
export type RubricScoreValue = z.infer<typeof RubricScoreSchema>;

export const ScoreSchema = z.object({
	id: id(),
	lessonVersionId: id(),
	dialogueScore: RubricScoreSchema,
	dialogueJustification: z.string().min(1),
	authenticityScore: RubricScoreSchema,
	authenticityJustification: z.string().min(1),
	mentoringScore: RubricScoreSchema,
	mentoringJustification: z.string().min(1),
	modelId: z.string().min(1),
	promptVersion: z.string().min(1),
	createdAt: timestamp()
});
export type Score = z.infer<typeof ScoreSchema>;

export const CTSkillIdSchema = z.enum(ctSkillIds);

export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const SkillCoverageEntrySchema = z.object({
	id: id(),
	scoreId: id(),
	skill: CTSkillIdSchema,
	covered: z.boolean(),
	confidence: ConfidenceSchema,
	justification: z.string().min(1)
});
export type SkillCoverageEntry = z.infer<typeof SkillCoverageEntrySchema>;

export const PillarIdSchema = z.enum(['dialogue', 'authenticity', 'mentoring']);
export type PillarId = z.infer<typeof PillarIdSchema>;

export const SuggestionSchema = z.object({
	id: id(),
	scoreId: id(),
	pillar: PillarIdSchema,
	text: z.string().min(1)
});
export type Suggestion = z.infer<typeof SuggestionSchema>;

/** A full scoring result for one lesson version: the pillar scores plus everything derived from them. */
export const ScoringResultSchema = z.object({
	score: ScoreSchema,
	skillCoverage: z.array(SkillCoverageEntrySchema).length(6),
	suggestions: z.array(SuggestionSchema)
});
export type ScoringResult = z.infer<typeof ScoringResultSchema>;

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

/**
 * What a library browse/search query returns: a lesson plus enough of its
 * latest version and score to render a result card, without the caller
 * needing to know how that was joined together.
 */
export const LibraryEntrySchema = z.object({
	lesson: LessonSchema,
	latestVersion: LessonVersionSchema,
	latestScore: ScoreSchema.nullable()
});
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;
