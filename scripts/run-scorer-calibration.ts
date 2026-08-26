#!/usr/bin/env node
/**
 * Scorer-calibration CLI (`chiron_calibration_feedback_and_automation_
 * prompts.txt` Prompt M4). One command, real scorer/domain/provider
 * code, a self-contained report — see `docs/SCORER_TESTING.md` for the
 * full usage guide. Run via `npm run test:calibration -- <flags>`.
 */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	allFixtures,
	injectionFixtures,
	pairedContrasts,
	type CalibrationFixture,
	type FixtureSubjectProfileId
} from '../tests/calibration/fixtures';
import {
	evaluateFixture,
	evaluateInjectionVariant,
	evaluatePairedContrast,
	type RunResult
} from '../tests/calibration/evaluateCalibration';
import { buildCalibrationProvider, type CalibrationProviderId } from './lib/providerFactory';
import { readGitMetadata } from './lib/gitMetadata';
import type { CalibrationReport } from './lib/reportTypes';
import { hasHardFailures, hasWarnings } from './lib/reportTypes';
import { formatText, formatMarkdown } from './lib/reportFormat';
import { compareReports, formatComparison } from './lib/compareReports';
import { SCORING_PROMPT_VERSION } from '../src/lib/providers/scoringPrompt';
import { scoreLesson, UnknownSubjectProfileError } from '../src/lib/domain/scoreLesson';
import { ScoringResultSchema, type ScoringResult } from '../src/lib/domain/schemas';

// Smoke mode's small, fixed subset (Prompt M4(o)) — the sharpest
// discriminating pairs plus one injection probe per profile, kept
// small deliberately: smoke mode exists to sanity-check a *deployment*,
// not to re-run the full calibration suite against it.
const SMOKE_FIXTURE_IDS = ['S-C1', 'S-C2', 'H-B1', 'H-B2'];

interface CliArgs {
	provider: CalibrationProviderId;
	runs: number;
	fixtureIds: string[] | null;
	profile: FixtureSubjectProfileId | null;
	output: string;
	format: 'text' | 'markdown' | 'json' | 'all';
	dryRun: boolean;
	strict: boolean;
	compare: string | null;
	baseUrl: string | null;
	concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
	const args: CliArgs = {
		provider: 'deepseek',
		runs: 3,
		fixtureIds: null,
		profile: null,
		output: 'artifacts/calibration',
		format: 'all',
		dryRun: false,
		strict: false,
		compare: null,
		baseUrl: null,
		concurrency: 1
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => argv[++i];
		switch (arg) {
			case '--provider':
				args.provider = next() as CalibrationProviderId;
				break;
			case '--runs':
				args.runs = Number(next());
				break;
			case '--fixture':
				args.fixtureIds = (args.fixtureIds ?? []).concat(next().split(','));
				break;
			case '--profile':
				args.profile = next() as FixtureSubjectProfileId;
				break;
			case '--output':
				args.output = next();
				break;
			case '--format':
				args.format = next() as CliArgs['format'];
				break;
			case '--dry-run':
				args.dryRun = true;
				break;
			case '--strict':
				args.strict = true;
				break;
			case '--compare':
				args.compare = next();
				break;
			case '--base-url':
				args.baseUrl = next();
				break;
			case '--concurrency':
				args.concurrency = Number(next());
				break;
			default:
				console.error(`Unknown argument: ${arg}`);
				process.exit(2);
		}
	}

	if (args.provider !== 'deepseek' && args.provider !== 'anthropic') {
		console.error(`--provider must be 'deepseek' or 'anthropic', got: ${args.provider}`);
		process.exit(2);
	}
	if (!Number.isInteger(args.runs) || args.runs < 1) {
		console.error(`--runs must be a positive integer, got: ${args.runs}`);
		process.exit(2);
	}
	if (!Number.isInteger(args.concurrency) || args.concurrency < 1) {
		console.error(`--concurrency must be a positive integer, got: ${args.concurrency}`);
		process.exit(2);
	}

	return args;
}

function selectFixtures(args: CliArgs): CalibrationFixture[] {
	if (args.baseUrl) {
		return allFixtures.filter((f) => SMOKE_FIXTURE_IDS.includes(f.id));
	}
	let selected = allFixtures;
	if (args.fixtureIds) selected = selected.filter((f) => args.fixtureIds!.includes(f.id));
	if (args.profile) selected = selected.filter((f) => f.subjectProfileId === args.profile);
	return selected;
}

