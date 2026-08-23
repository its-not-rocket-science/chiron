import { describe, expect, it } from 'vitest';
import { getRubricLevel, getRubricPillar, rubricGroundingText, rubricPillars } from './rubric';

describe('rubric', () => {
	it('has exactly three pillars, each with four levels scored 0-3', () => {
		expect(rubricPillars).toHaveLength(3);
		for (const pillar of rubricPillars) {
			expect(pillar.levels).toHaveLength(4);
			expect(pillar.levels.map((l) => l.score)).toEqual([0, 1, 2, 3]);
			for (const level of pillar.levels) {
				expect(level.description).toBeTruthy();
			}
		}
	});

	it('has unique pillar ids', () => {
		const ids = rubricPillars.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('getRubricPillar/getRubricLevel resolve correctly and reject unknown input', () => {
		expect(getRubricPillar('mentoring').name).toBe('Mentoring');
		expect(getRubricLevel('dialogue', 3).description).toMatch(/Structured dialogue/);
		// @ts-expect-error deliberately invalid id to exercise the error path
		expect(() => getRubricPillar('not-a-pillar')).toThrow(/Unknown rubric pillar id/);
	});

	it('renders non-empty grounding text mentioning every pillar name', () => {
		const text = rubricGroundingText();
		for (const pillar of rubricPillars) {
			expect(text).toContain(pillar.name);
		}
	});
});
