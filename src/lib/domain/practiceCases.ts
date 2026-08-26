/**
 * The three canonical, hand-authored Phase 2A cases (`prompts.txt`
 * Prompt 21). Static TypeScript data, not a database table — ADR-019 —
 * mirroring `subjectProfiles.ts`'s pattern. Each proves a distinct part
 * of the engine (see the comment on each case below); collectively they
 * exercise every mechanic `docs/PHASE2.md` designed: multiple
 * creditable judgment bands, genuine uncertainty, the update-criterion
 * commitment, and a case whose evidence actually settles the claim.
 *
 * No LLM was used to generate these — written directly, per Prompt 21's
 * own instruction, the same discipline Phase 1's few-shot scoring
 * examples already follow.
 *
 * Do not add a fourth case here yet — Prompt 21 is explicit: exactly
 * three, for now.
 */
import { randomUUID } from 'node:crypto';
import { PracticeCaseSchema, toPublicPracticeCase, type PracticeCase } from './practiceSchemas';

const id = () => randomUUID();

/**
 * Case 1 — Causal inference. Proves: multiple creditable judgment
 * bands, genuine uncertainty as a real (not degenerate) outcome, and
 * the COMMIT_UPDATE_CRITERION mechanic. Deliberately has NO
 * no-reasoning-required credit path — the "obvious" before/after
 * reading is the wrong pull here, and the case rewards seeing past it.
 */
// Named up front (rather than inlined via id()) so updateCriteria's
// relevantEvidenceItemIds below can reference the specific evidence
// item that fulfills this case's update-criterion promise (Prompt 26).
const causalBeforeAfterId = id();
const causalBypassId = id();
const causalMapleAvenueId = id();
const causalFluctuationId = id();

