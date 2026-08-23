import { describe, expect, it } from 'vitest';
import { ctSkills } from './taxonomy';
import { getSubjectProfile, subjectProfiles } from './subjectProfiles';

describe('subjectProfiles', () => {
	it('includes the two launch profiles: science-lab and history-essay', () => {
		const ids = subjectProfiles.map((p) => p.id);
		expect(ids).toEqual(expect.arrayContaining(['science-lab', 'history-essay']));
	});

	it('has unique profile ids', () => {
		const ids = subjectProfiles.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every profile has at least one authentic-problem example and one emphasized skill', () => {
		for (const profile of subjectProfiles) {
			expect(profile.authenticProblemExamples.length).toBeGreaterThan(0);
			expect(profile.skillEmphasis.length).toBeGreaterThan(0);
		}
	});

	it('every emphasized skill id is a real CT skill', () => {
		const validSkillIds = new Set(ctSkills.map((s) => s.id));
		for (const profile of subjectProfiles) {
			for (const skillId of profile.skillEmphasis) {
				expect(validSkillIds.has(skillId)).toBe(true);
			}
		}
	});

	it('science-lab and history-essay emphasize different skills (suggestions should genuinely differ)', () => {
		const scienceLab = getSubjectProfile('science-lab');
		const historyEssay = getSubjectProfile('history-essay');
		expect(scienceLab).toBeDefined();
		expect(historyEssay).toBeDefined();
		expect(scienceLab!.skillEmphasis).not.toEqual(historyEssay!.skillEmphasis);
	});

	it('getSubjectProfile returns undefined for an unknown id rather than throwing', () => {
		expect(getSubjectProfile('not-a-real-subject')).toBeUndefined();
	});
});
