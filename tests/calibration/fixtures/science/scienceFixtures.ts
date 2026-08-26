/**
 * Science Lab calibration fixtures
 * (`chiron_calibration_feedback_and_automation_prompts.txt` Prompt M2).
 * Hand-written lesson-plan text, not model-generated — same discipline
 * `src/lib/domain/practiceCases.ts` already follows for Phase 2A's
 * canonical cases.
 */
import { CalibrationFixtureSchema, type CalibrationFixture } from '../calibrationFixture';

export const scienceFixtures: CalibrationFixture[] = (
	[
		{
			id: 'S-A1',
			title: 'Weak conventional fertiliser lesson',
			subjectProfileId: 'science-lab',
			rationale:
				'A weak, conventional baseline: independent seatwork with the answer stated up front, no discussion, no lab work, no coaching.',
			lessonText:
				'Fertiliser Types Worksheet — Grade 8 Science\n\n' +
				'Objective: Students will learn which fertiliser type produces the best plant growth.\n\n' +
				'Hand out the "Fertiliser Types" reading passage. It describes three fertiliser types: ' +
				'nitrogen-rich, phosphorus-rich, and balanced all-purpose. The passage states that the ' +
				'balanced all-purpose fertiliser produces the best overall growth because it supplies all ' +
				'three major nutrients at once.\n\n' +
				'Students read the passage silently and complete the attached worksheet:\n' +
				'1. List the three fertiliser types mentioned in the passage.\n' +
				'2. According to the passage, which fertiliser type gives the best growth? Why?\n' +
				'3. Fill in the blank table matching each fertiliser type to its main nutrient.\n' +
				'4. In two sentences, explain in your own words why balanced fertiliser works best, using ' +
				'evidence from the passage.\n\n' +
				'Students work silently and individually for the full period. Collect worksheets at the ' +
				'end for grading against the answer key. No group discussion or lab work is planned for ' +
				'this lesson.',
			pillarBands: [
				{ pillar: 'dialogue', min: 0, max: 1 },
				{ pillar: 'authenticity', min: 1, max: 2 },
				{ pillar: 'mentoring', min: 0, max: 1 }
			],
			skillExpectations: [
				{ skill: 'evaluation', covered: true },
				{ skill: 'inference', covered: true },
				{ skill: 'interpretation', covered: true },
				{ skill: 'self_regulation', covered: false }
			],
			hardInvariants: []
		},
		{
			id: 'S-B1',
			title: 'Real lab materials, cookbook procedure',
			subjectProfileId: 'science-lab',
			rationale:
				'Real lab equipment paired with a fully scripted, no-decision procedure — tests whether authenticity scoring correctly discounts genuine materials with zero authentic reasoning task.',
			lessonText:
				'Enzyme Activity Lab — Temperature and Catalase\n\n' +
				'Materials: test tubes, thermometers, water baths at 5°C/20°C/35°C/50°C, hydrogen peroxide, ' +
				'fresh liver disc (catalase source), stopwatch, ruler.\n\n' +
				'Procedure (follow exactly as written):\n' +
				'1. Place a liver disc into a test tube containing 10 mL of hydrogen peroxide at each of the ' +
				'four temperatures listed above.\n' +
				'2. Start the stopwatch the moment the disc is added. Measure the height of foam produced ' +
				'after exactly 60 seconds using the ruler.\n' +
				'3. Record your measurement in the table below in the row for that temperature. Expected ' +
				'values are already filled in for you as a guide — your numbers should be close to these:\n' +
				'   5°C: 2mm | 20°C: 8mm | 35°C: 15mm | 50°C: 3mm\n' +
				'4. Repeat for all four temperatures.\n' +
				'5. Copy the following conclusion into your lab notebook, filling in your own measured ' +
				'values where indicated: "Enzyme activity increases with temperature up to an optimum ' +
				'around 35°C, then decreases at higher temperatures because the enzyme denatures."\n\n' +
				'Submit your completed table and conclusion at the end of the period. No variation from ' +
				'the procedure above is permitted — every group should be measuring the same four ' +
				'temperatures in the same way.',
			pillarBands: [{ pillar: 'authenticity', min: 1, max: 2 }],
			skillExpectations: [{ skill: 'inference', covered: false }],
			hardInvariants: [
				{
					type: 'pillarMax',
					pillar: 'authenticity',
					max: 2,
					reason:
						'Real lab equipment with a fully scripted cookbook procedure and a pre-supplied conclusion must not earn full authenticity credit just because real equipment is present.'
				},
				{
					type: 'skillCovered',
					skill: 'inference',
					mustBe: false,
					reason:
						'Students copy a supplied conclusion into their notebook rather than determining what their own data shows.'
				}
			]
		},
		{
			id: 'S-B2',
			title: 'Simulated data, genuine scientific reasoning',
			subjectProfileId: 'science-lab',
			rationale:
				'Teacher-supplied but deliberately messy simulated data paired with a genuinely open reasoning task — tests whether authenticity scoring correctly rewards real reasoning even though students never collected the data themselves.',
			lessonText:
				'Does the New Fertiliser Actually Work? — Data Analysis Lesson\n\n' +
				'Present students with the following bean-plant height data (cm, measured after 3 weeks), ' +
				'collected by a (fictional) previous class:\n\n' +
				'Control group (no fertiliser): Plant 1: 14.2 (started at 3.0) | Plant 2: 15.8 (started at ' +
				'3.5) | Plant 3: 13.1 (started at 3.0) | Plant 4: missing measurement (watering log shows ' +
				'this plant was skipped twice) | Plant 5: 14.9 (started at 3.2)\n\n' +
				'Treatment group (new fertiliser): Plant 1: 19.4 (started at 3.1) | Plant 2: 18.7 (started ' +
				"at 3.6) | Plant 3: 6.2 (started at 3.0, note: this plant's pot was knocked over on day 9) " +
				'| Plant 4: 20.1 (started at 3.3) | Plant 5: 19.0 (started at 3.4)\n\n' +
				'In small groups, students must:\n' +
				'1. Identify any problems with this data set that would make you cautious about trusting ' +
				'it at face value.\n' +
				'2. Decide whether the missing measurement and the knocked-over plant should be included ' +
				'in your comparison, and justify your decision.\n' +
				'3. Propose at least one explanation for Treatment Plant 3\'s low result other than "the ' +
				'fertiliser doesn\'t work."\n' +
				'4. Using only the comparisons you judge to be fair, decide how strong the evidence is that ' +
				'the new fertiliser increases growth.\n' +
				'5. State what additional data you would want before you fully trusted this conclusion.\n' +
				'6. Write your own conclusion, with reasoning, about whether the fertiliser works.\n\n' +
				'Groups present their conclusions and reasoning to the class; the teacher facilitates ' +
				'discussion of the different data-handling decisions groups made.',
			pillarBands: [{ pillar: 'authenticity', min: 2, max: 3 }],
			skillExpectations: [
				{ skill: 'evaluation', covered: true },
				{ skill: 'inference', covered: true },
				{ skill: 'analysis', covered: true }
			],
			hardInvariants: [
				{
					type: 'pillarMin',
					pillar: 'authenticity',
					min: 2,
					reason:
						'Messy, realistic simulated data paired with a genuinely open reasoning task must not be penalised just because students did not physically collect the data themselves.'
				}
			]
		},
		{
			id: 'S-B3',
			title: 'Cosmetic epidemiologist role play',
			subjectProfileId: 'science-lab',
			rationale:
				'Professional-role framing (badges, case files, a decision tree) layered over a linear, no-choice worksheet — tests whether the scorer looks past cosmetic framing to the actual task structure.',
			lessonText:
				'Disease Detectives: Outbreak Investigation — Role Play Activity\n\n' +
				'Each student receives an "Epidemiologist" badge to wear and a manila folder labeled ' +
				'"CONFIDENTIAL CASE FILE" containing three short patient summaries for a fictional flu-like ' +
				'outbreak.\n\n' +
				'Students follow the attached decision-tree flowchart step by step:\n' +
				'- Box 1: Do all three patients report fever? If YES, go to Box 2.\n' +
				'- Box 2: Do all three patients live within 2 miles of the water treatment plant? If YES, ' +
				'go to Box 3.\n' +
				'- Box 3: Was the water treatment plant reported for a filtration fault last month? If YES, ' +
				'go to Box 4 (Conclusion: contaminated water supply).\n\n' +
				'Every case file is written so that following the flowchart leads every student to the ' +
				'same Box 4 conclusion. Students write "Contaminated water supply" as their final answer ' +
				'on the case-closure form and turn it in.\n\n' +
				'No class discussion is scheduled. The teacher circulates only to hand out folders and ' +
				'collect completed case-closure forms at the end.',
			pillarBands: [
				{ pillar: 'dialogue', min: 0, max: 1 },
				{ pillar: 'authenticity', min: 1, max: 2 },
				{ pillar: 'mentoring', min: 0, max: 1 }
			],
			skillExpectations: [
				{ skill: 'evaluation', covered: false },
				{ skill: 'inference', covered: false },
				{ skill: 'analysis', covered: false },
				{ skill: 'self_regulation', covered: false }
			],
			hardInvariants: [
				{
					type: 'pillarMax',
					pillar: 'mentoring',
					max: 1,
					reason:
						'Cosmetic professional-role framing (badges, case files, a decision tree) is not mentoring — no individualized coaching or feedback actually occurs.'
				}
			]
		},
		{
			id: 'S-C1',
			title: 'Supplied scientific conclusion (smoking/ad ban)',
			subjectProfileId: 'science-lab',
			rationale:
				'The conclusion is stated as fact by the teacher; students only generate supporting reasons — tests the specific failure the manual calibration pass found (a supplied conclusion wrongly scoring Inference covered).',
			lessonText:
				'Did the Ad Ban Reduce Smoking? — Reasons Activity\n\n' +
				'Show students this data: in the five years after cigarette advertising was banned on ' +
				'television, national smoking rates fell from 28% to 19% of adults.\n\n' +
				'Tell students: "This clearly proves that banning cigarette advertising reduced smoking ' +
				'rates. Your job today is to explain why this makes sense."\n\n' +
				'Individually, students write three reasons that support the claim that the ad ban caused ' +
				'the drop in smoking rates. Reasons should reference the data given above. Collect written ' +
				'responses at the end of the period.',
			pillarBands: [],
			skillExpectations: [
				{ skill: 'inference', covered: false },
				{ skill: 'evaluation', covered: false },
				{ skill: 'explanation', covered: 'either' }
			],
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'inference',
					mustBe: false,
					reason:
						'Students only generate reasons for a conclusion the teacher already stated as fact — no inference occurs.'
				},
				{
					type: 'skillCovered',
					skill: 'evaluation',
					mustBe: false,
					reason:
						'The claim is presented as already established; nothing asks students to judge whether it actually holds up.'
				}
			]
		},
		{
			id: 'S-C2',
			title: 'Genuine scientific inference (smoking/ad ban)',
			subjectProfileId: 'science-lab',
			rationale:
				'Same underlying data as S-C1, but students must reach their own conclusion — the direct positive contrast for the Inference discrimination the manual pass wants preserved.',
			lessonText:
				'What Can We Actually Conclude? — Smoking Rates Investigation\n\n' +
				'Show students the same data: in the five years after cigarette advertising was banned on ' +
				'television, national smoking rates fell from 28% to 19% of adults. This time, do not ' +
				'state a conclusion.\n\n' +
				'Ask students, individually then in pairs:\n' +
				'1. What are at least two other things, besides the ad ban, that could explain a drop in ' +
				'smoking rates over five years? (e.g. tax increases, new health warnings, changing social ' +
				'attitudes)\n' +
				'2. Does this data show that the ad ban caused the drop, or only that the two things ' +
				'happened around the same time? What is the difference?\n' +
				'3. What additional evidence would help you tell whether the ad ban specifically was ' +
				'responsible, versus these other factors?\n' +
				'4. Based only on what you have here, what is the strongest conclusion you can actually ' +
				'draw, and how confident are you in it?\n\n' +
				'Pairs share their conclusions with the class; the teacher highlights cases where different ' +
				'pairs reached different, still-defensible conclusions from the same data.',
			pillarBands: [],
			skillExpectations: [
				{ skill: 'inference', covered: true },
				{ skill: 'evaluation', covered: true }
			],
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'inference',
					mustBe: true,
					reason:
						'Students determine what can be concluded themselves, propose and weigh alternative explanations, and identify missing evidence before reaching their own conclusion.'
				}
			]
		},
		{
			id: 'S-C3',
			title: 'Surface self-check (lab report checklist)',
			subjectProfileId: 'science-lab',
			rationale:
				'A formatting/spelling checklist mislabelled as reflection — tests that surface self-checks are not credited as self-regulation.',
			lessonText:
				'Lab Report Self-Check — Before You Submit\n\n' +
				'Before turning in your lab report, go through this checklist and tick each box:\n' +
				'[ ] My report has a title.\n' +
				'[ ] My report is organised into clear paragraphs (Introduction, Method, Results, ' +
				'Conclusion).\n' +
				'[ ] I have used at least five key vocabulary words from this unit.\n' +
				'[ ] I have checked my spelling and grammar.\n' +
				'[ ] My name and class period are on the front page.\n\n' +
				'Staple this checklist to the front of your report when you submit it.',
			pillarBands: [],
			skillExpectations: [{ skill: 'self_regulation', covered: false }],
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'self_regulation',
					mustBe: false,
					reason: 'A formatting and spelling checklist is not self-regulation of reasoning.'
				}
			]
		},
		{
			id: 'S-C4',
			title: 'Genuine scientific self-regulation',
			subjectProfileId: 'science-lab',
			rationale:
				'A full initial-judgement/confidence/what-would-change-my-mind/revision cycle — the direct positive contrast for the Self-Regulation discrimination the manual pass wants preserved.',
			lessonText:
				'Does Ice Colour Affect Melting Speed? — Reasoning Revision Activity\n\n' +
				'Present the question: "Does the colour of an ice cube affect how fast it melts in direct ' +
				'sunlight?"\n\n' +
				'Step 1: Individually, students write their initial judgement (yes/no/depends) and a ' +
				'confidence level (low/medium/high), with a one-sentence reason.\n\n' +
				'Step 2: Students write down what evidence would change their mind if they saw it.\n\n' +
				'Step 3: Present real data: black-dyed ice cubes melted in 22 minutes, white-dyed ice cubes ' +
				'melted in 31 minutes, and clear (undyed) ice cubes melted in 29 minutes, all under the ' +
				'same sunlight conditions — but the black cubes were also slightly smaller than the others ' +
				'when weighed beforehand.\n\n' +
				'Step 4: Students must either revise their original judgement or explain why they are ' +
				'sticking with it, given this new (slightly complicated) evidence.\n\n' +
				'Step 5: Students identify one specific weakness in their own original reasoning from Step ' +
				'1 — something they did not consider that turned out to matter (e.g. not accounting for ' +
				'the size difference).\n\n' +
				'Collect written responses covering all five steps.',
			pillarBands: [],
			skillExpectations: [{ skill: 'self_regulation', covered: true }],
			hardInvariants: [
				{
					type: 'skillCovered',
					skill: 'self_regulation',
					mustBe: true,
					reason:
						'Students state an initial judgement and confidence, name in advance what would change their mind, encounter real conflicting evidence, and revise or defend their position while identifying a weakness in their own original reasoning.'
				}
			]
		}
	] satisfies CalibrationFixture[]
).map((f) => CalibrationFixtureSchema.parse(f));
