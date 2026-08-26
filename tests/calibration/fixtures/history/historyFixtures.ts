/**
 * History Essay calibration fixtures (`chiron_calibration_feedback_and_automation_prompts.txt`
 * Prompt M2). Hand-written, not LLM-generated — same discipline
 * `src/lib/domain/practiceCases.ts` holds itself to. Invented primary-
 * source excerpts are deliberately written in an illustrative,
 * clearly-fictional voice rather than presented as real historical
 * documents.
 */
import { CalibrationFixtureSchema, type CalibrationFixture } from '../calibrationFixture';

const fixtures: CalibrationFixture[] = [
	{
		id: 'H-A1',
		title: 'Roman Republic — strong lesson',
		subjectProfileId: 'history-essay',
		rationale:
			'Positive/regression-guard fixture — a genuinely excellent lesson (structured debate, individualized coaching, primary-source-driven interpretation) should stay reliably strong across the whole rubric.',
		lessonText: `Unit: Why Did the Roman Republic Fall?

Students work in groups of four to weigh competing explanations for the collapse of the Roman Republic using five short source excerpts distributed at the start of class:

1. A fragment attributed to a senator's speech to the assembly, warning that "the generals now command the loyalty the Senate once commanded."
2. A later historian's assessment (invented, illustrative) arguing that land reform failures, not any one man's ambition, drove ordinary citizens into the armies of whichever general paid best.
3. A description of an inscription on a commemorative coin honoring a general's military victories rather than any civic office.
4. A private letter fragment (invented) from a landowner complaining that veteran soldiers were being settled on his neighbor's confiscated estate.
5. A modern historian's counter-argument (invented) that the Republic's institutions had already stopped functioning years before any single crisis.

Each group must decide which explanation the evidence best supports, note where sources actually conflict, and prepare to defend their position. The second half of the lesson is a structured whole-class debate: each group presents its strongest reading, other groups must challenge it with a specific source, and the group must respond using the evidence, not just repeat their claim.

Throughout, the teacher circulates between groups, listening to each group's draft argument before the debate and giving specific, individual feedback — pointing out where a group is asserting something the sources don't actually support, or where two sources are being read as agreeing when they don't. At the end, each student writes a short paragraph stating their own conclusion, which source most changed their thinking, and why.`,
		pillarBands: [
			{ pillar: 'dialogue', min: 2, max: 3 },
			{ pillar: 'authenticity', min: 2, max: 3 },
			{ pillar: 'mentoring', min: 2, max: 3 }
		],
		skillExpectations: [
			{ skill: 'interpretation', covered: true },
			{ skill: 'analysis', covered: true },
			{ skill: 'evaluation', covered: true },
			{ skill: 'inference', covered: true },
			{ skill: 'explanation', covered: true },
			{ skill: 'self_regulation', covered: true }
		],
		hardInvariants: []
	},
	{
		id: 'H-A2',
		title: 'Appeasement — strong terse lesson',
		subjectProfileId: 'history-essay',
		rationale:
			'Tests that terse writing, a small curated source set, and staged (sequential, not all-at-once) evidence reveal are not penalised by verbosity bias, a curated-source penalty, or a staged-evidence penalty — an equally strong lesson to H-A1, deliberately written in a compressed style.',
		lessonText: `Unit: Was Appeasement a Reasonable Policy in 1938?

Source 1 only, distributed first: excerpt of a speech (invented) by a British minister defending negotiation with Germany as the only way to avoid a second war so soon after the first.

Socratic round 1: Was this a defensible position given what was known in 1938? Cold-call format, teacher pushes each answer with "what in the source makes you say that?"

Source 2 revealed only after round 1: a response speech fragment (invented) warning that concession only invites further demands.

Socratic round 2: Does source 2 change anyone's answer? Why or why not? Teacher coaches individual students one-on-one during a 5-minute paired-debate slot, asking each student to state their position and defend it against their partner.

Source 3 revealed last: a contemporary newspaper editorial fragment (invented) criticizing the policy only after war broke out — hindsight the 1938 decision-makers didn't have.

Final round: students must argue their position using only what was knowable at the time, not hindsight. Teacher gives individual verbal feedback to at least half the class during this round, targeted at each student's specific reasoning.

Exit ticket: one paragraph, your judgement, one piece of evidence, one thing that would change your mind.`,
		pillarBands: [
			{ pillar: 'dialogue', min: 2, max: 3 },
			{ pillar: 'authenticity', min: 2, max: 3 },
			{ pillar: 'mentoring', min: 2, max: 3 }
		],
		skillExpectations: [
			{ skill: 'interpretation', covered: true },
			{ skill: 'analysis', covered: true },
			{ skill: 'evaluation', covered: true },
			{ skill: 'inference', covered: true },
			{ skill: 'explanation', covered: true },
			{ skill: 'self_regulation', covered: true }
		],
		hardInvariants: []
	},
	{
		id: 'H-B1',
		title: 'Cuban Missile Crisis — genuine sources, predetermined interpretation',
		subjectProfileId: 'history-essay',
		rationale:
			'Genuine primary-source material paired with a fully predetermined interpretation and a teacher-supplied thesis — authenticity must not be credited for source authenticity alone when the actual interpretive task is absent.',
		lessonText: `Unit: The Cuban Missile Crisis — Source Study

Six sources are provided, each already followed by the teacher's written interpretation:

1. Cabinet memo fragment (invented): "The President weighed a blockade against an air strike." Interpretation given: "This shows the US considered military options before choosing a blockade."
2. Soviet cable fragment (invented): "Withdrawal will be presented as a magnanimous gesture, not a retreat." Interpretation given: "This shows the USSR wanted to save face while backing down."
3. Wire report fragment (invented) describing naval movements. Interpretation given: "This confirms the blockade was actually enforced."
4. UN speech fragment (invented) accusing the Soviet ambassador of denying the missiles' existence. Interpretation given: "This shows the crisis played out on the world stage, not just privately."
5. Private letter fragment (invented) from a US officer describing tense readiness. Interpretation given: "This shows how close the crisis felt to ordinary military personnel."
6. Declassified assessment fragment (invented), written years later. Interpretation given: "This confirms both sides feared imminent war."

Task: for each source, write its author, approximate date, and category (official/private/military/diplomatic) on the worksheet, then copy the matching interpretation sentence underneath in your own handwriting.

Essay: using the thesis "Both superpowers avoided war through careful, rational diplomacy" (given), write three paragraphs, one per source pairing of your choice, supporting this thesis.`,
		pillarBands: [
			{ pillar: 'authenticity', min: 1, max: 1 },
			{ pillar: 'dialogue', min: 0, max: 1 }
		],
		skillExpectations: [],
		hardInvariants: [
			{
				type: 'pillarMax',
				pillar: 'authenticity',
				max: 1,
				reason:
					'Six genuine-feeling primary sources are present, but every source is paired with a teacher-supplied interpretation students merely copy, and the final thesis is also handed to students — genuine primary-source material alone must not raise authenticity above 1 when the actual interpretive task is entirely predetermined.'
			}
		]
	},
	{
		id: 'H-B2',
		title: 'Peterloo — curated sources, genuine historical inquiry',
		subjectProfileId: 'history-essay',
		rationale:
			'Teacher-curated (not student-researched) sources paired with a genuinely open interpretive task — curation by the teacher must not reduce authenticity credit when the reasoning task itself is real.',
		lessonText: `Unit: Peterloo, 1819 — Threat Response or Political Suppression?

Six curated sources are provided:

1. A magistrate's account (invented) describing the crowd as "dangerously large and unpredictable, requiring immediate dispersal."
2. A reformer's account (invented) describing an orderly, peaceful assembly attacked without provocation.
3. A contemporary newspaper report (invented) with a headline hostile to the authorities.
4. An eyewitness testimony fragment (invented) describing confusion and panic once the cavalry moved.
5. A casualty report fragment (invented) listing injuries inconsistent with an "orderly dispersal."
6. A letter between two local authorities (invented) discussing how to justify the response afterward.

Central question: was the cavalry's action a genuine response to an actual threat, or political suppression of peaceful reform?

Students must: assess each source's likely reliability given who wrote it and why; identify where sources directly conflict (crowd size, whether warning was given, who acted first); explicitly separate what the sources agree on from what remains genuinely uncertain; construct two competing interpretations (threat-response vs. suppression) using specific sources for each; decide which interpretation the full evidence set best supports and defend it in writing; and state, in one sentence, what kind of evidence would change their mind.

No outside research — students work only from the six provided sources.`,
		pillarBands: [{ pillar: 'authenticity', min: 3, max: 3 }],
		skillExpectations: [
			{ skill: 'evaluation', covered: true },
			{ skill: 'inference', covered: true },
			{ skill: 'interpretation', covered: true },
			{ skill: 'explanation', covered: true }
		],
		hardInvariants: [
			{
				type: 'pillarMin',
				pillar: 'authenticity',
				min: 3,
				reason:
					'Teacher-curated primary sources paired with a genuinely open interpretive task (reconciling conflicting accounts, constructing and defending competing interpretations) must earn full authenticity credit — curation by the teacher is not a reason to withhold it.'
			}
		]
	},
	{
		id: 'H-B3',
		title: 'Polished Nazi-propaganda-techniques carousel',
		subjectProfileId: 'history-essay',
		rationale:
			'Polished production values (station roles, carousel format) sitting on top of a low-reasoning matching task — nothing asks students to judge effectiveness/credibility or revise a position, so inference and self-regulation should not be credited despite the professional framing.',
		lessonText: `Unit: Propaganda Techniques Carousel

Students rotate through three stations in role (badge and role card provided at each: "you are a wartime censor," "you are a citizen," "you are a journalist").

Station 1 — Poster: a description of an invented WWII-era-style poster is provided along with the worksheet answer already filled in: "Technique: appeal to fear." Students copy this label onto their own worksheet.

Station 2 — Radio: a transcript fragment (invented) of a wartime radio broadcast is provided along with the worksheet answer already filled in: "Technique: repetition of a simple slogan." Students copy this label.

Station 3 — Newsreel: a narration fragment (invented) is provided along with the worksheet answer already filled in: "Technique: selective omission." Students copy this label.

At each station, students also write one sentence in role (e.g., as "the censor," why they approved the poster) — a short creative-writing prompt, not an argument.

No station asks whether the propaganda actually worked, how credible it would have seemed at the time, or whether students' own initial reaction to any fragment changed after discussion. The worksheet is collected at the end for a completion grade only.`,
		pillarBands: [
			{ pillar: 'dialogue', min: 1, max: 2 },
			{ pillar: 'authenticity', min: 1, max: 2 },
			{ pillar: 'mentoring', min: 1, max: 2 }
		],
		skillExpectations: [
			{ skill: 'inference', covered: false },
			{ skill: 'self_regulation', covered: false },
			{ skill: 'evaluation', covered: 'either' }
		],
		hardInvariants: [
			{
				type: 'skillCovered',
				skill: 'inference',
				mustBe: false,
				reason:
					'Students match pre-labelled technique names to fragments rather than drawing any conclusion themselves.'
			},
			{
				type: 'skillCovered',
				skill: 'self_regulation',
				mustBe: false,
				reason: 'Nothing asks students to state, test, or revise their own judgement.'
			}
		]
	},
	{
		id: 'H-C1',
		title: 'Historical classification only',
		subjectProfileId: 'history-essay',
		rationale:
			"Sorting claims into supplied categories is classification, not analysis of an argument's structure — Analysis should not be credited.",
		lessonText: `Warm-up: Sort the Claims

Below are eight historical statements. Sort each into one of the four supplied categories: Propaganda, Eyewitness Testimony, Official Record, Later Historical Analysis.

1. "The crowd numbered in the tens of thousands and grew increasingly restless." (invented eyewitness-style fragment)
2. "Government forces acted within their lawful authority to preserve order." (invented official-style fragment)
3. "Our righteous cause cannot fail while the people stand united." (invented propaganda-style fragment)
4. "Modern scholarship suggests the crisis had roots decades earlier." (invented later-analysis-style fragment)
5. "I saw the smoke from my window and knew something had gone wrong." (invented eyewitness-style fragment)
6. "The council hereby authorizes the following measures, effective immediately." (invented official-style fragment)
7. "Only the weak-willed would question the necessity of this campaign." (invented propaganda-style fragment)
8. "Historians now largely agree the settlement was unstable from the outset." (invented later-analysis-style fragment)

Write the category name next to each number. No explanation required.`,
		pillarBands: [],
		skillExpectations: [
			{ skill: 'analysis', covered: false },
			{ skill: 'interpretation', covered: 'either' }
		],
		hardInvariants: [
			{
				type: 'skillCovered',
				skill: 'analysis',
				mustBe: false,
				reason:
					"Sorting claims into supplied categories is classification, not analysing an argument's structure."
			}
		]
	},
	{
		id: 'H-C2',
		title: 'Genuine historical argument analysis',
		subjectProfileId: 'history-essay',
		rationale:
			'Students identify conclusions, premises, and unstated assumptions and compare argument structures — genuine analysis, should stay contrasted against H-C1.',
		lessonText: `Task: Analysing Two Historical Arguments

Argument A (invented): "The famine was caused primarily by policy failure, because relief shipments were delayed by administrative decisions that could have been made faster, and regions with better local governance suffered proportionally less."

Argument B (invented): "The famine was primarily caused by the harvest failure itself, because even regions with the best local governance still suffered severe shortages once the crop failed across the whole region simultaneously."

For each argument, identify: the conclusion being argued for; the premises offered in support; any assumption the argument relies on that isn't stated outright (for example, what each argument assumes about how much local governance could realistically have changed the outcome).

Then compare the two arguments directly: do they actually disagree about the facts, or do they weigh the same facts differently? Which assumption, if wrong, would most damage each argument? Write a half-page comparison identifying where the arguments' structures differ, not just their conclusions.`,
		pillarBands: [],
		skillExpectations: [{ skill: 'analysis', covered: true }],
		hardInvariants: [
			{
				type: 'skillCovered',
				skill: 'analysis',
				mustBe: true,
				reason:
					'Students identify conclusions, premises, and unstated assumptions, and compare argument structures — genuine analysis of argument structure.'
			}
		]
	},
	{
		id: 'H-C3',
		title: 'History essay surface checklist',
		subjectProfileId: 'history-essay',
		rationale:
			'A formatting/spelling checklist over a finished essay is not self-regulation of historical reasoning — Self-Regulation should not be credited.',
		lessonText: `Before You Submit: Essay Checklist

Review your finished essay against this checklist and tick each box:

- Does your essay have a title?
- Does it have three body paragraphs?
- Have you used at least three key vocabulary terms from this unit?
- Have you checked your spelling?
- Is your name on the front page?
- Is the essay double-spaced?

Submit the checklist stapled to your essay. Essays without a completed checklist will be returned ungraded.`,
		pillarBands: [],
		skillExpectations: [{ skill: 'self_regulation', covered: false }],
		hardInvariants: [
			{
				type: 'skillCovered',
				skill: 'self_regulation',
				mustBe: false,
				reason:
					'A formatting and spelling checklist is not self-regulation of historical reasoning.'
			}
		]
	},
	{
		id: 'H-C4',
		title: 'History essay reasoning revision',
		subjectProfileId: 'history-essay',
		rationale:
			'Initial judgement plus confidence, a stated update criterion, a genuinely conflicting source, and a real revision with a named weakness — genuine self-regulation, should stay contrasted against H-C3.',
		lessonText: `Task: Revising Your Argument

Step 1: In one sentence, state your current judgement about what most caused the currency crisis you researched this unit, and rate your confidence (low/medium/high).

Step 2: In one sentence, state what kind of evidence would change your mind.

Step 3: Read the new source below (invented): a treasury report fragment showing that reserves had already been depleted for unrelated reasons well before the event your essay blames.

Step 4: Decide whether this source changes your judgement or not, and explain why in a short paragraph — either way, you must explain your reasoning, not just restate your original position.

Step 5: Identify one specific weakness in your original reasoning — something you assumed, overlooked, or overstated before seeing the new source.

Step 6: Revise the relevant paragraph of your essay to reflect your (possibly unchanged, but now better-justified) position.`,
		pillarBands: [],
		skillExpectations: [{ skill: 'self_regulation', covered: true }],
		hardInvariants: [
			{
				type: 'skillCovered',
				skill: 'self_regulation',
				mustBe: true,
				reason:
					'Students state an initial judgement and confidence, name in advance what would change their mind, encounter a genuinely conflicting primary source, and revise their position and essay paragraph while identifying a weakness in their own original reasoning.'
			}
		]
	}
];

export const historyFixtures: CalibrationFixture[] = fixtures.map((f) =>
	CalibrationFixtureSchema.parse(f)
);
