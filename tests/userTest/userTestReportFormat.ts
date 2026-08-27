/**
 * Text/markdown formatters for the user-test export CLI
 * (chiron_calibration_feedback_and_automation_prompts.txt Section 7).
 * Pure string formatting only — all the aggregation already happened in
 * `userTestReport.ts`. Mirrors `reportFormat.ts`'s visual convention
 * (rule/section-header style) for consistency across this repo's
 * report-generating scripts.
 */
import { getPracticeCase } from '../../src/lib/domain/practiceCases';
import type { RateSummary } from '../../src/lib/domain/practiceEvaluation';
import type { UserTestReport } from './userTestReport';

const RULE = '='.repeat(78);
const THIN_RULE = '-'.repeat(78);

const TRIAGE_DISCLAIMER =
	'Triage flags below are descriptive heuristics for what to look at next, NOT claims ' +
	'of educational efficacy and NOT a pass/fail standard. See docs/EVALUATION_PLAN.md for ' +
	'what this data can and cannot establish.';

function fmtRate(r: RateSummary): string {
	return r.rate === null
		? `${r.count}/${r.total} (n/a)`
		: `${r.count}/${r.total} (${(r.rate * 100).toFixed(1)}%)`;
}

function fmtMean(mean: number | null, count: number, suffix = ''): string {
	return mean === null ? `n/a (n=${count})` : `${mean.toFixed(2)}${suffix} (n=${count})`;
}

function header(report: UserTestReport): string {
	return [
		RULE,
		'CHIRON PHASE 2A USER-TEST REPORT',
		RULE,
		`Generated:  ${report.generatedAt}`,
		`Commit:     ${report.commitSha}${report.dirty ? ' (dirty working tree)' : ''}`,
		`Cohort:     ${report.cohort}`,
		`Testers:    ${report.testerCount}`
	].join('\n');
}

function executiveSummary(report: UserTestReport): string {
	return [
		THIN_RULE,
		'EXECUTIVE SUMMARY',
		THIN_RULE,
		`Sessions started: ${report.points.length}`,
		`Completion rate:  ${fmtRate(report.completionRate)}`,
		`Would continue:   ${fmtRate(report.survey.wouldContinueRate)}`,
		`Feedback responses: ${report.survey.respondentCount}`,
		`Perceived-steering reports: ${report.survey.perceivedSteeringCount}`
	].join('\n');
}

function triageFlags(report: UserTestReport): string {
	const lines = [THIN_RULE, 'TRIAGE FLAGS', THIN_RULE, TRIAGE_DISCLAIMER, ''];
	const sections: [string, string[]][] = [
		['CRITICAL', report.triage.critical],
		['HIGH', report.triage.high],
		['MEDIUM', report.triage.medium]
	];
	let any = false;
	for (const [label, items] of sections) {
		if (items.length === 0) continue;
		any = true;
		lines.push(`${label}:`);
		for (const item of items) lines.push(`  - ${item}`);
	}
	if (!any) lines.push('(none triggered)');
	return lines.join('\n');
}

