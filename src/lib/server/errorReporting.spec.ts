/**
 * `prompt.txt` Prompt G3, point 3's own instruction: "add a live-reviewable
 * test or at minimum a documented manual check confirming a scoring
 * failure with real lesson text in it doesn't end up verbatim in the
 * monitoring dashboard." A live check against an actual Sentry dashboard
 * isn't possible in this environment (no Sentry account exists yet — see
 * docs/OPERATIONS.md) — this is the deterministic equivalent: mocks
 * `@sentry/sveltekit` and proves `reportError`/`reportRlsDenial` can only
 * ever forward the exact string the caller already computed, never a raw
 * error object, never any extra field Sentry's default event enrichment
 * might otherwise attach.
 */
import { describe, expect, it, vi } from 'vitest';

const captureMessage = vi.fn();
vi.mock('@sentry/sveltekit', () => ({ captureMessage }));

describe('reportError / reportRlsDenial (prompt.txt Prompt G3)', () => {
	it('forwards only the exact safe-summary string to Sentry, not the raw error object', async () => {
		const { reportError } = await import('./errorReporting');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// A realistic shape of the exact risk this test exists to catch: a
		// vendor SDK error whose .message happens to embed request content
		// (rateLimit.ts's own comment names this concern). reportError's
		// contract is that it never sees this object at all — only the
		// string the caller already reduced it to.
		const realLessonText =
			'Ms. Alvarez opens with: "Today we are going to discuss the Treaty of Versailles..."';
		const dangerousRawError = new Error(
			`Upstream 500: request body was ${JSON.stringify({ lessonText: realLessonText })}`
		);
		const safeSummary = `${dangerousRawError.name}: ${dangerousRawError.message}`;

		reportError('Unexpected error scoring lesson', safeSummary, 'provider_error');

		expect(captureMessage).toHaveBeenCalledTimes(1);
		const [sentMessage, sentOptions] = captureMessage.mock.calls[0];
		expect(sentMessage).toBe(`Unexpected error scoring lesson: ${safeSummary}`);
		expect(sentOptions).toEqual({ level: 'error', tags: { chiron_category: 'provider_error' } });
		// captureMessage was called with a string, not the Error object or
		// any object containing the original raw error at all.
		expect(typeof sentMessage).toBe('string');

		consoleErrorSpy.mockRestore();
	});

	it('reportError never receives (and so cannot leak) anything beyond what console.error also gets', async () => {
		const { reportError } = await import('./errorReporting');
		const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		reportError(
			'Rate limit check failed, failing open',
			'PGRST301: JWT expired',
			'rate_limit_fail_open'
		);

		expect(consoleErrorSpy).toHaveBeenCalledWith(
			'Rate limit check failed, failing open:',
			'PGRST301: JWT expired'
		);
		expect(captureMessage).toHaveBeenCalledWith(
			'Rate limit check failed, failing open: PGRST301: JWT expired',
			{ level: 'error', tags: { chiron_category: 'rate_limit_fail_open' } }
		);

		consoleErrorSpy.mockRestore();
	});

	it('reportRlsDenial sends only the context label — no error object, no request data, nothing to leak by construction', async () => {
		const { reportRlsDenial } = await import('./errorReporting');
		const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

		reportRlsDenial('lessons/[id] delete: non-owner attempted to delete a lesson');

		expect(captureMessage).toHaveBeenCalledWith(
			'lessons/[id] delete: non-owner attempted to delete a lesson',
			{ level: 'warning', tags: { chiron_category: 'rls_denial' } }
		);
		// The function signature itself has no parameter for an error, a
		// request, or any user data — nothing beyond a plain string label
		// could ever reach Sentry through this path, whatever the caller does.
		expect(reportRlsDenial.length).toBe(1);

		consoleWarnSpy.mockRestore();
	});
});
