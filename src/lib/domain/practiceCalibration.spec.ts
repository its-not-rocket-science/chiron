import { describe, expect, it } from 'vitest';
import {
	CONFIDENCE_BANDS,
	MIN_SAMPLE_SIZE,
	computeCalibrationReport,
	judgmentWithinTargetRange,
	type CalibrationDataPoint
} from './practiceCalibration';

describe('judgmentWithinTargetRange', () => {
	const targetRange = { min: 'somewhat_unsupported' as const, max: 'uncertain' as const };

	it('accepts a judgment at the exact min boundary', () => {
		expect(judgmentWithinTargetRange('somewhat_unsupported', targetRange)).toBe(true);
	});

	it('accepts a judgment at the exact max boundary', () => {
		expect(judgmentWithinTargetRange('uncertain', targetRange)).toBe(true);
	});

	it('rejects a judgment ranked below the range', () => {
		expect(judgmentWithinTargetRange('strongly_unsupported', targetRange)).toBe(false);
	});

	it('rejects a judgment ranked above the range', () => {
		expect(judgmentWithinTargetRange('somewhat_supported', targetRange)).toBe(false);
	});

	it('handles a single-value range (min === max)', () => {
		const single = { min: 'uncertain' as const, max: 'uncertain' as const };
		expect(judgmentWithinTargetRange('uncertain', single)).toBe(true);
		expect(judgmentWithinTargetRange('somewhat_unsupported', single)).toBe(false);
	});
});

describe('computeCalibrationReport — empty input', () => {
	it('reports zero attempts, a null Brier score, and every band as insufficient data', () => {
		const report = computeCalibrationReport([]);
		expect(report.eligibleAttemptCount).toBe(0);
		expect(report.brierScore).toBeNull();
		expect(report.bands).toHaveLength(CONFIDENCE_BANDS.length);
		for (const band of report.bands) {
			expect(band.attemptCount).toBe(0);
			expect(band.observedAccuracy).toBeNull();
		}
	});
});

describe('computeCalibrationReport — band bucketing', () => {
	function point(confidence: number, withinTargetRange: boolean): CalibrationDataPoint {
		return { confidence, withinTargetRange };
	}

	it('buckets a confidence value exactly on a band boundary into the higher band', () => {
		const report = computeCalibrationReport([point(20, true), point(40, true), point(60, true)]);
		const bandCounts = Object.fromEntries(report.bands.map((b) => [b.label, b.attemptCount]));
		expect(bandCounts['0-20%']).toBe(0);
		expect(bandCounts['20-40%']).toBe(1); // the 20 landed here
		expect(bandCounts['40-60%']).toBe(1); // the 40 landed here
		expect(bandCounts['60-80%']).toBe(1); // the 60 landed here
	});

	it('buckets confidence 100 into the top band (inclusive upper bound)', () => {
		const report = computeCalibrationReport([point(100, true)]);
		const topBand = report.bands.find((b) => b.label === '80-100%');
		expect(topBand?.attemptCount).toBe(1);
	});

	it('sums band attemptCounts to the total input length', () => {
		const points = [point(5, true), point(25, false), point(55, true), point(95, false)];
		const report = computeCalibrationReport(points);
		const total = report.bands.reduce((sum, b) => sum + b.attemptCount, 0);
		expect(total).toBe(points.length);
	});
});

