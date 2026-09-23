/**
 * `prompt.txt` Prompt G3 — the one place every error-monitoring report in
 * this app goes through, so the "never log raw lesson/student text, only
 * a sanitized name/message" discipline this codebase already applies to
 * `console.error` (rateLimit.ts, classifierCore.ts, tutorCore.ts, the
 * scoring route, org actions, the revise route) extends to Sentry with
 * the exact same guarantee, not a separately-trusted second copy of it.
 *
 * Deliberately takes an already-computed safe summary string, never the
 * raw `unknown` error value: every existing call site already reduces an
 * error down to `${err.name}: ${err.message}` (or an equivalent safe
 * string) before logging it, specifically because a vendor SDK error can
 * embed request context in its message/cause chain. `reportError` mirrors
 * that string to both `console.error` and Sentry identically — it cannot
 * accidentally forward more than the console already gets, because it
 * never has access to more than that in the first place.
 */
import * as Sentry from '@sentry/sveltekit';

/**
 * Matches the three alertable conditions `prompt.txt` Prompt G3 names
 * explicitly (repeated provider errors, the rate limiter's fail-open path
 * firing, an RLS/ownership denial spike) plus a catch-all — see
 * docs/OPERATIONS.md for the actual alert-rule configuration each tag is
 * meant to back.
 */
export type ErrorCategory = 'provider_error' | 'rate_limit_fail_open' | 'unexpected';

/**
 * Reports a caught exception (or exception-shaped failure) that was
 * already reduced to a safe summary string by the caller. Logs to
 * `console.error` exactly as before, and mirrors the identical string to
 * Sentry, tagged for alerting (docs/OPERATIONS.md).
 */
export function reportError(
	context: string,
	safeSummary: string,
	category: ErrorCategory = 'unexpected'
): void {
	console.error(`${context}:`, safeSummary);
	Sentry.captureMessage(`${context}: ${safeSummary}`, {
		level: 'error',
		tags: { chiron_category: category }
	});
}

/**
 * Reports an RLS/ownership denial — a request that reached an
 * authenticated route but was blocked from touching a specific resource
 * it doesn't own or isn't admin of (a non-owner's lesson delete, a
 * non-admin's invite revoke/lesson-feature toggle, a non-owner's revise
 * attempt — see docs/OPERATIONS.md for the exact call sites). Deliberately
 * takes no error object or request data at all: there is nothing to leak
 * by construction, since the only thing being reported is "this specific,
 * already-known denial happened," not any detail about the request itself.
 * A spike here can mean either an attack or a policy regression —
 * docs/OPERATIONS.md documents the alert rule this tag is meant to back.
 */
export function reportRlsDenial(context: string): void {
	console.warn(`${context}: blocked (RLS/ownership denial)`);
	Sentry.captureMessage(context, {
		level: 'warning',
		tags: { chiron_category: 'rls_denial' }
	});
}