const causalInference: PracticeCase = {
	id: 'causal-inference-1',
	title: 'Did the speed cameras actually help?',
	subjectProfileId: 'science-lab',
	skillTags: ['inference', 'evaluation', 'analysis'],
	dispositionTags: ['approach_to_inquiry', 'approach_to_problem'],
	difficulty: 'core',
	responseMode: 'evidence_support_scale',
	scenario:
		"Ridgefield's city council announces that traffic accidents on Elm Street fell 18% in the " +
		'six months after new speed cameras were installed there, and credits the cameras for the drop.',
	claim: 'The speed cameras caused the drop in traffic accidents on Elm Street.',
	evidencePool: [
		{
			id: causalBeforeAfterId,
			revealOrder: 0,
			stance: 'supports_claim',
			text: "City records: Elm Street accidents fell from 42 in the six months before camera installation to 34 in the six months after — an 18% drop, matching the council's figure."
		},
		{
			id: causalBypassId,
			revealOrder: 1,
			stance: 'supports_counter_claim',
			text: "The same six-month period also saw a new bypass route open two miles away. Traffic-count data shows Elm Street's overall traffic volume fell roughly 12% after the bypass opened."
		},
		{
			id: causalMapleAvenueId,
			revealOrder: 2,
			stance: 'supports_counter_claim',
			text: 'Maple Avenue, a comparable street in the neighboring town with no camera installed and no new bypass nearby, saw a 9% drop in accidents over the same six months — consistent with a broader regional downward trend in accidents that year.'
		},
		{
			id: causalFluctuationId,
			revealOrder: 3,
			stance: 'ambiguous',
			text: "City records show Elm Street's accident counts have fluctuated between 30 and 48 per six-month period over the last five years, with no single clear cause identified for past swings of similar size."
		}
	],
	answerSpec: {
		targetRange: { min: 'somewhat_unsupported', max: 'uncertain' },
		// Two adjacent bands — narrow enough that "landed in range" is a
		// meaningful proxy for "this judgment was defensible" (docs/CALIBRATION.md).
		calibrationEligible: true,
		reasoningRubric: {
			finalJudgmentRules: [
				{
					id: id(),
					acceptedJudgments: ['uncertain'],
					requiredSignals: ['identifies_confounder'],
					minimumRequired: 1,
					explanation:
						"The bypass opening is a real alternative explanation for at least part of the drop, and the evidence doesn't let us cleanly separate its effect from the cameras' — genuine uncertainty is the well-reasoned position here, not a failure to commit."
				},
				{
					id: id(),
					acceptedJudgments: ['somewhat_unsupported'],
					requiredSignals: ['distinguishes_correlation_from_causation'],
					minimumRequired: 1,
					explanation:
						"Maple Avenue's similar drop, with no camera and no bypass, shows the before/after association on Elm Street alone doesn't establish that the cameras specifically caused anything — treating this as weak evidence for the camera-specific claim is well-reasoned."
				}
			],
			partialCreditSignals: [
				'identifies_missing_evidence',
				'acknowledges_uncertainty',
				'generates_alternative_hypothesis',
				// This case's own update-criterion signal (below) — listed here
				// too so a genuinely relevant stated criterion earns a
				// ScoringEvent through the normal case-rubric path, on top of
				// the mechanic-level credit updateCriterionConsistency.ts
				// (Prompt 26) grants independently for the cross-case
				// states/relevant/follows signals.
				'requests_comparison_street'
			]
		},
		rationale:
			'The before/after figure alone would suggest strong support, but a real confounder (the bypass) and a comparison street showing a similar drop with no camera both undercut confident causal attribution. A student who reasons carefully should land on uncertain or somewhat_unsupported, not on strongly_supported — the "obvious" reading here is the one to be suspicious of.'
	},
	usesUpdateCriterion: true,
	updateCriteria: [
		{
			id: id(),
			signal: 'requests_comparison_street',
			description:
				'Recognises, before it is revealed, that a comparable street without the intervention would materially change the inference — exactly what the Maple Avenue evidence provides.',
			relevantEvidenceItemIds: [causalMapleAvenueId]
		}
	],
	provenance: {
		isSynthetic: true,
		note: 'Entirely fictional town, street names, and figures, written for this case. Not based on any specific real policy, city, or study.'
	},
	educatorNotes:
		'Watch for students who anchor on the 18% headline figure and never revisit it once the bypass and comparison-street evidence lands — that\'s the premature-closure failure mode this case is built to surface. A student who names "I\'d want a similar street without cameras" during COMMIT_UPDATE_CRITERION and then actually uses the Maple Avenue evidence that way is the ideal path through this case.',
	teachingExplanation:
		'Before/after data on its own can\'t establish causation when a plausible confounder exists and no comparison group was checked. Here, both showed up: the bypass opening is a real alternative cause, and Maple Avenue — no camera, no bypass — saw a similar drop anyway. That doesn\'t prove the cameras did nothing, but it does mean the evidence shown can\'t confidently credit them for the 18% figure. Landing on "uncertain" or "somewhat unsupported" wasn\'t indecision — it was the conclusion the evidence actually supports.',
	visibility: 'public-template',
	createdBy: 'system'
};

/**
 * Case 2 — Relative vs. absolute risk. Proves: a case whose target
 * band sits in the *middle* of the scale (the underlying effect is
 * real, just smaller and more circumstantial than the headline
 * implies) — neither "the claim is fabricated" nor "the claim is
 * fully supported as stated" is the well-reasoned answer.
 */
