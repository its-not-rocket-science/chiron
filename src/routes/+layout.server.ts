import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

/**
 * Supabase's email confirmation link (PKCE flow) already marks the email
 * confirmed server-side, then redirects back into the app with
 * `?code=...` — but confirming the email and establishing a browser
 * session are two separate steps, and nothing was exchanging this code
 * for one. A user clicking "Confirm your email" landed back on the site
 * signed out, with a stray `?code=...` in the address bar and no sign
 * anything happened, even though their account was already fully
 * confirmed underneath (found investigating a live production report of
 * "signup seems broken").
 *
 * Handled here, in the root layout load — which every route's request
 * passes through — rather than a dedicated `/auth/callback` route, so
 * `emailRedirectTo` (signup's own action) can keep pointing at whatever
 * same-site path it already did without adding a new URL to Supabase's
 * Redirect URLs allowlist (a previous, separate fix already needed that
 * dashboard-side change once — see signup's own comment).
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	const code = url.searchParams.get('code');
	if (code && locals.supabase) {
		await locals.supabase.auth.exchangeCodeForSession(code);
		const cleanUrl = new URL(url);
		cleanUrl.searchParams.delete('code');
		throw redirect(303, `${cleanUrl.pathname}${cleanUrl.search}`);
	}

	return {
		session: locals.session,
		user: locals.user ? { id: locals.user.id, email: locals.user.email ?? null } : null
	};
};