describe('computeCalibrationReport — sample-size gating (no fake precision)', () => {
	function point(confidence: number, withinTargetRange: boolean): CalibrationDataPoint {
		return { confidence, withinTargetRange };
	}

	it('reports observedAccuracy as null for a band below MIN_SAMPLE_SIZE, even at 100% or 0% actual accuracy', () => {
		const points = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, () => point(90, true));
		const report = computeCalibrationReport(points);
		const topBand = report.bands.find((b) => b.label === '80-100%');
		expect(topBand?.attemptCount).toBe(MIN_SAMPLE_SIZE - 1);
		expect(topBand?.observedAccuracy).toBeNull();
	});

	it('reports a real observedAccuracy once a band reaches MIN_SAMPLE_SIZE', () => {
		const points = [
			...Array.from({ length: 4 }, () => point(90, true)),
			point(90, false) // 5 total: 4/5 = 0.8
		];
		const report = computeCalibrationReport(points);
		const topBand = report.bands.find((b) => b.label === '80-100%');
		expect(topBand?.attemptCount).toBe(5);
		expect(topBand?.observedAccuracy).toBeCloseTo(0.8);
	});

	it('reports brierScore as null below the overall MIN_SAMPLE_SIZE, regardless of band-level sufficiency', () => {
		const points = Array.from({ length: MIN_SAMPLE_SIZE - 1 }, () => point(50, true));
		const report = computeCalibrationReport(points);
		expect(report.brierScore).toBeNull();
	});

	it('reports a real brierScore once overall attempts reach MIN_SAMPLE_SIZE', () => {
		const points = Array.from({ length: MIN_SAMPLE_SIZE }, () => point(50, true));
		const report = computeCalibrationReport(points);
		expect(report.brierScore).not.toBeNull();
	});
});

describe('computeCalibrationReport — Brier score correctness', () => {
	it('computes the mean squared error between stated confidence and the within-range outcome', () => {
		// predicted=1.0,actual=1 -> 0 | predicted=0.0,actual=0 -> 0 |
		// predicted=1.0,actual=0 -> 1 | predicted=0.5,actual=1 -> 0.25 |
		// predicted=0.5,actual=0 -> 0.25
		// mean = (0 + 0 + 1 + 0.25 + 0.25) / 5 = 0.3
		const points: CalibrationDataPoint[] = [
			{ confidence: 100, withinTargetRange: true },
			{ confidence: 0, withinTargetRange: false },
			{ confidence: 100, withinTargetRange: false },
			{ confidence: 50, withinTargetRange: true },
			{ confidence: 50, withinTargetRange: false }
		];
		const report = computeCalibrationReport(points);
		expect(report.brierScore).toBeCloseTo(0.3);
	});

	it('scores a perfectly-calibrated dataset at 0', () => {
		const points: CalibrationDataPoint[] = Array.from({ length: MIN_SAMPLE_SIZE }, () => ({
			confidence: 100,
			withinTargetRange: true
		}));
		const report = computeCalibrationReport(points);
		expect(report.brierScore).toBe(0);
	});

	it('scores a maximally-miscalibrated dataset at 1', () => {
		const points: CalibrationDataPoint[] = Array.from({ length: MIN_SAMPLE_SIZE }, () => ({
			confidence: 100,
			withinTargetRange: false
		}));
		const report = computeCalibrationReport(points);
		expect(report.brierScore).toBe(1);
	});

	it('scores a well-calibrated dataset better (lower) than a badly-calibrated one of the same size', () => {
		// Well-calibrated: ~90% confidence, actually right ~90% of the time.
		const wellCalibrated: CalibrationDataPoint[] = [
			...Array.from({ length: 9 }, () => ({ confidence: 90, withinTargetRange: true })),
			{ confidence: 90, withinTargetRange: false }
		];
		// Overconfident: ~90% confidence, actually right only ~10% of the time.
		const badlyCalibrated: CalibrationDataPoint[] = [
			...Array.from({ length: 9 }, () => ({ confidence: 90, withinTargetRange: false })),
			{ confidence: 90, withinTargetRange: true }
		];
		const wellReport = computeCalibrationReport(wellCalibrated);
		const badReport = computeCalibrationReport(badlyCalibrated);
		expect(wellReport.brierScore).not.toBeNull();
		expect(badReport.brierScore).not.toBeNull();
		expect(wellReport.brierScore!).toBeLessThan(badReport.brierScore!);
	});
});