const relativeRisk: PracticeCase = {
	id: 'relative-risk-1',
	title: 'Does the supplement really cut your risk in half?',
	subjectProfileId: 'science-lab',
	skillTags: ['evaluation', 'interpretation', 'inference'],
	dispositionTags: ['approach_to_inquiry'],
	difficulty: 'core',
	responseMode: 'evidence_support_scale',
	scenario:
		'A wellness newsletter advertises a new supplement: "Clinical trial proves it cuts your risk ' +
		'of catching a cold in half!"',
	claim: 'Taking the supplement cuts your risk of catching a cold in half.',
	evidencePool: [
		{
			id: id(),
			revealOrder: 0,
			stance: 'supports_claim',
			text: 'The cited trial: participants taking the supplement caught a cold 2% of the time during the study period, versus 4% for the placebo group — a 50% relative reduction, matching the advertised figure exactly.'
		},
		{
			id: id(),
			revealOrder: 1,
			stance: 'ambiguous',
			text: 'The trial enrolled 500 people per group, over a single 8-week period that fell during a historically low-transmission season for colds.'
		},
		{
			id: id(),
			revealOrder: 2,
			stance: 'supports_counter_claim',
			text: 'In absolute terms: 10 of 500 supplement-group participants caught a cold, versus 20 of 500 in the placebo group — an absolute risk reduction of 2 percentage points (4% down to 2%).'
		},
		{
			id: id(),
			revealOrder: 3,
			stance: 'ambiguous',
			text: 'The trial writeup notes that in a comparable high-transmission-season population, baseline cold rates typically run 15-20%, not 4% — meaning the same relative reduction could correspond to a much larger absolute effect in a different season. No high-transmission-season data was collected.'
		}
	],
	answerSpec: {
		targetRange: { min: 'somewhat_unsupported', max: 'somewhat_supported' },
		// Three bands, deliberately (this case's whole point is that the
		// defensible range sits in the genuine middle of the scale — see
		// the rationale below) — too wide for "landed in range" to be a
		// meaningful calibration signal (docs/CALIBRATION.md).
		calibrationEligible: false,
		reasoningRubric: {
			finalJudgmentRules: [
				{
					id: id(),
					acceptedJudgments: ['somewhat_supported'],
					requiredSignals: ['identifies_denominator_problem'],
					minimumRequired: 1,
					explanation:
						'The relative-reduction figure is technically accurate, but naming that the absolute effect is only 2 percentage points — not the large personal benefit "cuts your risk in half" implies — is exactly the distinction that makes qualified support for the claim reasonable.'
				},
				{
					id: id(),
					acceptedJudgments: ['somewhat_unsupported', 'uncertain'],
					requiredSignals: ['identifies_base_rate_issue'],
					minimumRequired: 1,
					explanation:
						"Flagging that the trial's low-transmission-season baseline (4%) may not generalize, and that 10 vs. 20 events in 500-person groups is a thin evidentiary base, is well-founded caution about how much weight this single trial can bear."
				}
			],
			partialCreditSignals: ['acknowledges_uncertainty', 'updates_for_relevant_evidence']
		},
		rationale:
			'The relative-risk figure in the ad is not fabricated — it\'s a real, directly-cited result. But "cuts your risk in half" invites the reader to imagine a large personal benefit, when the absolute effect (2 percentage points, in a low-transmission season, from one modest trial) is much thinner than that framing suggests. Neither dismissing the claim outright nor accepting it at face value is well-reasoned; the defensible range is genuinely in the middle.'
	},
	usesUpdateCriterion: false,
	provenance: {
		isSynthetic: true,
		note: 'Fictional supplement, trial, and figures, written for this case. Not based on any specific real product, study, or company.'
	},
	educatorNotes:
		'The intended trap is treating the relative-risk figure as either fully validating or fully debunking the ad. Strong students should name both: the number is real, and the framing is misleading about practical magnitude. Watch for students who only find one half of that.',
	teachingExplanation:
		'The ad\'s "50%" is a real result — 2% versus 4% is exactly a 50% relative reduction. But relative reduction is not the same as personal benefit: in absolute terms it\'s 2 people fewer per 100 who\'d catch a cold, from one 8-week trial run during a mild cold season. That\'s real evidence for a real, if modest, effect — not evidence for "cuts your risk in half" the way most readers would understand it. The well-reasoned position holds both of those at once, rather than collapsing to "true" or "fake."',
	visibility: 'public-template',
	createdBy: 'system'
};

/**
 * Case 3 — Source provenance. Proves: a case where the evidence, once
 * revealed, actually does clearly settle the claim (in the negative
 * direction) — the engine handling a confidently-resolved case, not
 * just fuzzy ones.
 */
