/**
 * Zod schema for the Phase 2A user-test feedback form
 * (chiron_calibration_feedback_and_automation_prompts.txt, Section 2).
 * Kept separate from `practiceSchemas.ts` — this is testing
 * infrastructure, not part of the practice-case domain model itself.
 *
 * No names, no new demographic data — every field here is one of the
 * ten items the prompt names explicitly, nothing more.
 */
import { z } from 'zod';
import { FREE_TEXT_MAX_LENGTH } from './practiceSchemas';

const RatingSchema = z.number().int().min(1).max(5);

export const UpdateCriterionUnderstandableSchema = z.enum([
	'yes',
	'mostly',
	'no',
	'not_applicable'
]);
export type UpdateCriterionUnderstandable = z.infer<typeof UpdateCriterionUnderstandableSchema>;

export const UserTestFeedbackInputSchema = z.object({
	testCohort: z.string().min(1),
	casesUnderstandable: RatingSchema,
	tutorMadeThink: RatingSchema,
	newEvidenceMeaningful: RatingSchema,
	tutorRepetitive: RatingSchema,
	confidenceUnderstandable: RatingSchema,
	updateCriterionUnderstandable: UpdateCriterionUnderstandableSchema,
	perceivedSteering: z.boolean(),
	perceivedSteeringExplanation: z.string().max(FREE_TEXT_MAX_LENGTH).nullable().default(null),
	wouldContinue: z.boolean(),
	whatWorkedBest: z.string().max(FREE_TEXT_MAX_LENGTH).nullable().default(null),
	whatNeedsChanging: z.string().max(FREE_TEXT_MAX_LENGTH).nullable().default(null)
});
export type UserTestFeedbackInput = z.infer<typeof UserTestFeedbackInputSchema>;
