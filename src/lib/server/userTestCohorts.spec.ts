import { describe, expect, it } from 'vitest';
import { parseCohortAllowlist } from './userTestCohorts';

describe('parseCohortAllowlist', () => {
	it('splits a comma-separated list and trims whitespace', () => {
		expect(parseCohortAllowlist('alpha-2026-08, beta-2026-09,gamma')).toEqual([
			'alpha-2026-08',
			'beta-2026-09',
			'gamma'
		]);
	});

	it('drops empty entries from stray commas', () => {
		expect(parseCohortAllowlist('alpha,,beta,')).toEqual(['alpha', 'beta']);
	});

	it('returns an empty array for undefined or empty input', () => {
		expect(parseCohortAllowlist(undefined)).toEqual([]);
		expect(parseCohortAllowlist('')).toEqual([]);
	});
});