function aggregateMetrics(report: UserTestReport): string {
	const lines = [THIN_RULE, 'AGGREGATE METRICS', THIN_RULE];
	lines.push(`Completion rate (overall): ${fmtRate(report.completionRate)}`);
	lines.push('Stage abandonment (non-completed sessions, most common first):');
	if (report.stageAbandonment.length === 0) lines.push('  (none)');
	for (const s of report.stageAbandonment) lines.push(`  ${s.stage}: ${s.count}`);

	lines.push('Initial judgment distribution:');
	for (const [j, c] of Object.entries(report.judgmentDistributionInitial))
		lines.push(`  ${j}: ${c}`);
	lines.push('Revised judgment distribution:');
	for (const [j, c] of Object.entries(report.judgmentDistributionRevised))
		lines.push(`  ${j}: ${c}`);

	lines.push(
		`Mean initial confidence: ${fmtMean(report.meanConfidence.initial.mean, report.meanConfidence.initial.count, '%')}`
	);
	lines.push(
		`Mean revised confidence: ${fmtMean(report.meanConfidence.revised.mean, report.meanConfidence.revised.count, '%')}`
	);
	lines.push(
		`Mean confidence shift: ${fmtMean(report.confidenceShift.meanShift, report.confidenceShift.count, ' pts')}`
	);
	lines.push(`Moved more than one confidence band: ${report.confidenceShift.movedMoreThanOneBand}`);

	lines.push(`Update-criterion supply rate: ${fmtRate(report.updateCriterionRate)}`);
	lines.push('Update-criterion consistency statuses:');
	const ucEntries = Object.entries(report.updateCriterionConsistency);
	if (ucEntries.length === 0) lines.push('  (no attempts used this mechanic)');
	for (const [status, count] of ucEntries) lines.push(`  ${status}: ${count}`);

	lines.push(`Reflection completion rate: ${fmtRate(report.reflectionCompletionRate)}`);

	lines.push('Tutor action distribution:');
	for (const [action, count] of Object.entries(report.tutorActionDistribution)) {
		lines.push(`  ${action}: ${count}`);
	}

	lines.push('Initial-reasoning signal frequency:');
	if (report.initialSignalFrequency.length === 0) lines.push('  (none)');
	for (const s of report.initialSignalFrequency) lines.push(`  ${s.signal}: ${s.count}`);

	lines.push('Revised-reasoning signal frequency:');
	if (report.revisedSignalFrequency.length === 0) lines.push('  (none)');
	for (const s of report.revisedSignalFrequency) lines.push(`  ${s.signal}: ${s.count}`);

	lines.push('Signals newly added after challenge:');
	if (report.signalsAddedAfterChallenge.length === 0) lines.push('  (none)');
	for (const s of report.signalsAddedAfterChallenge) lines.push(`  ${s.signal}: ${s.count}`);

	lines.push('Disposition check-ins:');
	if (report.dispositionSummary.length === 0) lines.push('  (none)');
	for (const d of report.dispositionSummary) {
		lines.push(`  ${d.item}: mean ${fmtMean(d.mean, d.count)}`);
	}

	lines.push(THIN_RULE.slice(0, 0)); // no-op, keeps formatting symmetric with other sections
	lines.push('Confidence calibration:');
	lines.push(
		`  eligible attempts: ${report.calibration.eligibleAttemptCount}, Brier score: ${
			report.calibration.brierScore === null ? 'n/a' : report.calibration.brierScore.toFixed(3)
		}`
	);
	for (const band of report.calibration.bands) {
		lines.push(
			`  ${band.label}: n=${band.attemptCount}, observed accuracy ${
				band.observedAccuracy === null ? 'n/a' : `${(band.observedAccuracy * 100).toFixed(1)}%`
			}`
		);
	}

	return lines.join('\n');
}

function surveySummaries(report: UserTestReport): string {
	const s = report.survey;
	const lines = [THIN_RULE, 'SURVEY SUMMARIES', THIN_RULE];
	lines.push(`Respondents: ${s.respondentCount}`);
	lines.push(
		`Cases understandable (1-5): ${fmtMean(s.casesUnderstandable.mean, s.casesUnderstandable.count)}`
	);
	lines.push(
		`Tutor made me think (1-5): ${fmtMean(s.tutorMadeThink.mean, s.tutorMadeThink.count)}`
	);
	lines.push(
		`New evidence meaningful (1-5): ${fmtMean(s.newEvidenceMeaningful.mean, s.newEvidenceMeaningful.count)}`
	);
	lines.push(
		`Tutor felt repetitive (1-5): ${fmtMean(s.tutorRepetitive.mean, s.tutorRepetitive.count)}`
	);
	lines.push(
		`Confidence percentages understandable (1-5): ${fmtMean(
			s.confidenceUnderstandable.mean,
			s.confidenceUnderstandable.count
		)}`
	);
	lines.push('Update-criterion understandable:');
	for (const [k, v] of Object.entries(s.updateCriterionUnderstandable)) lines.push(`  ${k}: ${v}`);
	lines.push(`Would voluntarily continue: ${fmtRate(s.wouldContinueRate)}`);
	lines.push(`Perceived-steering reports: ${s.perceivedSteeringCount}`);
	for (const e of s.perceivedSteeringExplanations) {
		lines.push(`  [${report.pseudonymMap.get(e.studentId) ?? 'Tester ???'}] "${e.explanation}"`);
	}
	return lines.join('\n');
}

