/**
 * `prompt.txt` Prompt G3, point 3: deterministic proof that Sentry.init's
 * dataCollection config actually disables the categories that matter for
 * this app — most importantly stackFrameVariables and genAI (see
 * hooks.server.ts's own comment for why those two specifically). Mocks
 * @sentry/sveltekit and $lib/server/env rather than requiring a real DSN.
 */
import { describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const sentryHandle = vi.fn(
	() =>
		(({ event, resolve }: { event: unknown; resolve: unknown }) =>
			(resolve as (e: unknown) => unknown)(event)) as never
);
const handleErrorWithSentry = vi.fn((fn: unknown) => fn);

vi.mock('@sentry/sveltekit', () => ({ init, sentryHandle, handleErrorWithSentry }));
vi.mock('$lib/server/env', () => ({
	env: { PUBLIC_SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1' }
}));

describe('hooks.server.ts Sentry init (prompt.txt Prompt G3)', () => {
	it('calls Sentry.init with tracing left off and the risky data-collection categories explicitly disabled', async () => {
		await import('./hooks.server');

		expect(init).toHaveBeenCalledTimes(1);
		const options = init.mock.calls[0][0];

		expect(options.dsn).toBe('https://example@o0.ingest.sentry.io/1');
		expect(options.tracesSampleRate).toBeUndefined();
		expect(options.sendDefaultPii).toBe(false);

		// The two categories whose default would otherwise send actual
		// lesson/student text or local-variable values to Sentry.
		expect(options.dataCollection.genAI).toEqual({ inputs: false, outputs: false });
		expect(options.dataCollection.stackFrameVariables).toBe(false);
		// Defense in depth on the rest — none of this app's request
		// cookies/headers/bodies should be collected either.
		expect(options.dataCollection.cookies).toBe(false);
		expect(options.dataCollection.httpHeaders).toBe(false);
		expect(options.dataCollection.httpBodies).toEqual([]);
		expect(options.dataCollection.databaseQueryData).toBe(false);
	});
});
