/**
 * Visibility and org-boundary rules (docs/ARCHITECTURE.md Section 3,
 * ADR-002). These are the domain-layer source of truth for "who can see
 * this lesson" — used both as a defense-in-depth check in route handlers
 * and to build the query filter a data-access layer runs against
 * Postgres. The actual leak-proofing mechanism is still Postgres RLS
 * (Prompt 8); these functions exist so the rule is expressed once, in
 * code that's unit-testable without a database, rather than only as SQL
 * policy text no test here can exercise.
 */
import type { Lesson, Membership, Visibility } from './schemas';

export interface Viewer {
	userId: string;
	/** Org ids the viewer currently belongs to. Empty for an individual-tier user. */
	orgIds: readonly string[];
}

type VisibilityRelevant = Pick<Lesson, 'ownerId' | 'orgId' | 'visibility'>;

/** Can this viewer read the lesson at all (library browse, direct fetch, etc.)? */
export function canViewLesson(lesson: VisibilityRelevant, viewer: Viewer): boolean {
	if (lesson.ownerId === viewer.userId) return true;
	if (lesson.visibility === 'public-template') return true;
	if (lesson.visibility === 'org-shared' && lesson.orgId !== null) {
		return viewer.orgIds.includes(lesson.orgId);
	}
	return false;
}

/** Only the owner can edit lesson content or change its visibility. */
export function canEditLesson(lesson: Pick<Lesson, 'ownerId'>, viewer: Viewer): boolean {
	return lesson.ownerId === viewer.userId;
}

/**
 * Org admins can feature/pin a lesson that's shared into their own org —
 * never a private lesson (they can't see it) and never another org's
 * shared lesson.
 */
export function canFeatureLesson(
	lesson: VisibilityRelevant,
	membership: Membership | null
): boolean {
	if (!membership || membership.role !== 'admin') return false;
	if (lesson.visibility !== 'org-shared') return false;
	return lesson.orgId === membership.orgId;
}

/** A visibility with no possible org attached — 'org-shared' needs an org. */
export function isVisibilityValidForOrg(visibility: Visibility, orgId: string | null): boolean {
	return !(visibility === 'org-shared' && orgId === null);
}

/**
 * One clause of an allowed-access filter, meant to be OR'd together by the
 * data-access layer when building a library query. Kept as plain data
 * (not a query string) so it stays testable and storage-agnostic here;
 * translating it into a Postgres filter is a `providers/` concern.
 */
export type LibraryAccessClause =
	| { kind: 'owned-by'; userId: string }
	| { kind: 'public-template' }
	| { kind: 'org-shared-in'; orgId: string };

/** Every access clause that together describe exactly what this viewer may see. */
export function libraryAccessClauses(viewer: Viewer): LibraryAccessClause[] {
	return [
		{ kind: 'owned-by', userId: viewer.userId },
		{ kind: 'public-template' },
		...viewer.orgIds.map((orgId): LibraryAccessClause => ({ kind: 'org-shared-in', orgId }))
	];
}
