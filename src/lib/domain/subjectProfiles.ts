/**
 * Subject-specific suggestion profiles (docs/ARCHITECTURE.md Section 3,
 * ADR-003). Adding a profile is adding an entry to `subjectProfiles`
 * below — the scoring engine (Prompt 6) takes a `SubjectProfile` object,
 * so no scoring-engine code changes when a new subject is added.
 */

import type { CTSkillId } from './taxonomy';

export interface SubjectProfile {
	/** Stable slug, e.g. "science-lab". Used as the selector value and DB reference. */
	id: string;
	name: string;
	description: string;
	/** Example framings of what an "authentic problem" looks like in this subject. */
	authenticProblemExamples: string[];
	/** Which of the six CT skills this subject's suggestions tend to emphasize. */
	skillEmphasis: CTSkillId[];
	/**
	 * Optional extra steer for the scoring prompt, used only when this
	 * subject's Authenticity pillar scores low — what suggestions should
	 * point toward instead of a generic "make it more real" tip. Most
	 * profiles don't need one; add it when a subject has a
	 * characteristic authenticity failure mode worth naming explicitly
	 * (see `journalism` below).
	 */
	lowAuthenticitySuggestionGuidance?: string;
}

export const subjectProfiles: readonly SubjectProfile[] = [
	{
		id: 'science-lab',
		name: 'Science Lab',
		description:
			'Lab-based science instruction — experiments, data collection, and evidence-based reasoning about natural phenomena.',
		authenticProblemExamples: [
			'Students collect their own real data rather than following a scripted "expected result" procedure.',
			'Students design part of the experiment themselves, including deciding what to control for.',
			'Students evaluate messy, real evidence that doesn’t cleanly confirm the hypothesis.'
		],
		skillEmphasis: ['inference', 'evaluation']
	},
	{
		id: 'history-essay',
		name: 'History Essay',
		description:
			'Argumentative history writing — working from primary sources to construct and defend a historical claim.',
		authenticProblemExamples: [
			'Students work directly with primary sources rather than a textbook summary of events.',
			'Students corroborate or reconcile conflicting accounts of the same event.',
			'Students construct an original argument from evidence rather than restating a given thesis.'
		],
		skillEmphasis: ['interpretation', 'explanation']
	},
	{
		id: 'journalism',
		name: 'Journalism',
		description:
			'For lessons where students report, edit, or critically evaluate news and journalism — writing assignments, media-literacy units, or critique of published reporting.',
		authenticProblemExamples: [
			'Have students interview a real, named source (a teacher, a local business owner, a community member) rather than write from imagined quotes.',
			'Have students cover an actual, verifiable campus or community event and check their draft against what other observers or outlets reported before finalizing it.',
			"Have students select a real published article and verify one specific factual claim in it against a primary source, rather than just summarizing the article's conclusions."
		],
		skillEmphasis: ['evaluation', 'interpretation', 'self_regulation'],
		lowAuthenticitySuggestionGuidance:
			'point toward anchoring the assignment in a real, checkable claim or a real interview, rather than a hypothetical "write a news article about X" prompt with no accountability to real facts.'
	},
	{
		id: 'ela-argumentative-writing',
		name: 'ELA — Argumentative Writing',
		description:
			'General persuasive or argumentative essay writing — building and defending a position for a real audience and real stakes, not tied to historical source analysis specifically.',
		authenticProblemExamples: [
			'Have students write to an actual audience with the power to act on it — a real school board member, a real local official — about a real, currently undecided policy question, not a hypothetical one.',
			'Have students respond directly to a real published op-ed, engaging with its actual argument rather than a generic prompt topic.',
			'Have students anticipate and rebut a real counterargument an actual opponent of their position would raise, rather than a straw-man counterargument they invent themselves.'
		],
		skillEmphasis: ['analysis', 'explanation']
	},
	{
		id: 'civics-current-events',
		name: 'Civics & Current Events',
		description:
			"Lessons built around live current events or civic questions — evaluating real news coverage, primary-source government documents, or a real local government's actions.",
		authenticProblemExamples: [
			'Have students analyze an actual primary-source government document (a bill, an agenda, a public record) relevant to a current question, rather than a summary or textbook description of it.',
			'Have students examine the agenda or minutes from an actual local government meeting relevant to the topic, rather than a hypothetical civic scenario.',
			'Have students compare how two real news outlets covered the same current event and identify where the coverage actually diverges, rather than analyzing a single pre-selected account.'
		],
		skillEmphasis: ['analysis', 'evaluation', 'self_regulation']
	}
] as const;

export function getSubjectProfile(id: string): SubjectProfile | undefined {
	return subjectProfiles.find((p) => p.id === id);
}