function perCaseMetrics(report: UserTestReport): string {
	const lines = [THIN_RULE, 'PER-CASE METRICS', THIN_RULE];
	for (const c of report.perCase) {
		const practiceCase = getPracticeCase(c.caseId);
		lines.push(`[${c.caseId}] ${practiceCase?.title ?? ''}`);
		lines.push(`  completion: ${fmtRate(c.completionRate)}`);
		lines.push(
			`  confidence shift: ${fmtMean(c.confidenceShift.meanShift, c.confidenceShift.count, ' pts')}`
		);
	}
	return lines.join('\n');
}

function perTesterPaths(report: UserTestReport): string {
	const lines = [THIN_RULE, 'PER-TESTER ANONYMISED PATHS', THIN_RULE];
	const byStudent = new Map<string, typeof report.points>();
	for (const point of report.points) {
		const session = report.sessions.find((s) => s.id === point.sessionId);
		if (!session) continue;
		const list = byStudent.get(session.student_id) ?? [];
		list.push(point);
		byStudent.set(session.student_id, list);
	}
	for (const [studentId, points] of byStudent) {
		const label = report.pseudonymMap.get(studentId) ?? 'Tester ???';
		const path = points.map((p) => `${p.caseId}:${p.fsmState}`).join(', ');
		lines.push(`${label}: ${path}`);
	}
	return lines.join('\n');
}

function rawTranscripts(report: UserTestReport): string {
	const lines = [THIN_RULE, 'RAW TRANSCRIPTS', THIN_RULE];
	for (const session of report.sessions) {
		const practiceCase = getPracticeCase(session.case_id);
		const label = report.pseudonymMap.get(session.student_id) ?? 'Tester ???';
		const attempt = report.attempts.find((a) => a.session_id === session.id);

		lines.push(`--- ${label} / ${session.case_id} (session ${session.fsm_state}) ---`);
		if (session.initial_judgment) {
			lines.push(
				`Initial judgment: ${session.initial_judgment.judgment} @ ${session.initial_judgment.confidence}%`
			);
			lines.push(`Initial reasoning: "${session.initial_judgment.reasoning}"`);
		}
		if (session.update_criterion_text) {
			lines.push(`Update criterion: "${session.update_criterion_text}"`);
		}
		if (session.transcript.length > 0) {
			lines.push('Tutor turns:');
			for (const turn of session.transcript) {
				lines.push(`  [${turn.action.action}] Q: "${turn.questionText}"`);
				if (turn.response) lines.push(`    A: "${turn.response}"`);
			}
		}
		if (session.revealed_evidence_ids.length > 0 && practiceCase) {
			lines.push('Revealed evidence:');
			for (const evidenceId of session.revealed_evidence_ids) {
				const item = practiceCase.evidencePool.find((e) => e.id === evidenceId);
				if (item) lines.push(`  - ${item.text}`);
			}
		}
		if (session.revised_judgment) {
			lines.push(
				`Revised judgment: ${session.revised_judgment.judgment} @ ${session.revised_judgment.confidence}%`
			);
			lines.push(`Revised reasoning: "${session.revised_judgment.reasoning}"`);
		}
		if (attempt) {
			lines.push(
				`Detected reasoning signals (revised): ${
					attempt.scoring_events
						.filter((e) => e.signal !== null)
						.map((e) => e.signal)
						.join(', ') || '(none)'
				}`
			);
			lines.push('Deterministic scoring events:');
			for (const e of attempt.scoring_events) {
				lines.push(
					`  [${e.stage}] ${e.ruleId ? `rule ${e.ruleId}` : `signal ${e.signal}`}: ${e.explanation}`
				);
			}
			if (attempt.update_criterion) {
				lines.push(
					`Update-criterion consistency: ${attempt.update_criterion.consistency.status} — ${attempt.update_criterion.consistency.explanation}`
				);
			}
		}
		if (session.reflection_text) {
			lines.push(`Reflection: "${session.reflection_text}"`);
		}
		lines.push('');
	}
	return lines.join('\n');
}

export function formatText(report: UserTestReport): string {
	return [
		header(report),
		executiveSummary(report),
		triageFlags(report),
		aggregateMetrics(report),
		surveySummaries(report),
		perCaseMetrics(report),
		perTesterPaths(report),
		rawTranscripts(report),
		RULE,
		'END REPORT',
		RULE
	].join('\n\n');
}

