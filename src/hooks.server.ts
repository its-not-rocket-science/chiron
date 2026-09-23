import { createServerClient } from '@supabase/ssr';
import { type Handle, type HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$lib/server/env';

/**
 * `prompt.txt` Prompt G3 — error monitoring. Optional, same "app boots
 * fine without it configured" contract as Supabase/DeepSeek/Anthropic
 * (see env.ts) — `Sentry.init` below simply never runs when
 * `PUBLIC_SENTRY_DSN` is unset, and the SDK's own captureException/
 * captureMessage calls are documented as safe no-ops when uninitialized.
 *
 * Deliberately no `tracesSampleRate` (no performance/APM tracing) — this
 * is the single most load-bearing decision here, not an oversight:
 * enabling tracing pulls in Sentry's Node SDK's "auto performance
 * integrations," which includes `openAIIntegration()` — auto-instruments
 * the `openai` package this app already uses for DeepSeek scoring/
 * classification/tutoring, and its `dataCollection.genAI` defaults to
 * `{ inputs: true, outputs: true }`. Enabling tracing would mean actual
 * lesson text, student practice free-text, and raw model responses get
 * sent to Sentry by default — exactly the leak this prompt's own
 * instruction warns to guard against. Leaving tracing off avoids that
 * whole integration being loaded at all, rather than relying solely on
 * `dataCollection` below to catch it after the fact.
 *
 * `dataCollection` below is still set explicitly, as real defense in
 * depth (a future change enabling tracing, or a newer SDK version
 * changing its defaults, shouldn't silently reopen this):
 * `stackFrameVariables: false` specifically matters for this app — a
 * caught exception's stack frame can have `lessonText`/`freeText` as a
 * local variable in scope, and Sentry's local-variable capture would
 * otherwise send its actual value, not just a stack trace line.
 */
if (env.PUBLIC_SENTRY_DSN) {
	Sentry.init({
		dsn: env.PUBLIC_SENTRY_DSN,
		sendDefaultPii: false,
		dataCollection: {
			userInfo: false,
			cookies: false,
			httpHeaders: false,
			httpBodies: [],
			urlQueryParams: false,
			databaseQueryData: false,
			stackFrameVariables: false,
			genAI: { inputs: false, outputs: false }
		}
	});
}

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

// sentryHandle() first so it wraps request isolation/tracing context
// around everything after it — Sentry's own documented ordering. A no-op
// pass-through when Sentry.init was never called above (no DSN).
export const handle: Handle = sequence(
	Sentry.sentryHandle(),
	attachSupabase,
	populateSessionLocals
);

/**
 * Catches an exception that escaped every route's own try/catch and
 * SvelteKit's default handling was about to turn into a generic 500 —
 * genuinely unexpected, not the routine "provider failed, logged and
 * degraded gracefully" paths `errorReporting.ts`'s `reportError` already
 * covers. `handleErrorWithSentry` reports it (respecting this file's
 * `dataCollection` scrubbing above) and this still returns SvelteKit's
 * own safe, generic shape to the client — never the raw error message.
 */
export const handleError: HandleServerError = Sentry.handleErrorWithSentry(({ error }) => {
	const safeSummary =
		error instanceof Error ? `${error.name}: ${error.message}` : 'non-Error thrown';
	console.error('Unhandled server error:', safeSummary);
	return { message: 'Something went wrong. Please try again.' };
});
