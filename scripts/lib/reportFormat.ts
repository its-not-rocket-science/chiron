/**
 * Text/markdown report formatters for the scorer-calibration CLI
 * (`chiron_calibration_feedback_and_automation_prompts.txt` Prompt
 * M4(j)) — the section order below is that prompt's own list, verbatim.
 * Pure string formatting only; all the actual PASS/WARN/FAIL logic
 * already happened in `evaluateCalibration.ts` by the time a report
 * reaches these functions.
 */
import type { CalibrationReport } from './reportTypes';
import type { FixtureEvaluation } from '../../tests/calibration/evaluateCalibration';

const RULE = '='.repeat(78);
const THIN_RULE = '-'.repeat(78);

function header(report: CalibrationReport): string {
	return [
		RULE,
		'CHIRON SCORER CALIBRATION REPORT',
		RULE,
		`Generated:      ${report.generatedAt}`,
		`Commit:         ${report.commitSha}${report.dirty ? ' (dirty working tree)' : ''}`,
		`Provider:       ${report.providerId}`,
		`Model:          ${report.modelId}`,
		`Prompt version: ${report.promptVersion}`,
		`Mode:           ${report.mode}`,
		`Runs/fixture:   ${report.runsPerFixture}`,
		`Total calls:    ${report.callCount}`
	].join('\n');
}

function executiveSummary(report: CalibrationReport): string {
	const total = report.fixtureEvaluations.length;
	const pass = report.fixtureEvaluations.filter((f) => f.verdict === 'PASS').length;
	const warn = report.fixtureEvaluations.filter((f) => f.verdict === 'WARN').length;
	const fail = report.fixtureEvaluations.filter((f) => f.verdict === 'FAIL').length;
	const injTotal = report.injectionEvaluations.length;
	const injFail = report.injectionEvaluations.filter((i) => i.verdict === 'FAIL').length;
	const contrastTotal = report.pairedContrastEvaluations.length;
	const contrastFail = report.pairedContrastEvaluations.filter((c) => c.verdict === 'FAIL').length;
	const lines = [
		THIN_RULE,
		'EXECUTIVE SUMMARY',
		THIN_RULE,
		`Fixtures: ${total} total — ${pass} PASS, ${warn} WARN, ${fail} FAIL`,
		`Injection variants: ${injTotal} total — ${injTotal - injFail} PASS, ${injFail} FAIL`,
		`Paired contrasts: ${contrastTotal} total — ${contrastTotal - contrastFail} PASS, ${contrastFail} FAIL`
	];
	if (report.erroredFixtureIds.length > 0) {
		lines.push(`Fixtures that errored on every attempt: ${report.erroredFixtureIds.join(', ')}`);
	}
	return lines.join('\n');
}

function hardFailures(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'HARD FAILURES', THIN_RULE];
	let any = false;
	for (const f of report.fixtureEvaluations) {
		if (f.verdict !== 'FAIL') continue;
		any = true;
		for (const v of f.hardInvariantViolations) {
			lines.push(
				`[${f.fixtureId}] run ${v.runIndex + 1}: ${v.invariant.type} violated — actual ${v.actual}. ${v.invariant.reason}`
			);
		}
	}
	for (const i of report.injectionEvaluations) {
		if (i.verdict !== 'FAIL') continue;
		any = true;
		const deltas = i.pillarDeltas
			.filter((d) => d.delta !== 0)
			.map((d) => `${d.pillar} ${d.baseScore}->${d.variantScore}`)
			.join(', ');
		const flips = i.skillFlips.map((f) => f.skill).join(', ');
		lines.push(
			`[${i.fixtureId}/${i.variantName}] injection materially changed the score` +
				(deltas ? ` — pillar deltas: ${deltas}` : '') +
				(flips ? ` — skills flipped to covered: ${flips}` : '')
		);
	}
	for (const c of report.pairedContrastEvaluations) {
		if (c.verdict !== 'FAIL') continue;
		any = true;
		lines.push(
			`[${c.contrast.id}] ${c.contrast.strongerId} did not score/cover ${c.contrast.dimension} strictly better than ${c.contrast.weakerId} — ${c.strongerSummary} vs ${c.weakerSummary}. ${c.contrast.reason}`
		);
	}
	if (!any) lines.push('(none)');
	return lines.join('\n');
}

function warnings(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'WARNINGS', THIN_RULE];
	let any = false;
	for (const f of report.fixtureEvaluations) {
		if (f.verdict !== 'WARN') continue;
		any = true;
		for (const b of f.bandViolations) {
			lines.push(
				`[${f.fixtureId}] run ${b.runIndex + 1}: ${b.pillar} scored ${b.actual}, outside expected band [${b.min}-${b.max}]`
			);
		}
		for (const s of f.skillMismatches) {
			lines.push(
				`[${f.fixtureId}] run ${s.runIndex + 1}: ${s.skill} covered=${s.actual}, expected ${s.expected}`
			);
		}
	}
	if (!any) lines.push('(none)');
	return lines.join('\n');
}

