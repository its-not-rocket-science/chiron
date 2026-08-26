/**
 * Deterministic before/after comparison between two calibration
 * reports (`chiron_calibration_feedback_and_automation_prompts.txt`
 * Prompt M4(n)). No LLM involvement — every line here is a direct
 * comparison of two already-computed `CalibrationReport` JSON objects.
 */
import type { CalibrationReport } from './reportTypes';
import type { Verdict } from '../../tests/calibration/evaluateCalibration';

export interface VerdictChange {
	fixtureId: string;
	from: Verdict;
	to: Verdict;
}

export interface ScoreDistributionChange {
	fixtureId: string;
	pillar: string;
	fromMean: number;
	toMean: number;
}

export interface SkillCreditChange {
	fixtureId: string;
	skill: string;
	fromCoveredCount: number;
	toCoveredCount: number;
	totalRuns: number;
	direction: 'newly-credited' | 'newly-uncredited';
}

export interface VarianceChange {
	fixtureId: string;
	pillar: string;
	from: string;
	to: string;
}

export interface ReportComparison {
	verdictChanges: VerdictChange[];
	scoreDistributionChanges: ScoreDistributionChange[];
	skillCreditChanges: SkillCreditChange[];
	varianceChanges: VarianceChange[];
}

export function compareReports(
	previous: CalibrationReport,
	current: CalibrationReport
): ReportComparison {
	const verdictChanges: VerdictChange[] = [];
	const scoreDistributionChanges: ScoreDistributionChange[] = [];
	const skillCreditChanges: SkillCreditChange[] = [];
	const varianceChanges: VarianceChange[] = [];

	for (const currentEval of current.fixtureEvaluations) {
		const previousEval = previous.fixtureEvaluations.find(
			(f) => f.fixtureId === currentEval.fixtureId
		);
		if (!previousEval) continue; // fixture is new this run — nothing to diff against

		if (previousEval.verdict !== currentEval.verdict) {
			verdictChanges.push({
				fixtureId: currentEval.fixtureId,
				from: previousEval.verdict,
				to: currentEval.verdict
			});
		}

		for (const currentPillar of currentEval.pillarRepeatability) {
			const previousPillar = previousEval.pillarRepeatability.find(
				(p) => p.pillar === currentPillar.pillar
			);
			if (!previousPillar) continue;
			if (previousPillar.mean !== currentPillar.mean) {
				scoreDistributionChanges.push({
					fixtureId: currentEval.fixtureId,
					pillar: currentPillar.pillar,
					fromMean: previousPillar.mean,
					toMean: currentPillar.mean
				});
			}
			if (previousPillar.varianceFlag !== currentPillar.varianceFlag) {
				varianceChanges.push({
					fixtureId: currentEval.fixtureId,
					pillar: currentPillar.pillar,
					from: previousPillar.varianceFlag,
					to: currentPillar.varianceFlag
				});
			}
		}

		for (const currentSkill of currentEval.skillRepeatability) {
			const previousSkill = previousEval.skillRepeatability.find(
				(s) => s.skill === currentSkill.skill
			);
			if (!previousSkill) continue;
			const previousMajority = previousSkill.coveredCount > previousSkill.totalRuns / 2;
			const currentMajority = currentSkill.coveredCount > currentSkill.totalRuns / 2;
			if (previousMajority !== currentMajority) {
				skillCreditChanges.push({
					fixtureId: currentEval.fixtureId,
					skill: currentSkill.skill,
					fromCoveredCount: previousSkill.coveredCount,
					toCoveredCount: currentSkill.coveredCount,
					totalRuns: currentSkill.totalRuns,
					direction: currentMajority ? 'newly-credited' : 'newly-uncredited'
				});
			}
		}
	}

	return { verdictChanges, scoreDistributionChanges, skillCreditChanges, varianceChanges };
}

export function formatComparison(comparison: ReportComparison): string {
	const lines = ['', '='.repeat(78), 'COMPARISON VS PREVIOUS REPORT', '='.repeat(78)];

	lines.push('', 'Verdict changes:');
	if (comparison.verdictChanges.length === 0) lines.push('  (none)');
	for (const c of comparison.verdictChanges) {
		lines.push(`  ${c.fixtureId}: ${c.from} -> ${c.to}`);
	}

	lines.push('', 'Score distribution changes (mean pillar score):');
	if (comparison.scoreDistributionChanges.length === 0) lines.push('  (none)');
	for (const c of comparison.scoreDistributionChanges) {
		lines.push(`  ${c.fixtureId} ${c.pillar}: ${c.fromMean.toFixed(2)} -> ${c.toMean.toFixed(2)}`);
	}

	lines.push('', 'Newly over/under-credited skills (majority-covered flipped):');
	if (comparison.skillCreditChanges.length === 0) lines.push('  (none)');
	for (const c of comparison.skillCreditChanges) {
		lines.push(
			`  ${c.fixtureId} ${c.skill}: ${c.direction} (${c.fromCoveredCount}->${c.toCoveredCount} of ${c.totalRuns})`
		);
	}

	lines.push('', 'Variance changes:');
	if (comparison.varianceChanges.length === 0) lines.push('  (none)');
	for (const c of comparison.varianceChanges) {
		lines.push(`  ${c.fixtureId} ${c.pillar}: ${c.from} -> ${c.to}`);
	}

	return lines.join('\n');
}
