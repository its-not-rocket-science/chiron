import { describe, expect, it } from 'vitest';
import { ctSkills, dispositionClusters, getCTSkill, taxonomyGroundingText } from './taxonomy';

describe('taxonomy', () => {
	it('has exactly six CT skills, each with at least one sub-skill', () => {
		expect(ctSkills).toHaveLength(6);
		for (const skill of ctSkills) {
			expect(skill.id).toBeTruthy();
			expect(skill.name).toBeTruthy();
			expect(skill.description).toBeTruthy();
			expect(skill.subSkills.length).toBeGreaterThan(0);
		}
	});

	it('has unique skill ids', () => {
		const ids = ctSkills.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('getCTSkill returns the matching skill and throws on an unknown id', () => {
		expect(getCTSkill('inference').name).toBe('Inference');
		// @ts-expect-error deliberately invalid id to exercise the error path
		expect(() => getCTSkill('not-a-skill')).toThrow(/Unknown CT skill id/);
	});

	it('has two disposition clusters, each with items', () => {
		expect(dispositionClusters).toHaveLength(2);
		for (const cluster of dispositionClusters) {
			expect(cluster.items.length).toBeGreaterThan(0);
		}
	});

	it('renders non-empty grounding text mentioning every skill name', () => {
		const text = taxonomyGroundingText();
		for (const skill of ctSkills) {
			expect(text).toContain(skill.name);
		}
	});
});
