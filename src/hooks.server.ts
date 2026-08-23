import { createServerClient } from '@supabase/ssr';
import { type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { env } from '$lib/server/env';

/**
 * Populates `event.locals.supabase` with a request-scoped Supabase client
 * bound to this request's auth cookies, so every server-side query runs as
 * the signed-in user — RLS is the real access-control gate (ADR-002), not
 * anything this hook decides. Left null when Supabase isn't configured
 * (see README "Local dev setup") so the app still boots without it;
 * routes that need auth check for null and respond accordingly.
 */
const attachSupabase: Handle = async ({ event, resolve }) => {
	if (!env.PUBLIC_SUPABASE_URL || !env.PUBLIC_SUPABASE_ANON_KEY) {
		event.locals.supabase = null;
		event.locals.safeGetSession = async () => ({ session: null, user: null });
	} else {
		const supabaseUrl = env.PUBLIC_SUPABASE_URL;
		const supabaseAnonKey = env.PUBLIC_SUPABASE_ANON_KEY;

		event.locals.supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
			cookies: {
				getAll: () => event.cookies.getAll(),
				setAll: (cookiesToSet) => {
					cookiesToSet.forEach(({ name, value, options }) => {
						event.cookies.set(name, value, { ...options, path: '/' });
					});
				}
			}
		});

		event.locals.safeGetSession = async () => {
			const supabase = event.locals.supabase;
			if (!supabase) return { session: null, user: null };

			const {
				data: { session }
			} = await supabase.auth.getSession();
			if (!session) return { session: null, user: null };

			// getUser() re-validates the JWT against Supabase Auth rather than
			// trusting the (client-writable) session cookie's claims as-is.
			const {
				data: { user },
				error
			} = await supabase.auth.getUser();
			if (error) return { session: null, user: null };

			return { session, user };
		};
	}

	return resolve(event, {
		filterSerializedResponseHeaders: (name) =>
			name === 'content-range' || name === 'x-supabase-api-version'
	});
};

const populateSessionLocals: Handle = async ({ event, resolve }) => {
	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;
	return resolve(event);
};

export const handle: Handle = sequence(attachSupabase, populateSessionLocals);
