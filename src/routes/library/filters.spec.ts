import { describe, expect, it } from 'vitest';
import { defaultFilters, parseFilters, passesScoreFilter } from './filters';

describe('parseFilters', () => {
	it('reads all filter fields from the URL query string', () => {
		const url = new URL(
			'http://localhost/library?subject=science-lab&grade=9&minDialogue=2&minAuthenticity=1&minMentoring=3'
		);
		expect(parseFilters(url)).toEqual({
			subjectProfileId: 'science-lab',
			gradeLevel: '9',
			minDialogue: 2,
			minAuthenticity: 1,
			minMentoring: 3
		});
	});

	it('falls back to defaults for a bare /library visit', () => {
		expect(parseFilters(new URL('http://localhost/library'))).toEqual(defaultFilters());
	});
});

describe('passesScoreFilter', () => {
	const scoredRow = (dialogue: number, authenticity: number, mentoring: number) => ({
		lesson_versions: {
			scores: {
				dialogue_score: dialogue,
				authenticity_score: authenticity,
				mentoring_score: mentoring
			}
		}
	});

	it('passes a row that meets every minimum', () => {
		const row = scoredRow(3, 2, 2);
		const filters = { ...defaultFilters(), minDialogue: 2, minAuthenticity: 2, minMentoring: 1 };
		expect(passesScoreFilter(row, filters)).toBe(true);
	});

	it('rejects a row that falls short on just one pillar', () => {
		const row = scoredRow(3, 1, 2);
		const filters = { ...defaultFilters(), minAuthenticity: 2 };
		expect(passesScoreFilter(row, filters)).toBe(false);
	});

	it('with no filters set (all "Any"), every scored row passes', () => {
		const row = scoredRow(0, 0, 0);
		expect(passesScoreFilter(row, defaultFilters())).toBe(true);
	});

	it('a lesson with no scored version passes only when no score filter is active', () => {
		const unscored = { lesson_versions: null };
		expect(passesScoreFilter(unscored, defaultFilters())).toBe(true);
		expect(passesScoreFilter(unscored, { ...defaultFilters(), minDialogue: 1 })).toBe(false);
	});
});
