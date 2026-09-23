import { type HandleClientError } from '@sveltejs/kit';
import * as Sentry from '@sentry/sveltekit';
import { env } from '$env/dynamic/public';

/**
 * `prompt.txt` Prompt G3 — client-side half of error monitoring. Reads
 * `PUBLIC_SENTRY_DSN` directly from `$env/dynamic/public` rather than
 * `$lib/server/env` — that module also touches `$env/dynamic/private`,
 * which SvelteKit's own build-time guard forbids importing into
 * client-bundled code at all. Same optional "boots fine without it"
 * contract, same no-tracing/no-genAI-capture reasoning as
 * `hooks.server.ts` — see that file's own comment for the full
 * explanation (client-side has no direct provider calls to leak, but the
 * same conservative defaults are kept for consistency and in case that
 * ever changes).
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
			stackFrameVariables: false
		}
	});
}

export const handleError: HandleClientError = Sentry.handleErrorWithSentry(({ error }) => {
	const safeSummary =
		error instanceof Error ? `${error.name}: ${error.message}` : 'non-Error thrown';
	console.error('Unhandled client error:', safeSummary);
	return { message: 'Something went wrong. Please try again.' };
});
