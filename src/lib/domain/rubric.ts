/**
 * Three-pillar instructional rubric (dialogue, authentic/situated
 * problems, mentoring), adapted from the coding scheme in Abrami et al.
 * (2015) for what made critical-thinking interventions effective.
 * Paraphrased grounding data — see scope-and prompts.txt Section 1.2.
 *
 * Pure data, used both for LLM prompt grounding (Prompt 6) and for
 * rendering the results UI (Prompt 7 — a bar/radar display keyed by
 * pillar and score).
 */

export type PillarId = 'dialogue' | 'authenticity' | 'mentoring';

export type RubricScore = 0 | 1 | 2 | 3;

export interface RubricLevel {
	score: RubricScore;
	description: string;
}

export interface RubricPillar {
	id: PillarId;
	name: string;
	summary: string;
	levels: readonly [RubricLevel, RubricLevel, RubricLevel, RubricLevel];
}

export const rubricPillars: readonly RubricPillar[] = [
	{
		id: 'dialogue',
		name: 'Dialogue',
		summary: 'How much structured discussion or debate drives the lesson.',
		levels: [
			{
				score: 0,
				description:
					'One-directional delivery only (lecture, silent reading, solo worksheet); no structured exchange.'
			},
			{
				score: 1,
				description: "Some discussion happens but it's incidental, not designed into the activity."
			},
			{
				score: 2,
				description:
					'Discussion or debate is a real, deliberate part of the lesson, but only for part of it.'
			},
			{
				score: 3,
				description:
					'Structured dialogue (Socratic questioning, formal debate, small-group argumentation) is the primary engine of the lesson from start to finish.'
			}
		]
	},
	{
		id: 'authenticity',
		name: 'Authentic / Situated Problems',
		summary: 'How real and unsimplified the problem students work on is.',
		levels: [
			{ score: 0, description: 'Purely abstract content with no real-world tie-in.' },
			{
				score: 1,
				description: "A real-world example is mentioned but students don't have to work with it."
			},
			{
				score: 2,
				description:
					'Students apply skills to a realistic scenario or simulation, but it’s simplified or partial.'
			},
			{
				score: 3,
				description:
					'Students work through a genuine, messy, real-world problem as the central task of the lesson.'
			}
		]
	},
	{
		id: 'mentoring',
		name: 'Mentoring',
		summary: 'How much individualized coaching or modeling students get.',
		levels: [
			{ score: 0, description: 'Fully independent work; no individualized modeling or feedback.' },
			{ score: 1, description: 'Feedback exists but is generic or infrequent.' },
			{
				score: 2,
				description: 'Some individualized coaching or modeling happens, but not throughout.'
			},
			{
				score: 3,
				description:
					'Sustained one-on-one or small-group coaching/modeling (teacher demonstrates thinking, gives individualized feedback repeatedly) is central to the lesson.'
			}
		]
	}
] as const;

export function getRubricPillar(id: PillarId): RubricPillar {
	const pillar = rubricPillars.find((p) => p.id === id);
	if (!pillar) throw new Error(`Unknown rubric pillar id: ${id}`);
	return pillar;
}

export function getRubricLevel(id: PillarId, score: RubricScore): RubricLevel {
	const level = getRubricPillar(id).levels[score];
	if (!level) throw new Error(`Unknown rubric score ${score} for pillar ${id}`);
	return level;
}

/**
 * Renders the rubric as plain text suitable for embedding in an LLM
 * system prompt as grounding context.
 */
export function rubricGroundingText(): string {
	return rubricPillars
		.map((pillar) => {
			const levels = pillar.levels.map((l) => `  ${l.score} — ${l.description}`).join('\n');
			return `${pillar.name} (${pillar.summary}):\n${levels}`;
		})
		.join('\n\n');
}
