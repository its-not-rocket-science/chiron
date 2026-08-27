#!/usr/bin/env node
/**
 * Phase 2A user-test export CLI
 * (chiron_calibration_feedback_and_automation_prompts.txt). One command,
 * real domain code (`practiceEvaluation.ts`/`practiceCalibration.ts` via
 * `tests/userTest/userTestReport.ts`), a self-contained report — see
 * docs/USER_TEST.md for the full operational workflow. Run via
 * `npm run test:user-report -- --cohort <id>`.
 *
 * Constructs its own Supabase client from `process.env` directly rather
 * than importing `$lib/server/serviceRoleClient` — that module (like
 * `$lib/server/env`) imports SvelteKit's `$env/dynamic/private` virtual
 * module, which only resolves inside Vite's pipeline, not a plain
 * `node --import tsx` script (the same class of bug `envErrors.ts` was
 * split out to avoid for the calibration harness).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { readGitMetadata } from './lib/gitMetadata';
import {
	buildUserTestReport,
	pseudonymizeTesters,
	type RawAttemptRow,
	type RawCheckinRow,
	type RawFeedbackRow,
	type RawSessionRow
} from '../tests/userTest/userTestReport';
import { formatMarkdown, formatText, toJson } from '../tests/userTest/userTestReportFormat';

interface CliArgs {
	cohort: string;
	tester: string | null;
	caseId: string | null;
	dryRun: boolean;
	output: string;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		cohort: '',
		tester: null,
		caseId: null,
		dryRun: false,
		output: 'artifacts/user-tests'
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => argv[++i];
		switch (arg) {
			case '--cohort':
				args.cohort = next();
				break;
			case '--tester':
				args.tester = next();
				break;
			case '--case':
				args.caseId = next();
				break;
			case '--output':
				args.output = next();
				break;
			case '--dry-run':
				args.dryRun = true;
				break;
			default:
				console.error(`Unknown argument: ${arg}`);
				process.exit(1);
		}
	}
	if (!args.cohort) {
		console.error(
			'Usage: npm run test:user-report -- --cohort <id> [--tester <n>] [--case <id>] [--dry-run]'
		);
		process.exit(1);
	}
	return args;
}

function getSupabase() {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error(
			'Missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run via: node --env-file=.env --import tsx scripts/export-user-test.ts'
		);
		process.exit(1);
	}
	return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const supabase = getSupabase();

	const { data: sessions, error: sessionsError } = await supabase
		.from('practice_sessions')
		.select(
			'id, student_id, case_id, fsm_state, revealed_evidence_ids, transcript, initial_judgment, update_criterion_text, revised_judgment, reflection_text, test_cohort, created_at'
		)
		.eq('test_cohort', args.cohort);
	if (sessionsError) {
		console.error('Failed to fetch practice_sessions:', sessionsError.message);
		process.exit(1);
	}
	const allSessions = (sessions ?? []) as RawSessionRow[];
	if (allSessions.length === 0) {
		console.error(`No practice_sessions found for cohort "${args.cohort}".`);
		process.exit(1);
	}

	const sessionIds = allSessions.map((s) => s.id);
	const { data: attempts, error: attemptsError } = await supabase
		.from('practice_attempts')
		.select(
			'id, student_id, case_id, session_id, initial_judgment, update_criterion, revised_judgment, scoring_events, initial_reasoning_signals, outcome, created_at'
		)
		.in('session_id', sessionIds);
	if (attemptsError) {
		console.error('Failed to fetch practice_attempts:', attemptsError.message);
		process.exit(1);
	}
	const allAttempts = (attempts ?? []) as RawAttemptRow[];

	const attemptIds = allAttempts.map((a) => a.id);
	const { data: checkins, error: checkinsError } =
		attemptIds.length > 0
			? await supabase
					.from('disposition_checkins')
					.select('id, student_id, attempt_id, disposition_item, response, created_at')
					.in('attempt_id', attemptIds)
			: { data: [] as RawCheckinRow[], error: null };
	if (checkinsError) {
		console.error('Failed to fetch disposition_checkins:', checkinsError.message);
		process.exit(1);
	}
	const allCheckins = (checkins ?? []) as RawCheckinRow[];

	const { data: feedback, error: feedbackError } = await supabase
		.from('user_test_feedback')
		.select(
			'id, student_id, test_cohort, cases_understandable, tutor_made_think, new_evidence_meaningful, tutor_repetitive, confidence_understandable, update_criterion_understandable, perceived_steering, perceived_steering_explanation, would_continue, what_worked_best, what_needs_changing, created_at'
		)
		.eq('test_cohort', args.cohort);
	if (feedbackError) {
		console.error('Failed to fetch user_test_feedback:', feedbackError.message);
		process.exit(1);
	}
	const allFeedback = (feedback ?? []) as RawFeedbackRow[];

	// Pseudonym labels computed from the FULL, unfiltered cohort — so a
	// --tester-filtered report keeps the same label a full-cohort report
	// would have used, rather than renumbering from a smaller set.
	const fullStudentIds = [
		...allSessions.map((s) => s.student_id),
		...allFeedback.map((f) => f.student_id)
	];
	const fullPseudonymMap = pseudonymizeTesters(fullStudentIds);

	let studentIdFilter: string | null = null;
	if (args.tester) {
		const wanted = args.tester.padStart(3, '0');
		const wantedLabel = `Tester ${wanted}`;
		const match = [...fullPseudonymMap.entries()].find(([, label]) => label === wantedLabel);
		if (!match) {
			console.error(`No tester "${wantedLabel}" found in cohort "${args.cohort}".`);
			process.exit(1);
		}
		studentIdFilter = match[0];
	}

	const sessions_ = allSessions.filter(
		(s) =>
			(!studentIdFilter || s.student_id === studentIdFilter) &&
			(!args.caseId || s.case_id === args.caseId)
	);
	const sessionIdSet = new Set(sessions_.map((s) => s.id));
	const attempts_ = allAttempts.filter((a) => sessionIdSet.has(a.session_id));
	const attemptIdSet = new Set(attempts_.map((a) => a.id));
	const checkins_ = allCheckins.filter((c) => attemptIdSet.has(c.attempt_id));
	const feedback_ = allFeedback.filter((f) => !studentIdFilter || f.student_id === studentIdFilter);

	const git = readGitMetadata();
	const report = buildUserTestReport({
		cohort: args.cohort,
		generatedAt: new Date().toISOString(),
		commitSha: git.commitSha,
		dirty: git.dirty,
		sessions: sessions_,
		attempts: attempts_,
		checkins: checkins_,
		feedback: feedback_,
		pseudonymOverride: fullPseudonymMap
	});

	const text = formatText(report);
	const markdown = formatMarkdown(report);
	const json = toJson(report);

	if (args.dryRun) {
		console.log(text);
		console.log('\n(--dry-run: no files written)');
		return;
	}

	const dir = join(args.output, args.cohort);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, 'report.txt'), text);
	writeFileSync(join(dir, 'report.json'), json);
	writeFileSync(join(dir, 'report.md'), markdown);
	console.log(`Wrote report to ${dir}/report.{txt,json,md}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