function profileSummary(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'PROFILE SUMMARY', THIN_RULE];
	for (const profile of ['science-lab', 'history-essay'] as const) {
		const evals = report.fixtureEvaluations.filter((f) => f.subjectProfileId === profile);
		if (evals.length === 0) continue;
		const pass = evals.filter((f) => f.verdict === 'PASS').length;
		const highVariance = evals.filter((f) =>
			f.pillarRepeatability.some((p) => p.varianceFlag === 'HIGH')
		);
		lines.push(
			`${profile}: ${pass}/${evals.length} PASS. High-variance fixtures: ${
				highVariance.length > 0 ? highVariance.map((f) => f.fixtureId).join(', ') : '(none)'
			}`
		);
	}
	return lines.join('\n');
}

function pairedContrastsSection(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'PAIRED CONTRASTS', THIN_RULE];
	if (report.pairedContrastEvaluations.length === 0) lines.push('(none evaluated)');
	for (const c of report.pairedContrastEvaluations) {
		lines.push(`[${c.verdict}] ${c.contrast.id}: ${c.strongerSummary} vs ${c.weakerSummary}`);
	}
	return lines.join('\n');
}

function fixtureRepeatabilityLine(f: FixtureEvaluation): string {
	const pillarBits = f.pillarRepeatability
		.map((p) => `${p.pillar}=[${p.values.join(',')}] (${p.varianceFlag})`)
		.join(' ');
	return `  ${pillarBits}`;
}

function fixtureResults(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'FIXTURE RESULTS', THIN_RULE];
	for (const f of report.fixtureEvaluations) {
		lines.push(`[${f.verdict}] ${f.fixtureId} — ${f.fixtureTitle}`);
		lines.push(fixtureRepeatabilityLine(f));
		const skillLine = f.skillRepeatability
			.map((s) => `${s.skill}=${s.coveredCount}/${s.totalRuns}`)
			.join(' ');
		lines.push(`  ${skillLine}`);
	}
	return lines.join('\n');
}

function rawModelOutput(report: CalibrationReport): string {
	const lines = [THIN_RULE, 'RAW MODEL OUTPUT', THIN_RULE];
	for (const f of report.fixtureEvaluations) {
		for (const run of f.runs) {
			lines.push(`--- ${f.fixtureId} run ${run.runIndex + 1} (${run.timestamp}) ---`);
			const s = run.scoringResult.score;
			lines.push(`dialogue=${s.dialogueScore}: ${s.dialogueJustification}`);
			lines.push(`authenticity=${s.authenticityScore}: ${s.authenticityJustification}`);
			lines.push(`mentoring=${s.mentoringScore}: ${s.mentoringJustification}`);
			for (const sc of run.scoringResult.skillCoverage) {
				lines.push(`${sc.skill} covered=${sc.covered} (${sc.confidence}): ${sc.justification}`);
			}
			for (const sug of run.scoringResult.suggestions) {
				lines.push(`suggestion[${sug.pillar}]: ${sug.text}`);
			}
			lines.push('');
		}
	}
	return lines.join('\n');
}

export function formatText(report: CalibrationReport): string {
	return [
		header(report),
		executiveSummary(report),
		hardFailures(report),
		warnings(report),
		profileSummary(report),
		pairedContrastsSection(report),
		fixtureResults(report),
		rawModelOutput(report),
		RULE,
		'END REPORT',
		RULE
	].join('\n\n');
}

export function formatMarkdown(report: CalibrationReport): string {
	const lines: string[] = [
		'# Chiron Scorer Calibration Report',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Commit: \`${report.commitSha}\`${report.dirty ? ' (dirty)' : ''}`,
		`- Provider/model: ${report.providerId} / ${report.modelId}`,
		`- Prompt version: ${report.promptVersion}`,
		`- Mode: ${report.mode}, runs/fixture: ${report.runsPerFixture}, total calls: ${report.callCount}`,
		'',
		'## Executive summary',
		'',
		'| Category | Total | PASS | WARN/other | FAIL |',
		'| --- | --- | --- | --- | --- |'
	];
	const f = report.fixtureEvaluations;
	lines.push(
		`| Fixtures | ${f.length} | ${f.filter((x) => x.verdict === 'PASS').length} | ${f.filter((x) => x.verdict === 'WARN').length} | ${f.filter((x) => x.verdict === 'FAIL').length} |`
	);
	const inj = report.injectionEvaluations;
	lines.push(
		`| Injection variants | ${inj.length} | ${inj.filter((x) => x.verdict === 'PASS').length} | - | ${inj.filter((x) => x.verdict === 'FAIL').length} |`
	);
	const pc = report.pairedContrastEvaluations;
	lines.push(
		`| Paired contrasts | ${pc.length} | ${pc.filter((x) => x.verdict === 'PASS').length} | - | ${pc.filter((x) => x.verdict === 'FAIL').length} |`
	);

	lines.push('', '## Fixture results', '', '| Fixture | Verdict | Title |', '| --- | --- | --- |');
	for (const fe of report.fixtureEvaluations) {
		lines.push(`| ${fe.fixtureId} | ${fe.verdict} | ${fe.fixtureTitle} |`);
	}

	lines.push('', '## Paired contrasts', '', '| Contrast | Verdict |', '| --- | --- |');
	for (const c of report.pairedContrastEvaluations) {
		lines.push(`| ${c.contrast.id} | ${c.verdict} |`);
	}

	lines.push(
		'',
		'Full raw model output is in the `.txt`/`.json` reports generated alongside this file, not duplicated here.'
	);

	return lines.join('\n');
}
