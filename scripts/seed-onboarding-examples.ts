#!/usr/bin/env node
/**
 * Onboarding-example seed script (prompts-onboarding-examples.txt Prompt
 * E3). Seeds the three real, openly-licensed example lessons — see
 * docs/CONTENT_LICENSING.md for the sourcing/verification process this
 * follows — as `origin = 'system_example'` rows (schema: Prompt E2,
 * migration 0017), scores each through the real scoring pipeline exactly
 * once (live, not mocked — reusing scoreLesson()'s content-hash cache so
 * a rerun doesn't re-call the LLM), and prints a summary.
 *
 * Idempotent: re-running skips any example whose attributionUrl already
 * has a system_example lesson row, rather than creating a duplicate.
 *
 * Constructs its own Supabase client from `process.env` directly, and
 * builds its own ScoringProvider via scripts/lib/providerFactory.ts —
 * same reasoning as scripts/export-user-test.ts and
 * scripts/run-scorer-calibration.ts: `$lib/server/env` and the real
 * DeepSeekScoringProvider/AnthropicScoringProvider classes import
 * SvelteKit's `$env/dynamic/private`, which only resolves inside Vite,
 * not a plain `node --import tsx` script.
 *
 * Run via: node --env-file=.env --import tsx scripts/seed-onboarding-examples.ts [--dry-run] [--provider deepseek|anthropic]
 *
 * Writes directly to the `lessons`/`lesson_versions`/`scores`/
 * `skill_coverage_entries`/`suggestions` tables via the service-role
 * client — never through the `save_lesson` RPC, which hardcodes
 * `owner_id = auth.uid()` and has no attribution parameters. This is the
 * one legitimate write path for a system-example row (migration 0017's
 * own comment); no authenticated-role RLS policy grants this to anyone
 * else.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { normalizeStructuredLesson } from '../src/lib/domain/structuredLessonInput';
import { scoreLesson } from '../src/lib/domain/scoreLesson';
import { ScoringResultSchema, type ScoringResult } from '../src/lib/domain/schemas';
import { buildCalibrationProvider, type CalibrationProviderId } from './lib/providerFactory';

interface OnboardingExample {
	/** Used as the idempotency key — one system-example lesson per attributionUrl. */
	attributionUrl: string;
	title: string;
	subjectProfileId: 'science-lab' | 'history-essay' | 'journalism';
	fields: {
		objectives: string;
		teacherScript: string;
		studentActivities: string;
		assessment: string;
	};
	attributionName: string;
	license: 'CC-BY-4.0' | 'Public-Domain-US-Govt';
	licenseNote: string | null;
}

