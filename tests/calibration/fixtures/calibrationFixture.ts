/**
 * Typed/Zod-validated shape for a scorer-calibration fixture
 * (`chiron_calibration_feedback_and_automation_prompts.txt` Prompts
 * M2/M4). A fixture asserts a BAND (min-max range, tolerating the
 * one-point variance `docs/SCORER_CALIBRATION.md`'s A1 repeatability
 * data shows is normal for an LLM-graded rubric) per pillar it has an
 * opinion about, a `covered` expectation per skill it has an opinion
 * about, and — separately — a small set of named `hardInvariants` for
 * the specific, non-negotiable findings the manual calibration pass
 * actually flagged as real failures (e.g. "a supplied conclusion must
 * never score Inference covered"). The two are deliberately different
 * strictness levels: landing outside a pillar band is WARN-worthy
 * (plausible variance) unless a hard invariant makes the same claim
 * explicit, in which case it's a hard FAIL — never assert exact scores
 * (`docs/SCORER_CALIBRATION.md`'s explicit reasoning for why).
 *
 * Not every fixture needs an opinion about every pillar or every
 * skill — omit what the fixture isn't designed to test, don't invent a
 * band/expectation just to fill the array.
 */
import { z } from 'zod';
import {
	CTSkillIdSchema,
	PillarIdSchema,
	RubricScoreSchema
} from '../../../src/lib/domain/schemas';

export const SubjectProfileIdSchema = z.enum(['science-lab', 'history-essay']);
export type FixtureSubjectProfileId = z.infer<typeof SubjectProfileIdSchema>;

export const PillarBandSchema = z
	.object({
		pillar: PillarIdSchema,
		min: RubricScoreSchema,
		max: RubricScoreSchema
	})
	.refine((b) => b.min <= b.max, { message: 'band min must be <= max', path: ['max'] });
export type PillarBand = z.infer<typeof PillarBandSchema>;

export const SkillExpectationSchema = z.object({
	skill: CTSkillIdSchema,
	/** `'either'` means the fixture has no opinion for this skill but still wants its state captured/reported. */
	covered: z.union([z.literal(true), z.literal(false), z.literal('either')])
});
export type SkillExpectation = z.infer<typeof SkillExpectationSchema>;

/**
 * A single, named, non-negotiable rule — violating one of these is a
 * hard FAIL regardless of how close the actual value is, distinct from
 * the softer band/expectation checks above. `reason` is required and
 * shows up verbatim in the report, so a FAIL is self-explanatory
 * without needing to cross-reference this file.
 */
export const HardInvariantSchema = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('pillarMax'),
		pillar: PillarIdSchema,
		max: RubricScoreSchema,
		reason: z.string().min(1)
	}),
	z.object({
		type: z.literal('pillarMin'),
		pillar: PillarIdSchema,
		min: RubricScoreSchema,
		reason: z.string().min(1)
	}),
	z.object({
		type: z.literal('skillCovered'),
		skill: CTSkillIdSchema,
		mustBe: z.boolean(),
		reason: z.string().min(1)
	})
]);
export type HardInvariant = z.infer<typeof HardInvariantSchema>;

export const CalibrationFixtureSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	subjectProfileId: SubjectProfileIdSchema,
	lessonText: z.string().min(1),
	/** Why this fixture exists and what it's designed to discriminate — shown in reports, not sent to the model. */
	rationale: z.string().min(1),
	pillarBands: z.array(PillarBandSchema),
	skillExpectations: z.array(SkillExpectationSchema),
	hardInvariants: z.array(HardInvariantSchema).default([])
});
export type CalibrationFixture = z.infer<typeof CalibrationFixtureSchema>;

/**
 * A named comparison between two already-defined fixture ids — "the
 * `strongerId` fixture's score/skill-state for `dimension` must exceed
 * `weakerId`'s" (`chiron_calibration_..._prompts.txt` Prompt M4(h)).
 * Checked by the evaluator after both fixtures have real results, not
 * something either fixture declares about itself — a contrast is a
 * property of the *pair*, and paired relationships are often more
 * robust signal than either fixture's absolute score.
 */
export const PairedContrastSchema = z.object({
	id: z.string().min(1),
	strongerId: z.string().min(1),
	weakerId: z.string().min(1),
	dimension: z.union([PillarIdSchema, CTSkillIdSchema]),
	reason: z.string().min(1)
});
export type PairedContrast = z.infer<typeof PairedContrastSchema>;

/**
 * One prompt-injection probe: a single honest, weak `baseLessonText`
 * plus several `variants` that embed a different injection attack
 * shape into essentially the same weak lesson. The evaluator's job is
 * comparing each variant's result back against the base's — "no
 * material score change attributable to the injected instructions" —
 * not checking either fixture's absolute score against a target band.
 */
export const InjectionVariantSchema = z.object({
	name: z.string().min(1),
	/** The full lesson text a real submission would contain — the injection embedded in place, not appended as an obviously separate block. */
	lessonText: z.string().min(1)
});
export type InjectionVariant = z.infer<typeof InjectionVariantSchema>;

export const InjectionFixtureSchema = z.object({
	id: z.string().min(1),
	title: z.string().min(1),
	subjectProfileId: SubjectProfileIdSchema,
	baseLessonText: z.string().min(1),
	rationale: z.string().min(1),
	variants: z.array(InjectionVariantSchema).min(1)
});
export type InjectionFixture = z.infer<typeof InjectionFixtureSchema>;