export function formatMarkdown(report: UserTestReport): string {
	const lines: string[] = [
		'# Chiron Phase 2A User-Test Report',
		'',
		`- Generated: ${report.generatedAt}`,
		`- Commit: \`${report.commitSha}\`${report.dirty ? ' (dirty)' : ''}`,
		`- Cohort: ${report.cohort}`,
		`- Testers: ${report.testerCount}`,
		'',
		'## Executive summary',
		'',
		`- Sessions started: ${report.points.length}`,
		`- Completion rate: ${fmtRate(report.completionRate)}`,
		`- Would continue: ${fmtRate(report.survey.wouldContinueRate)}`,
		`- Perceived-steering reports: ${report.survey.perceivedSteeringCount}`,
		'',
		`> ${TRIAGE_DISCLAIMER}`,
		'',
		'## Triage flags',
		''
	];
	const sections: [string, string[]][] = [
		['CRITICAL', report.triage.critical],
		['HIGH', report.triage.high],
		['MEDIUM', report.triage.medium]
	];
	let anyFlag = false;
	for (const [label, items] of sections) {
		if (items.length === 0) continue;
		anyFlag = true;
		lines.push(`**${label}**`);
		for (const item of items) lines.push(`- ${item}`);
	}
	if (!anyFlag) lines.push('(none triggered)');

	lines.push(
		'',
		'## Per-case metrics',
		'',
		'| Case | Completion | Mean confidence shift |',
		'| --- | --- | --- |'
	);
	for (const c of report.perCase) {
		lines.push(
			`| ${c.caseId} | ${fmtRate(c.completionRate)} | ${fmtMean(c.confidenceShift.meanShift, c.confidenceShift.count)} |`
		);
	}

	lines.push(
		'',
		'Full raw transcripts and per-tester paths are in the `.txt`/`.json` reports generated alongside this file, not duplicated here.'
	);

	return lines.join('\n');
}

/**
 * Builds the JSON output explicitly rather than `JSON.stringify(report)`
 * directly — the in-memory `UserTestReport` still carries raw
 * `student_id` values inside its `sessions`/`attempts`/`checkins`/
 * `feedback` arrays (needed internally so `formatText` can join rows
 * together), and `pseudonymMap` itself is keyed BY raw student id. Both
 * would leak a Supabase user id straight into the exported report if
 * serialized as-is — Section 5's explicit "must not contain ... Supabase
 * user IDs" requirement. Every `student_id` below is replaced with its
 * pseudonym label; the map itself is never included.
 */
export function toJson(report: UserTestReport): string {
	const label = (studentId: string) => report.pseudonymMap.get(studentId) ?? 'Tester ???';

	const sanitized = {
		cohort: report.cohort,
		generatedAt: report.generatedAt,
		commitSha: report.commitSha,
		dirty: report.dirty,
		testerCount: report.testerCount,
		completionRate: report.completionRate,
		stageAbandonment: report.stageAbandonment,
		judgmentDistributionInitial: report.judgmentDistributionInitial,
		judgmentDistributionRevised: report.judgmentDistributionRevised,
		meanConfidence: report.meanConfidence,
		confidenceShift: report.confidenceShift,
		updateCriterionRate: report.updateCriterionRate,
		updateCriterionConsistency: report.updateCriterionConsistency,
		reflectionCompletionRate: report.reflectionCompletionRate,
		tutorActionDistribution: report.tutorActionDistribution,
		initialSignalFrequency: report.initialSignalFrequency,
		revisedSignalFrequency: report.revisedSignalFrequency,
		signalsAddedAfterChallenge: report.signalsAddedAfterChallenge,
		dispositionSummary: report.dispositionSummary,
		calibration: report.calibration,
		perCase: report.perCase,
		survey: {
			...report.survey,
			perceivedSteeringExplanations: report.survey.perceivedSteeringExplanations.map((e) => ({
				tester: label(e.studentId),
				explanation: e.explanation
			}))
		},
		triage: report.triage,
		dispositionCheckinCount: report.dispositionCheckinCount,
		sessions: report.sessions.map(({ student_id, ...rest }) => ({
			tester: label(student_id),
			...rest
		})),
		attempts: report.attempts.map(({ student_id, ...rest }) => ({
			tester: label(student_id),
			...rest
		})),
		checkins: report.checkins.map(({ student_id, ...rest }) => ({
			tester: label(student_id),
			...rest
		})),
		feedback: report.feedback.map(({ student_id, ...rest }) => ({
			tester: label(student_id),
			...rest
		}))
	};

	return JSON.stringify(sanitized, null, 2);
}