/** Sequential by default (concurrency 1) — a small, bounded worker pool otherwise. Never more parallel than `concurrency` real provider calls in flight. */
async function runWithConcurrency<T>(
	items: T[],
	concurrency: number,
	work: (item: T, index: number) => Promise<void>
): Promise<void> {
	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const index = cursor++;
			await work(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function scoreDirect(
	fixture: { subjectProfileId: string; lessonText: string },
	providerInfo: ReturnType<typeof buildCalibrationProvider>
): Promise<ScoringResult> {
	return scoreLesson(providerInfo.provider, {
		lessonVersionId: randomUUID(),
		lessonText: fixture.lessonText,
		subjectProfileId: fixture.subjectProfileId
	});
}

async function scoreViaSmoke(
	baseUrl: string,
	fixture: { subjectProfileId: string; lessonText: string }
): Promise<ScoringResult> {
	const url = `${baseUrl.replace(/\/$/, '')}/api/lessons/score`;
	for (let attempt = 1; attempt <= 3; attempt++) {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				lessonText: fixture.lessonText,
				subjectProfileId: fixture.subjectProfileId,
				lessonVersionId: randomUUID()
			})
		});
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get('retry-after') ?? '5');
			console.error(`  429 rate limited, honoring Retry-After: ${retryAfter}s`);
			await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
			continue;
		}
		if (!response.ok) {
			throw new Error(`Smoke request failed: ${response.status} ${await response.text()}`);
		}
		return ScoringResultSchema.parse(await response.json());
	}
	throw new Error('Smoke request repeatedly rate-limited — giving up after 3 attempts');
}