// Content adapted (not copy-pasted) from each source's own public page,
// per docs/CONTENT_LICENSING.md's process. See that doc and this
// script's own commit for the verification method used for each source
// at seed time — the OpenSciEd page was fetched and confirmed directly;
// the two Library of Congress sources were blocked by Cloudflare
// bot-protection at fetch time for every access method available (direct
// fetch and real-browser automation) and are instead corroborated via
// LOC's own published copyright policy plus independent search-indexed
// descriptions of both pages' content, not a direct live-page read — a
// documented judgment call, not a default.
const EXAMPLES: OnboardingExample[] = [
	{
		attributionUrl: 'https://openscied.org/instructional-materials/6-2-thermal-energy/',
		title: 'Thermal Energy: Designing a Better Cup (OpenSciEd MS 6.2)',
		subjectProfileId: 'science-lab',
		attributionName: 'OpenSciEd',
		license: 'CC-BY-4.0',
		licenseNote:
			"Adapted from the public unit-overview page for OpenSciEd Middle School Unit 6.2, not the full gated unit (which requires a free OpenSciEd account at openscied.org). OpenSciEd Middle School materials are CC BY 4.0 — note Elementary and High School OpenSciEd materials use a different, non-commercial license. OpenSciEd's own page credits this unit as adapted from an earlier unit co-developed by San Francisco Unified School District and Stanford SCALE (2017–2018), used with permission by OpenSciEd; OpenSciEd's site-wide CC BY 4.0 licensing statement for Middle School materials governs this unit as published.",
		fields: {
			objectives:
				'Students will investigate how containers keep their contents from warming up or cooling down, and use that evidence to design an insulated cup system that performs comparably to a commercial double-walled cup.',
			teacherScript:
				'Driving question: "How can containers keep stuff from warming up or cooling down?" Show students a commercial double-walled plastic cup next to a standard single-wall cup. Ask: what do you already know about these two cups that might explain a difference in how long a cold drink stays cold in each one? What data would actually show us whether one design works better than the other, and by how much?',
			studentActivities:
				"Students first collect real comparative data: they measure how a beverage's temperature changes over time in a standard cup versus a commercial double-walled cup. Students then complete an engineering design challenge: design, build, test, and modify their own cup system across two design cycles, working within a set of design criteria and constraints, aiming to match the performance of the commercial insulated cup. After each test, students revise their design based on what their own data showed.",
			assessment:
				"Students submit their design-cycle data (temperature over time for each version of their cup) alongside a written explanation of what that data shows about their design's insulating mechanism, what changed between design cycle 1 and design cycle 2, and why."
		}
	},
	{
		attributionUrl:
			'https://www.loc.gov/classroom-materials/primary-sources-and-personal-artifacts/',
		title: 'Primary Sources and Personal Artifacts (Library of Congress)',
		subjectProfileId: 'history-essay',
		attributionName: 'Library of Congress',
		license: 'Public-Domain-US-Govt',
		licenseNote:
			'Adapted from the Library of Congress\'s "Primary Sources and Personal Artifacts" classroom-materials page. Library of Congress staff-authored classroom material is treated as free of known copyright restrictions, as US federal government work product.',
		fields: {
			objectives:
				"Students will explain what a primary source is and how it differs from a secondary account, practice systematic observation and analysis using the Library of Congress's Primary Source Analysis Tool (Observe, Reflect, Question, Further Investigation), and explain why constructing context matters given that primary sources are often incomplete on their own.",
			teacherScript:
				'Key question, before any context is given: "What can we determine just from looking at this object, before its owner tells us anything about it?" Ask one student to bring in a personal artifact meaningful to their own life without explaining it to the class yet. Guide the class through the Primary Source Analysis Tool\'s four steps on that artifact — Observe, Reflect, Question, Further Investigation — before the owner reveals its real story.',
			studentActivities:
				"Students examine a classmate's personal artifact using the four-step Primary Source Analysis Tool, recording their observations, reflections, and questions. The artifact's owner then reveals the object's real context and story, and students compare their own inferences against it, noting what they got right, what they missed, and what they couldn't have known without that context. Students then apply the same four-step tool independently to an actual historical primary source relevant to the current unit.",
			assessment:
				'Students submit a written primary-source analysis of a new, previously unseen primary source using all four steps of the tool, explicitly separating what is directly observable from what required inference, and naming what "further investigation" would still be needed to construct its fuller context.'
		}
	},
	{
		attributionUrl:
			'https://blogs.loc.gov/teachers/2015/10/read-all-about-it-a-new-teachers-guide-to-analyzing-newspapers/',
		title: 'Yellow Journalism and the Sinking of the USS Maine (Library of Congress)',
		subjectProfileId: 'journalism',
		attributionName: 'Library of Congress',
		license: 'Public-Domain-US-Govt',
		licenseNote:
			'Adapted from the Library of Congress\'s "Read All About It: A New Teacher\'s Guide to Analyzing Newspapers" and its "Yellow Journalism" Chronicling America research guide (guides.loc.gov/chronicling-america-yellow-journalism), both public domain as US federal government work product. The specific 1898 New York Journal / New York World front page(s) students examine are themselves independently public domain by age (published well before 1929) — a separate but consistent basis from the teacher\'s guide\'s own public-domain status.',
		fields: {
			objectives:
				'Students will use the Library of Congress\'s newspaper-analysis prompts to examine a historic 1898 front page reporting the sinking of the USS Maine, and identify how competition between rival papers for readers ("yellow journalism") shaped what was reported and how confidently it was reported.',
			teacherScript:
				'Anchor: on the night of February 15, 1898, the USS Maine exploded in Havana harbor; the cause was not established at the time. Key questions, applied to the front page under examination: What does the headline emphasize, and in what language of the time? What visual elements — photographs, drawings, cartoons — appear, and what effect do they create? What related reports run alongside the main story? What do the date and surrounding context tell us about how quickly, and how confidently, the paper reported a cause for the explosion?',
			studentActivities:
				'In small groups, students examine a digitized 1898 New York Journal or New York World front page covering the Maine\'s sinking (from the Library of Congress\'s Chronicling America collection), applying the four newspaper-analysis prompts above. Groups then discuss what in the coverage goes beyond what could have actually been confirmed within days of the explosion, and how competition between the Journal and World for readers may have shaped that gap — a real historical instance of "yellow journalism."',
			assessment:
				'Students write a short response identifying one specific claim or framing choice on the front page that goes beyond what could be verified at the time, and explaining what evidence would have been needed to actually substantiate it.'
		}
	}
];

