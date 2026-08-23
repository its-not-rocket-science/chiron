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
	}
] as const;

export function getSubjectProfile(id: string): SubjectProfile | undefined {
	return subjectProfiles.find((p) => p.id === id);
}