async function main() {
	const args = parseArgs(process.argv.slice(2));
	const fixtures = selectFixtures(args);
	const runsPerFixture = args.baseUrl ? 1 : args.runs;
	const injectionFixturesSelected = args.baseUrl
		? injectionFixtures.slice(0, 1) // one injection probe per profile in smoke mode; see SMOKE_FIXTURE_IDS comment
		: args.profile
			? injectionFixtures.filter((f) => f.subjectProfileId === args.profile)
			: injectionFixtures;

	const fixtureCallCount = fixtures.length * runsPerFixture;
	const injectionCallCount = injectionFixturesSelected.reduce(
		(sum, f) => sum + 1 + f.variants.length,
		0
	);
	const totalCalls = fixtureCallCount + injectionCallCount;

	console.error(
		`${fixtures.length} fixtures x ${runsPerFixture} runs = ${fixtureCallCount} calls, ` +
			`+ ${injectionFixturesSelected.length} injection fixture(s) (base + variants) = ${injectionCallCount} calls. ` +
			`Total: ${totalCalls} live calls${args.baseUrl ? ` against ${args.baseUrl}` : ''}.`
	);

	if (args.dryRun) {
		console.error('--dry-run: fixtures validated, no calls made. Exiting.');
		process.exit(0);
	}

	const providerInfo = args.baseUrl ? null : buildCalibrationProvider(args.provider);
	const git = readGitMetadata();

	const fixtureRuns = new Map<string, RunResult[]>();
	const erroredFixtureIds: string[] = [];

	const fixtureRunPlan = fixtures.flatMap((fixture) =>
		Array.from({ length: runsPerFixture }, (_, i) => ({ fixture, runIndex: i }))
	);

	await runWithConcurrency(fixtureRunPlan, args.concurrency, async ({ fixture, runIndex }) => {
		console.error(`Scoring ${fixture.id} (run ${runIndex + 1}/${runsPerFixture})...`);
		try {
			const scoringResult = args.baseUrl
				? await scoreViaSmoke(args.baseUrl, fixture)
				: await scoreDirect(fixture, providerInfo!);
			const runResult: RunResult = {
				timestamp: new Date().toISOString(),
				fixtureId: fixture.id,
				fixtureTitle: fixture.title,
				subjectProfileId: fixture.subjectProfileId,
				provider: args.baseUrl ? `smoke:${args.baseUrl}` : args.provider,
				modelId: providerInfo?.modelId ?? 'unknown (smoke mode)',
				promptVersion: SCORING_PROMPT_VERSION,
				runIndex,
				scoringResult
			};
			const existing = fixtureRuns.get(fixture.id) ?? [];
			existing.push(runResult);
			fixtureRuns.set(fixture.id, existing);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.error(`  ERROR scoring ${fixture.id} run ${runIndex + 1}: ${message}`);
			if (!erroredFixtureIds.includes(fixture.id)) erroredFixtureIds.push(fixture.id);
		}
	});

	const fixtureEvaluations = fixtures
		.filter((f) => (fixtureRuns.get(f.id) ?? []).length > 0)
		.map((f) => evaluateFixture(f, fixtureRuns.get(f.id)!));

	const injectionEvaluations = [];
	for (const injFixture of injectionFixturesSelected) {
		console.error(`Scoring injection base: ${injFixture.id}...`);
		const baseFixtureInput = {
			subjectProfileId: injFixture.subjectProfileId,
			lessonText: injFixture.baseLessonText
		};
		let baseResult: ScoringResult;
		try {
			baseResult = args.baseUrl
				? await scoreViaSmoke(args.baseUrl, baseFixtureInput)
				: await scoreDirect(baseFixtureInput, providerInfo!);
		} catch (err) {
			console.error(`  ERROR scoring injection base ${injFixture.id}: ${err}`);
			continue;
		}
		const baseRun: RunResult = {
			timestamp: new Date().toISOString(),
			fixtureId: injFixture.id,
			fixtureTitle: injFixture.title,
			subjectProfileId: injFixture.subjectProfileId,
			provider: args.baseUrl ? `smoke:${args.baseUrl}` : args.provider,
			modelId: providerInfo?.modelId ?? 'unknown (smoke mode)',
			promptVersion: SCORING_PROMPT_VERSION,
			runIndex: 0,
			scoringResult: baseResult
		};

		const variants = args.baseUrl ? injFixture.variants.slice(0, 1) : injFixture.variants;
		for (const variant of variants) {
			console.error(`Scoring injection variant: ${injFixture.id}/${variant.name}...`);
			try {
				const variantFixtureInput = {
					subjectProfileId: injFixture.subjectProfileId,
					lessonText: variant.lessonText
				};
				const variantResult = args.baseUrl
					? await scoreViaSmoke(args.baseUrl, variantFixtureInput)
					: await scoreDirect(variantFixtureInput, providerInfo!);
				const variantRun: RunResult = {
					...baseRun,
					timestamp: new Date().toISOString(),
					scoringResult: variantResult
				};
				injectionEvaluations.push(
					evaluateInjectionVariant(injFixture, variant.name, baseRun, variantRun)
				);
			} catch (err) {
				console.error(`  ERROR scoring injection variant ${injFixture.id}/${variant.name}: ${err}`);
			}
		}
	}

	const pairedContrastEvaluations = pairedContrasts
		.map((contrast) => {
			const strongerEval = fixtureEvaluations.find((f) => f.fixtureId === contrast.strongerId);
			const weakerEval = fixtureEvaluations.find((f) => f.fixtureId === contrast.weakerId);
			if (!strongerEval || !weakerEval) return null;
			return evaluatePairedContrast(contrast, strongerEval, weakerEval);
		})
		.filter((e): e is NonNullable<typeof e> => e !== null);

	const report: CalibrationReport = {
		generatedAt: new Date().toISOString(),
		commitSha: git.commitSha,
		dirty: git.dirty,
		providerId: args.baseUrl ? `smoke:${args.baseUrl}` : args.provider,
		modelId: providerInfo?.modelId ?? 'unknown (smoke mode)',
		promptVersion: SCORING_PROMPT_VERSION,
		runsPerFixture,
		mode: args.baseUrl ? 'smoke' : 'direct',
		callCount: totalCalls,
		fixtureEvaluations,
		injectionEvaluations,
		pairedContrastEvaluations,
		erroredFixtureIds
	};

	mkdirSync(args.output, { recursive: true });
	const timestamp = report.generatedAt.replace(/[:.]/g, '-');
	const basePath = join(args.output, `${timestamp}-calibration`);

	if (args.format === 'json' || args.format === 'all') {
		writeFileSync(`${basePath}.json`, JSON.stringify(report, null, 2));
		writeFileSync(join(args.output, 'latest.json'), JSON.stringify(report, null, 2));
	}
	if (args.format === 'text' || args.format === 'all') {
		writeFileSync(`${basePath}.txt`, formatText(report));
		writeFileSync(join(args.output, 'latest.txt'), formatText(report));
	}
	if (args.format === 'markdown' || args.format === 'all') {
		writeFileSync(`${basePath}.md`, formatMarkdown(report));
	}

	console.error(`Report written to ${basePath}.*`);

	if (args.compare) {
		const previous: CalibrationReport = JSON.parse(readFileSync(args.compare, 'utf8'));
		console.error(formatComparison(compareReports(previous, report)));
	}

	const failed = hasHardFailures(report);
	const warned = hasWarnings(report);
	if (failed) process.exit(1);
	if (warned && args.strict) process.exit(1);
	process.exit(0);
}

main().catch((err) => {
	if (err instanceof UnknownSubjectProfileError) {
		console.error(`Fixture config error: ${err.message}`);
		process.exit(2);
	}
	console.error('Calibration runner crashed:', err);
	process.exit(2);
});
