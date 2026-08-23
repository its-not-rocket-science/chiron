/**
 * Six-skill critical-thinking taxonomy and disposition clusters, adapted
 * from the APA Delphi consensus definition as cited in Abrami et al.
 * (2015). Paraphrased grounding data — see scope-and prompts.txt Section 1.1
 * for the source wording this was written from.
 *
 * This is pure data: no framework imports, no LLM calls. It's consumed by
 * the scoring prompt builder (grounding context) and by results UI (a
 * skill-coverage checklist).
 */

export const ctSkillIds = [
	'interpretation',
	'analysis',
	'evaluation',
	'inference',
	'explanation',
	'self_regulation'
] as const;
export type CTSkillId = (typeof ctSkillIds)[number];

export interface CTSkill {
	id: CTSkillId;
	name: string;
	description: string;
	subSkills: string[];
}

export const ctSkills: readonly CTSkill[] = [
	{
		id: 'interpretation',
		name: 'Interpretation',
		description: 'Making sense of information and situations.',
		subSkills: [
			'Sorting information into meaningful categories',
			'Figuring out what something signifies',
			'Clarifying ambiguous meaning'
		]
	},
	{
		id: 'analysis',
		name: 'Analysis',
		description: 'Breaking an argument or claim into its parts.',
		subSkills: [
			'Examining the ideas at play',
			'Recognizing when an argument is being made',
			'Picking apart how an argument is structured'
		]
	},
	{
		id: 'evaluation',
		name: 'Evaluation',
		description: 'Judging credibility and soundness.',
		subSkills: [
			'Assessing whether a claim is believable',
			"Assessing whether an argument's reasoning actually holds up"
		]
	},
	{
		id: 'inference',
		name: 'Inference',
		description: 'Drawing warranted conclusions.',
		subSkills: [
			'Interrogating the evidence',
			'Generating alternative explanations before settling on one',
			'Reaching a conclusion that follows from the evidence'
		]
	},
	{
		id: 'explanation',
		name: 'Explanation',
		description: "Communicating one's reasoning to others.",
		subSkills: [
			'Stating a result clearly',
			'Justifying the method used to reach it',
			'Laying out supporting arguments so others can follow them'
		]
	},
	{
		id: 'self_regulation',
		name: 'Self-Regulation',
		description: "Monitoring and correcting one's own thinking.",
		subSkills: [
			'Checking your own reasoning for errors',
			'Revising your position when you find one'
		]
	}
] as const;

export function getCTSkill(id: CTSkillId): CTSkill {
	const skill = ctSkills.find((s) => s.id === id);
	if (!skill) throw new Error(`Unknown CT skill id: ${id}`);
	return skill;
}

export type DispositionClusterId = 'approach_to_problem' | 'approach_to_inquiry';

export interface DispositionCluster {
	id: DispositionClusterId;
	name: string;
	description: string;
	items: string[];
}

export const dispositionClusters: readonly DispositionCluster[] = [
	{
		id: 'approach_to_problem',
		name: 'Approach to a specific problem',
		description: 'Dispositions that show up when tackling one particular problem.',
		items: [
			"Being clear about what's being asked",
			'Staying organized when things get complex',
			'Being diligent about seeking out relevant information',
			'Applying reasonable standards',
			'Staying focused',
			'Sticking with a hard problem',
			'Being as precise as the situation calls for'
		]
	},
	{
		id: 'approach_to_inquiry',
		name: 'Approach to inquiry in general',
		description: 'Broader dispositions toward reasoned inquiry as an ongoing practice.',
		items: [
			'Curiosity across a range of topics',
			'Wanting to stay broadly informed',
			'Noticing chances to apply critical thinking',
			'Trusting the process of reasoned inquiry',
			"Confidence in one's own reasoning ability",
			'Openness to other views',
			'Genuinely understanding what others believe and why',
			'Fairness when judging arguments you disagree with',
			"Honesty about one's own blind spots",
			"Flexibility about one's own biases and assumptions",
			'Caution about when to commit to, suspend, or change a judgment',
			'Willingness to revise a view when reflection warrants it'
		]
	}
] as const;

/**
 * Renders the taxonomy as plain text suitable for embedding in an LLM
 * system prompt as grounding context (used by the scoring prompt builder,
 * Prompt 6).
 */
export function taxonomyGroundingText(): string {
	const skillsText = ctSkills
		.map(
			(skill) =>
				`- ${skill.name}: ${skill.description}\n  Sub-skills: ${skill.subSkills.join('; ')}`
		)
		.join('\n');

	const dispositionsText = dispositionClusters
		.map((cluster) => `- ${cluster.name}: ${cluster.items.join('; ')}`)
		.join('\n');

	return [
		'Six core critical-thinking skill categories:',
		skillsText,
		'',
		'Critical-thinking dispositions (attitudes, not skills):',
		dispositionsText
	].join('\n');
}
