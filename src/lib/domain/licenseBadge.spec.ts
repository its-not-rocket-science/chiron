import { describe, expect, it } from 'vitest';
import { licenseBadge } from './licenseBadge';
import { LessonLicenseSchema, type LessonLicense } from './schemas';

describe('licenseBadge', () => {
	it('returns a non-empty shortLabel and label for every license enum value', () => {
		for (const license of LessonLicenseSchema.options) {
			const badge = licenseBadge(license as LessonLicense);
			expect(badge.shortLabel.length).toBeGreaterThan(0);
			expect(badge.label.length).toBeGreaterThan(0);
		}
	});

	it('renders CC BY 4.0 with its expected short label', () => {
		expect(licenseBadge('CC-BY-4.0').shortLabel).toBe('CC BY 4.0');
	});

	it('renders Public-Domain-US-Govt with its expected short label', () => {
		expect(licenseBadge('Public-Domain-US-Govt').shortLabel).toBe(
			'Public Domain (U.S. Government)'
		);
	});

	it('every license value produces a visibly different short label', () => {
		const labels = LessonLicenseSchema.options.map(
			(l) => licenseBadge(l as LessonLicense).shortLabel
		);
		expect(new Set(labels).size).toBe(labels.length);
	});
});
