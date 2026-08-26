import type {
	FixtureEvaluation,
	InjectionVariantEvaluation,
	PairedContrastEvaluation
} from '../../tests/calibration/evaluateCalibration';

export type RunMode = 'direct' | 'smoke';

export interface CalibrationReport {
	generatedAt: string;
	commitSha: string;
	dirty: boolean;
	providerId: string;
	modelId: string;
	promptVersion: string;
	runsPerFixture: number;
	mode: RunMode;
	callCount: number;
	fixtureEvaluations: FixtureEvaluation[];
	injectionEvaluations: InjectionVariantEvaluation[];
	pairedContrastEvaluations: PairedContrastEvaluation[];
	/** Fixture ids that errored out entirely (every attempt failed) — kept separate from FAIL verdicts, which mean "ran fine but violated an invariant." */
	erroredFixtureIds: string[];
}

export function hasHardFailures(report: CalibrationReport): boolean {
	return (
		report.fixtureEvaluations.some((f) => f.verdict === 'FAIL') ||
		report.injectionEvaluations.some((i) => i.verdict === 'FAIL') ||
		report.pairedContrastEvaluations.some((c) => c.verdict === 'FAIL') ||
		report.erroredFixtureIds.length > 0
	);
}

export function hasWarnings(report: CalibrationReport): boolean {
	return report.fixtureEvaluations.some((f) => f.verdict === 'WARN');
}