function getSupabase(): SupabaseClient {
	const url = process.env.PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) {
		console.error(
			'Missing PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Run via: node --env-file=.env --import tsx scripts/seed-onboarding-examples.ts'
		);
		process.exit(1);
	}
	return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Minimal DataStore-cache surface, built on the plain service-role client — same table/shape as SupabaseDataStore, reimplemented here for the same reason getSupabase() exists (no $lib/server/env in a plain tsx script). */
function buildScoringCache(supabase: SupabaseClient) {
	return {
		async getCachedScore(contentHash: string): Promise<ScoringResult | null> {
			try {
				const { data, error } = await supabase
					.from('scoring_cache')
					.select('scoring_result')
					.eq('content_hash', contentHash)
					.maybeSingle();
				if (error || !data) return null;
				const parsed = ScoringResultSchema.safeParse(data.scoring_result);
				return parsed.success ? parsed.data : null;
			} catch {
				return null;
			}
		},
		async saveCachedScore(contentHash: string, result: ScoringResult): Promise<void> {
			try {
				await supabase
					.from('scoring_cache')
					.upsert(
						{ content_hash: contentHash, scoring_result: result },
						{ onConflict: 'content_hash' }
					);
			} catch {
				// best-effort, same as SupabaseDataStore
			}
		}
	};
}

function parseArgs(argv: string[]): { dryRun: boolean; providerId: CalibrationProviderId } {
	let dryRun = false;
	let providerId: CalibrationProviderId = 'deepseek'; // ADR-008: DeepSeek is the active provider.
	for (const arg of argv) {
		if (arg === '--dry-run') dryRun = true;
		else if (arg === '--provider=deepseek') providerId = 'deepseek';
		else if (arg === '--provider=anthropic') providerId = 'anthropic';
		else {
			console.error(`Unknown argument: ${arg}`);
			process.exit(1);
		}
	}
	return { dryRun, providerId };
}

