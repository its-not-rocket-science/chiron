/**
 * Pure filter helpers for the shared library (Prompt 9). Kept out of
 * +page.server.ts because SvelteKit only allows specific named exports
 * (`load`, `actions`, ...) from a page server module — anything else
 * fails the production build's route analysis.
 */

export interface LibraryLessonRow {
	id: string;
	title: string;
	subject_profile_id: string;
	grade_level: string | null;
	visibility: 'org-shared' | 'public-template';
	featured: boolean;
	org_id: string | null;
	owner_id: string;
	profiles: { display_name: string } | null;
	lesson_versions: {
		scores: { dialogue_score: number; authenticity_score: number; mentoring_score: number } | null;
	} | null;
}

export function defaultFilters() {
	return {
		subjectProfileId: '',
		gradeLevel: '',
		minDialogue: 0,
		minAuthenticity: 0,
		minMentoring: 0
	};
}

export function parseFilters(url: URL) {
	return {
		subjectProfileId: url.searchParams.get('subject') ?? '',
		gradeLevel: url.searchParams.get('grade') ?? '',
		minDialogue: Number(url.searchParams.get('minDialogue') ?? 0),
		minAuthenticity: Number(url.searchParams.get('minAuthenticity') ?? 0),
		minMentoring: Number(url.searchParams.get('minMentoring') ?? 0)
	};
}

export function passesScoreFilter(
	row: Pick<LibraryLessonRow, 'lesson_versions'>,
	filters: ReturnType<typeof parseFilters>
): boolean {
	const scores = row.lesson_versions?.scores;
	if (!scores) {
		return filters.minDialogue === 0 && filters.minAuthenticity === 0 && filters.minMentoring === 0;
	}
	return (
		scores.dialogue_score >= filters.minDialogue &&
		scores.authenticity_score >= filters.minAuthenticity &&
		scores.mentoring_score >= filters.minMentoring
	);
}
