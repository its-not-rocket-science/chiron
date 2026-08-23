import { describe, expect, it } from 'vitest';
import {
	canEditLesson,
	canFeatureLesson,
	canViewLesson,
	isVisibilityValidForOrg,
	libraryAccessClauses
} from './library';
import type { Membership } from './schemas';

const owner = 'user-owner';
const orgA = 'org-a';
const orgB = 'org-b';
const outsider = 'user-outsider';
const orgAMember = 'user-org-a-member';
const orgBMember = 'user-org-b-member';

describe('canViewLesson — the adversarial cross-org cases', () => {
	it('owner can always view their own lesson, private or not', () => {
		const lesson = { ownerId: owner, orgId: null, visibility: 'private' as const };
		expect(canViewLesson(lesson, { userId: owner, orgIds: [] })).toBe(true);
	});

	it('a private lesson is invisible to everyone except the owner, even members of the same org', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'private' as const };
		expect(canViewLesson(lesson, { userId: orgAMember, orgIds: [orgA] })).toBe(false);
		expect(canViewLesson(lesson, { userId: outsider, orgIds: [] })).toBe(false);
	});

	it('an org-shared lesson is visible to members of that org and no one else', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		expect(canViewLesson(lesson, { userId: orgAMember, orgIds: [orgA] })).toBe(true);
		expect(canViewLesson(lesson, { userId: orgBMember, orgIds: [orgB] })).toBe(false);
		expect(canViewLesson(lesson, { userId: outsider, orgIds: [] })).toBe(false);
	});

	it('a public-template lesson is visible cross-org to any signed-in user', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'public-template' as const };
		expect(canViewLesson(lesson, { userId: orgBMember, orgIds: [orgB] })).toBe(true);
		expect(canViewLesson(lesson, { userId: outsider, orgIds: [] })).toBe(true);
	});

	it('org B cannot see org A private or org-shared lessons even by guessing the id (visibility check alone denies it)', () => {
		const privateLesson = { ownerId: owner, orgId: orgA, visibility: 'private' as const };
		const sharedLesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		const orgBViewer = { userId: orgBMember, orgIds: [orgB] };
		expect(canViewLesson(privateLesson, orgBViewer)).toBe(false);
		expect(canViewLesson(sharedLesson, orgBViewer)).toBe(false);
	});
});

describe('canEditLesson', () => {
	it('only the owner can edit', () => {
		const lesson = { ownerId: owner };
		expect(canEditLesson(lesson, { userId: owner, orgIds: [] })).toBe(true);
		expect(canEditLesson(lesson, { userId: outsider, orgIds: [] })).toBe(false);
	});
});

describe('canFeatureLesson', () => {
	const membershipFor = (role: Membership['role'], orgId: string): Membership => ({
		id: 'm1',
		userId: 'admin-1',
		orgId,
		role,
		createdAt: new Date().toISOString()
	});

	it('an org admin can feature a lesson shared into their own org', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		expect(canFeatureLesson(lesson, membershipFor('admin', orgA))).toBe(true);
	});

	it('a teacher (non-admin) cannot feature a lesson', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		expect(canFeatureLesson(lesson, membershipFor('teacher', orgA))).toBe(false);
	});

	it('an admin of a different org cannot feature it', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		expect(canFeatureLesson(lesson, membershipFor('admin', orgB))).toBe(false);
	});

	it('cannot feature a private lesson even as the org admin', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'private' as const };
		expect(canFeatureLesson(lesson, membershipFor('admin', orgA))).toBe(false);
	});

	it('returns false with no membership at all', () => {
		const lesson = { ownerId: owner, orgId: orgA, visibility: 'org-shared' as const };
		expect(canFeatureLesson(lesson, null)).toBe(false);
	});
});

describe('isVisibilityValidForOrg', () => {
	it('rejects org-shared with no org', () => {
		expect(isVisibilityValidForOrg('org-shared', null)).toBe(false);
	});

	it('accepts every other combination', () => {
		expect(isVisibilityValidForOrg('org-shared', orgA)).toBe(true);
		expect(isVisibilityValidForOrg('private', null)).toBe(true);
		expect(isVisibilityValidForOrg('public-template', null)).toBe(true);
	});
});

describe('libraryAccessClauses', () => {
	it('includes owned-by, public-template, and one org-shared-in clause per org membership', () => {
		const clauses = libraryAccessClauses({ userId: orgAMember, orgIds: [orgA, orgB] });
		expect(clauses).toContainEqual({ kind: 'owned-by', userId: orgAMember });
		expect(clauses).toContainEqual({ kind: 'public-template' });
		expect(clauses).toContainEqual({ kind: 'org-shared-in', orgId: orgA });
		expect(clauses).toContainEqual({ kind: 'org-shared-in', orgId: orgB });
	});

	it('an individual-tier user (no org) gets no org-shared-in clause', () => {
		const clauses = libraryAccessClauses({ userId: outsider, orgIds: [] });
		expect(clauses.some((c) => c.kind === 'org-shared-in')).toBe(false);
	});
});