const sourceProvenance: PracticeCase = {
	id: 'source-provenance-1',
	title: 'Is the glowing blue fish really confirmed?',
	subjectProfileId: 'history-essay',
	skillTags: ['evaluation', 'analysis'],
	dispositionTags: ['approach_to_inquiry', 'approach_to_problem'],
	difficulty: 'intro',
	responseMode: 'evidence_support_scale',
	scenario:
		'A story claiming "a new species of deep-sea fish that glows bright blue has been discovered" ' +
		'is spreading fast — dozens of news outlets and hundreds of social posts have covered it this week.',
	claim:
		'Multiple independent sources have confirmed the discovery of a new glowing blue deep-sea fish species.',
	evidencePool: [
		{
			id: id(),
			revealOrder: 0,
			stance: 'supports_claim',
			text: 'At least 40 news outlets and hundreds of social media accounts have posted about the discovery in the past three days.'
		},
		{
			id: id(),
			revealOrder: 1,
			stance: 'supports_counter_claim',
			text: 'Checking the outlets\' articles: 38 of the 40 use near-identical wording and the same three photos, and each credits "a marine biology press release" without naming a research institution.'
		},
		{
			id: id(),
			revealOrder: 2,
			stance: 'supports_counter_claim',
			text: "The original press release traces to a single aquarium's marketing department — not a peer-reviewed journal or a named research institution."
		},
		{
			id: id(),
			revealOrder: 3,
			stance: 'supports_counter_claim',
			text: 'The press release states the fish was observed once, on a single submersible dive, and has not been formally described or published in any scientific venue.'
		}
	],
	answerSpec: {
		targetRange: { min: 'strongly_unsupported', max: 'somewhat_unsupported' },
		// Two adjacent bands, and this case resolves fairly clearly once
		// the evidence is in (unlike Case 1) — a good, determinate
		// calibration signal (docs/CALIBRATION.md).
		calibrationEligible: true,
		reasoningRubric: {
			finalJudgmentRules: [
				{
					id: id(),
					acceptedJudgments: ['strongly_unsupported', 'somewhat_unsupported'],
					requiredSignals: ['identifies_source_problem'],
					minimumRequired: 1,
					explanation:
						'Recognising that the "40 outlets" all trace back to one uncredentialed press release — not independent scientific confirmation — is exactly the distinction between wide repetition and actual corroboration this case is testing.'
				},
				{
					id: id(),
					acceptedJudgments: ['strongly_unsupported', 'somewhat_unsupported'],
					requiredSignals: ['recognises_limit_of_available_evidence'],
					minimumRequired: 1,
					explanation:
						'Naming that the claim rests on a single unreviewed observation with no peer-reviewed confirmation — not that a fish definitely doesn\'t exist, but that "confirmed by multiple independent sources" specifically is not what the evidence shows.'
				}
			],
			partialCreditSignals: ['identifies_missing_evidence', 'acknowledges_uncertainty']
		},
		rationale:
			'The claim is specifically about independent confirmation, and the evidence directly undercuts that: wide repetition across outlets turns out to be one unreviewed press release repeated, not multiple sources corroborating each other. This case is meant to resolve fairly clearly once the evidence is in, unlike Case 1 — the engine needs to handle both shapes.'
	},
	usesUpdateCriterion: false,
	provenance: {
		isSynthetic: true,
		note: 'Fictional fish discovery, outlets, and press release, written for this case. Deliberately not describing any real reported discovery, so this case content is never itself mistaken for real reporting if seen out of context — a live concern for a case that is specifically about media-source verification.'
	},
	educatorNotes:
		'The "40 outlets" figure is designed to feel like strong social proof at first read. The point of the case is that number-of-outlets and number-of-independent-sources are different quantities, and the evidence collapses them into one once traced back.',
	teachingExplanation:
		"It looked like broad confirmation — 40 outlets, hundreds of posts. But nearly all of them turned out to be repeating one press release from an aquarium's marketing team, not independent scientific sources, and the underlying observation was a single unreviewed dive. Repetition across many outlets is not the same as corroboration by many sources. That doesn't mean the fish doesn't exist — it means the specific claim, \"multiple independent sources have confirmed\" it, isn't supported by what's actually here.",
	visibility: 'public-template',
	createdBy: 'system'
};

export const practiceCases: readonly PracticeCase[] = [
	causalInference,
	relativeRisk,
	sourceProvenance
].map((c) => PracticeCaseSchema.parse(c));

export function getPracticeCase(caseId: string): PracticeCase | undefined {
	return practiceCases.find((c) => c.id === caseId);
}

export function listPracticeCasesPublic() {
	return practiceCases.map((c) => toPublicPracticeCase(c));
}
