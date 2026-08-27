import { describe, expect, it } from 'vitest';
import { normalizeStructuredLesson } from './structuredLessonInput';

describe('normalizeStructuredLesson', () => {
	it('concatenates all four fields under labeled sections in order', () => {
		const text = normalizeStructuredLesson({
			objectives: 'Students will evaluate competing explanations for an anomaly.',
			teacherScript: 'What would make you doubt this result?',
			studentActivities: 'Small groups examine a dataset with an outlier.',
			assessment: 'Exit ticket: name one alternative explanation and how to test it.'
		});

		expect(text).toBe(
			[
				'[OBJECTIVES]',
				'Students will evaluate competing explanations for an anomaly.',
				'',
				'[TEACHER SCRIPT]',
				'What would make you doubt this result?',
				'',
				'[STUDENT ACTIVITIES]',
				'Small groups examine a dataset with an outlier.',
				'',
				'[ASSESSMENT]',
				'Exit ticket: name one alternative explanation and how to test it.'
			].join('\n')
		);
	});

	it('trims each field independently', () => {
		const text = normalizeStructuredLesson({
			objectives: '  padded objective  ',
			teacherScript: '\nkey question\n',
			studentActivities: '  activity  ',
			assessment: '  exit ticket  '
		});

		expect(text).toContain('[OBJECTIVES]\npadded objective\n');
		expect(text).toContain('[TEACHER SCRIPT]\nkey question\n');
		expect(text).toContain('[STUDENT ACTIVITIES]\nactivity\n');
		expect(text).toContain('[ASSESSMENT]\nexit ticket');
	});
});
