import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/lessons');
	if (!locals.supabase) return { lessons: [] };

	const { data } = await locals.supabase
		.from('lessons')
		.select('id, title, subject_profile_id, grade_level, visibility, created_at')
		.eq('owner_id', locals.user.id)
		.order('created_at', { ascending: false });

	return { lessons: data ?? [] };
};
