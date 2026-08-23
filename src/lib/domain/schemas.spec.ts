import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	LessonSchema,
	LessonVersionSchema,
	LibraryEntrySchema,
	MembershipSchema,
	OrgSchema,
	ScoreSchema,
	ScoringResultSchema,
	SkillCoverageEntrySchema,
	SuggestionSchema,
	UserSchema
} from './schemas';
import { ctSkillIds } from './taxonomy';

const now = () => new Date().toISOString();
const uuid = () => randomUUID();

interface LessonFixtureOverrides {
	id?: string;
	ownerId?: string;
	orgId?: string | null;
	title?: string;
	subjectProfileId?: string;
	gradeLevel?: string | null;
	visibility?: string;
	featured?: boolean;
	createdAt?: string;
	updatedAt?: string;
	currentVersionId?: string | null;
	copiedFromLessonId?: string | null;
}

function validLesson(overrides: LessonFixtureOverrides = {}) {
	return {
		id: uuid(),
		ownerId: uuid(),
		orgId: null,
		title: 'Photosynthesis lab',
		subjectProfileId: 'science-lab',
		gradeLevel: '9',
		visibility: 'private',
		featured: false,
		createdAt: now(),
		updatedAt: now(),
		currentVersionId: null,
		copiedFromLessonId: null,
		...overrides
	};
}

function validScore(overrides: Partial<ReturnType<typeof baseScore>> = {}) {
	return { ...baseScore(), ...overrides };
}

function baseScore() {
	return {
		id: uuid(),
		lessonVersionId: uuid(),
		dialogueScore: 2 as const,
		dialogueJustification: 'Students discuss findings in small groups for part of the lesson.',
		authenticityScore: 3 as const,
		authenticityJustification: 'Students collect their own real lab data.',
		mentoringScore: 1 as const,
		mentoringJustification: 'Feedback is generic, given only at the end.',
		modelId: 'claude-test',
		createdAt: now()
	};
}

describe('UserSchema', () => {
	it('accepts a valid user', () => {
		expect(() =>
			UserSchema.parse({
				id: uuid(),
				email: 'teacher@example.com',
				displayName: 'A. Teacher',
				createdAt: now()
			})
		).not.toThrow();
	});

	it('rejects an invalid email', () => {
		expect(() =>
			UserSchema.parse({
				id: uuid(),
				email: 'not-an-email',
				displayName: 'A. Teacher',
				createdAt: now()
			})
		).toThrow();
	});
});

describe('OrgSchema / MembershipSchema', () => {
	it('accepts a valid org and membership', () => {
		expect(() =>
			OrgSchema.parse({ id: uuid(), name: 'Riverside District', createdAt: now() })
		).not.toThrow();
		expect(() =>
			MembershipSchema.parse({
				id: uuid(),
				userId: uuid(),
				orgId: uuid(),
				role: 'admin',
				createdAt: now()
			})
		).not.toThrow();
	});

	it('rejects an unknown membership role', () => {
		expect(() =>
			MembershipSchema.parse({
				id: uuid(),
				userId: uuid(),
				orgId: uuid(),
				role: 'superuser',
				createdAt: now()
			})
		).toThrow();
	});
});

describe('LessonSchema', () => {
	it('accepts a valid individual (no-org) private lesson', () => {
		expect(() => LessonSchema.parse(validLesson())).not.toThrow();
	});

	it('accepts a valid org-shared lesson with an orgId', () => {
		expect(() =>
			LessonSchema.parse(validLesson({ orgId: uuid(), visibility: 'org-shared' }))
		).not.toThrow();
	});

	it('rejects an org-shared lesson with no orgId', () => {
		expect(() =>
			LessonSchema.parse(validLesson({ orgId: null, visibility: 'org-shared' }))
		).toThrow(/A lesson with no org cannot be org-shared/);
	});

	it('rejects an empty title', () => {
		expect(() => LessonSchema.parse(validLesson({ title: '' }))).toThrow();
	});

	it('rejects an unknown visibility value', () => {
		expect(() => LessonSchema.parse(validLesson({ visibility: 'secret' }))).toThrow();
	});
});