async function main() {
	const { dryRun, providerId } = parseArgs(process.argv.slice(2));
	const supabase = getSupabase();
	const { provider, modelId } = buildCalibrationProvider(providerId);
	const cache = buildScoringCache(supabase);

	for (const example of EXAMPLES) {
		const { data: existing, error: existingError } = await supabase
			.from('lessons')
			.select('id')
			.eq('origin', 'system_example')
			.eq('attribution_url', example.attributionUrl)
			.maybeSingle();
		if (existingError) {
			console.error(
				`Failed to check for existing example "${example.title}":`,
				existingError.message
			);
			process.exit(1);
		}
		if (existing) {
			console.log(`Skipping "${example.title}" — already seeded (lesson ${existing.id}).`);
			continue;
		}

		const lessonText = normalizeStructuredLesson(example.fields);

		if (dryRun) {
			console.log(`[dry-run] Would seed "${example.title}" (${example.subjectProfileId}):`);
			console.log(lessonText);
			console.log('---');
			continue;
		}

		const lessonVersionId = randomUUID();

		const { data: lesson, error: lessonError } = await supabase
			.from('lessons')
			.insert({
				owner_id: null,
				org_id: null,
				title: example.title,
				subject_profile_id: example.subjectProfileId,
				visibility: 'public-template',
				origin: 'system_example',
				attribution_name: example.attributionName,
				attribution_url: example.attributionUrl,
				license: example.license,
				license_note: example.licenseNote
			})
			.select('id')
			.single();
		if (lessonError || !lesson) {
			console.error(`Failed to insert lesson "${example.title}":`, lessonError?.message);
			process.exit(1);
		}

		const { error: versionError } = await supabase.from('lesson_versions').insert({
			id: lessonVersionId,
			lesson_id: lesson.id,
			version_number: 1,
			source: 'paste',
			raw_text: lessonText
		});
		if (versionError) {
			console.error(
				`Failed to insert lesson_version for "${example.title}":`,
				versionError.message
			);
			process.exit(1);
		}

		console.log(`Scoring "${example.title}" with ${providerId} (${modelId})...`);
		const result = await scoreLesson(
			provider,
			{ lessonVersionId, lessonText, subjectProfileId: example.subjectProfileId },
			cache
		);

		const { error: scoreError } = await supabase.from('scores').insert({
			id: result.score.id,
			lesson_version_id: lessonVersionId,
			dialogue_score: result.score.dialogueScore,
			dialogue_justification: result.score.dialogueJustification,
			authenticity_score: result.score.authenticityScore,
			authenticity_justification: result.score.authenticityJustification,
			mentoring_score: result.score.mentoringScore,
			mentoring_justification: result.score.mentoringJustification,
			model_id: result.score.modelId,
			prompt_version: result.score.promptVersion
		});
		if (scoreError) {
			console.error(`Failed to insert score for "${example.title}":`, scoreError.message);
			process.exit(1);
		}

		const { error: skillError } = await supabase.from('skill_coverage_entries').insert(
			result.skillCoverage.map((entry) => ({
				id: entry.id,
				score_id: entry.scoreId,
				skill: entry.skill,
				covered: entry.covered,
				confidence: entry.confidence,
				justification: entry.justification
			}))
		);
		if (skillError) {
			console.error(`Failed to insert skill coverage for "${example.title}":`, skillError.message);
			process.exit(1);
		}

		if (result.suggestions.length > 0) {
			const { error: suggestionError } = await supabase.from('suggestions').insert(
				result.suggestions.map((s) => ({
					id: s.id,
					score_id: s.scoreId,
					pillar: s.pillar,
					text: s.text
				}))
			);
			if (suggestionError) {
				console.error(
					`Failed to insert suggestions for "${example.title}":`,
					suggestionError.message
				);
				process.exit(1);
			}
		}

		const { error: updateError } = await supabase
			.from('lessons')
			.update({ current_version_id: lessonVersionId })
			.eq('id', lesson.id);
		if (updateError) {
			console.error(
				`Failed to set current_version_id for "${example.title}":`,
				updateError.message
			);
			process.exit(1);
		}

		console.log(
			`Seeded "${example.title}" — lesson ${lesson.id}, dialogue=${result.score.dialogueScore} authenticity=${result.score.authenticityScore} mentoring=${result.score.mentoringScore}`
		);
	}

	console.log(dryRun ? '\n(--dry-run: no rows written)' : '\nDone.');
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
