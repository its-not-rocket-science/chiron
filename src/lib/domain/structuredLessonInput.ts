/**
 * Normalizes the four-field structured lesson input (prompts.txt Prompt
 * P3) into the same single lessonText string the rest of the pipeline
 * already expects — normalization happens at this input boundary only;
 * scoreLesson's own interface is unchanged.
 */
export interface StructuredLessonFields {
	objectives: string;
	teacherScript: string;
	studentActivities: string;
	assessment: string;
}

export function normalizeStructuredLesson(fields: StructuredLessonFields): string {
	return [
		'[OBJECTIVES]',
		fields.objectives.trim(),
		'',
		'[TEACHER SCRIPT]',
		fields.teacherScript.trim(),
		'',
		'[STUDENT ACTIVITIES]',
		fields.studentActivities.trim(),
		'',
		'[ASSESSMENT]',
		fields.assessment.trim()
	].join('\n');
}