describe('LessonVersionSchema', () => {
	it('accepts a valid version', () => {
		expect(() =>
			LessonVersionSchema.parse({
				id: uuid(),
				lessonId: uuid(),
				versionNumber: 1,
				source: 'paste',
				rawText: 'Students will conduct an experiment...',
				createdAt: now(),
				scoreId: null
			})
		).not.toThrow();
	});

	it('rejects an empty rawText (should have failed upstream, but must not pass here either)', () => {
		expect(() =>
			LessonVersionSchema.parse({
				id: uuid(),
				lessonId: uuid(),
				versionNumber: 1,
				source: 'paste',
				rawText: '',
				createdAt: now(),
				scoreId: null
			})
		).toThrow();
	});

	it('rejects a zero or negative version number', () => {
		expect(() =>
			LessonVersionSchema.parse({
				id: uuid(),
				lessonId: uuid(),
				versionNumber: 0,
				source: 'paste',
				rawText: 'text',
				createdAt: now(),
				scoreId: null
			})
		).toThrow();
	});
});

describe('ScoreSchema', () => {
	it('accepts a valid score', () => {
		expect(() => ScoreSchema.parse(validScore())).not.toThrow();
	});

	it('rejects an out-of-range pillar score', () => {
		expect(() => ScoreSchema.parse(validScore({ dialogueScore: 4 as never }))).toThrow();
		expect(() => ScoreSchema.parse(validScore({ mentoringScore: -1 as never }))).toThrow();
	});

	it('rejects a missing justification (no fake precision without a reason)', () => {
		expect(() => ScoreSchema.parse(validScore({ authenticityJustification: '' }))).toThrow();
	});
});

describe('SkillCoverageEntrySchema', () => {
	it('accepts a valid entry for every real CT skill id', () => {
		for (const skill of ctSkillIds) {
			expect(() =>
				SkillCoverageEntrySchema.parse({
					id: uuid(),
					scoreId: uuid(),
					skill,
					covered: true,
					confidence: 'high',
					justification: 'The lesson explicitly asks students to do this.'
				})
			).not.toThrow();
		}
	});

	it('rejects an unknown skill id', () => {
		expect(() =>
			SkillCoverageEntrySchema.parse({
				id: uuid(),
				scoreId: uuid(),
				skill: 'creativity',
				covered: true,
				confidence: 'high',
				justification: 'x'
			})
		).toThrow();
	});

	it('rejects a confidence level outside the fixed vocabulary', () => {
		expect(() =>
			SkillCoverageEntrySchema.parse({
				id: uuid(),
				scoreId: uuid(),
				skill: 'inference',
				covered: true,
				confidence: 'certain',
				justification: 'x'
			})
		).toThrow();
	});
});

describe('SuggestionSchema', () => {
	it('accepts a valid suggestion', () => {
		expect(() =>
			SuggestionSchema.parse({
				id: uuid(),
				scoreId: uuid(),
				pillar: 'mentoring',
				text: 'Add a check-in.'
			})
		).not.toThrow();
	});

	it('rejects an unknown pillar', () => {
		expect(() =>
			SuggestionSchema.parse({ id: uuid(), scoreId: uuid(), pillar: 'creativity', text: 'x' })
		).toThrow();
	});
});

describe('ScoringResultSchema', () => {
	it('requires exactly six skill-coverage entries', () => {
		const score = validScore();
		const fiveEntries = ctSkillIds.slice(0, 5).map((skill) => ({
			id: uuid(),
			scoreId: score.id,
			skill,
			covered: true,
			confidence: 'medium' as const,
			justification: 'x'
		}));

		expect(() =>
			ScoringResultSchema.parse({ score, skillCoverage: fiveEntries, suggestions: [] })
		).toThrow();
	});

	it('accepts a full valid scoring result', () => {
		const score = validScore();
		const sixEntries = ctSkillIds.map((skill) => ({
			id: uuid(),
			scoreId: score.id,
			skill,
			covered: false,
			confidence: 'low' as const,
			justification: 'Not clearly present in the submitted text.'
		}));

		expect(() =>
			ScoringResultSchema.parse({
				score,
				skillCoverage: sixEntries,
				suggestions: [
					{ id: uuid(), scoreId: score.id, pillar: 'dialogue', text: 'Add peer discussion.' }
				]
			})
		).not.toThrow();
	});
});

describe('LibraryEntrySchema', () => {
	it('accepts an entry with no score yet (scoring in progress/failed)', () => {
		const lesson = validLesson();
		expect(() =>
			LibraryEntrySchema.parse({
				lesson,
				latestVersion: {
					id: uuid(),
					lessonId: lesson.id,
					versionNumber: 1,
					source: 'paste',
					rawText: 'text',
					createdAt: now(),
					scoreId: null
				},
				latestScore: null
			})
		).not.toThrow();
	});
});
