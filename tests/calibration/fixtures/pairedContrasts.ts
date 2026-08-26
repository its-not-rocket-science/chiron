/**
 * Paired-contrast invariants (`chiron_calibration_feedback_and_
 * automation_prompts.txt` Prompt M4(h)) — "pairwise relationships are
 * often more robust than exact scores." Each entry names two fixture
 * ids already defined in `science/scienceFixtures.ts` or
 * `history/historyFixtures.ts` and a dimension the `strongerId` fixture
 * must score/cover strictly better than `weakerId` on. Checked by the
 * evaluator once both fixtures have real results — not a property
 * either fixture declares about itself.
 */
import { PairedContrastSchema, type PairedContrast } from './calibrationFixture';

export const pairedContrasts: PairedContrast[] = (
	[
		{
			id: 'science-inference-genuine-vs-supplied',
			strongerId: 'S-C2',
			weakerId: 'S-C1',
			dimension: 'inference',
			reason:
				'S-C2 asks students to determine what can be concluded from evidence; S-C1 hands them the conclusion and asks only for supporting reasons — Inference must discriminate between the two.'
		},
		{
			id: 'history-analysis-genuine-vs-classification',
			strongerId: 'H-C2',
			weakerId: 'H-C1',
			dimension: 'analysis',
			reason:
				'H-C2 asks students to identify premises, assumptions, and argument structure; H-C1 is pure classification into supplied categories — Analysis must discriminate between the two.'
		},
		{
			id: 'science-self-regulation-genuine-vs-surface',
			strongerId: 'S-C4',
			weakerId: 'S-C3',
			dimension: 'self_regulation',
			reason:
				'S-C4 is a genuine judgement-confidence-revision cycle; S-C3 is a formatting checklist — Self-Regulation must discriminate between the two.'
		},
		{
			id: 'history-self-regulation-genuine-vs-surface',
			strongerId: 'H-C4',
			weakerId: 'H-C3',
			dimension: 'self_regulation',
			reason:
				'H-C4 is a genuine judgement-confidence-revision cycle; H-C3 is a formatting checklist — Self-Regulation must discriminate between the two.'
		},
		{
			id: 'history-authenticity-curated-inquiry-vs-predetermined',
			strongerId: 'H-B2',
			weakerId: 'H-B1',
			dimension: 'authenticity',
			reason:
				'H-B2 pairs curated sources with a genuinely open interpretive task; H-B1 pairs genuine sources with a predetermined interpretation — Authenticity must discriminate between the two, since primary-source genuineness alone is not what the pillar measures.'
		},
		{
			id: 'science-authenticity-messy-reasoning-vs-cookbook',
			strongerId: 'S-B2',
			weakerId: 'S-B1',
			dimension: 'authenticity',
			reason:
				'S-B2 pairs simulated-but-messy data with genuine open reasoning; S-B1 pairs real lab equipment with a fully scripted cookbook procedure — Authenticity must discriminate between the two, since real materials alone are not what the pillar measures.'
		}
	] satisfies PairedContrast[]
).map((c) => PairedContrastSchema.parse(c));
