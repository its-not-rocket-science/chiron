/**
 * `prompt.txt` Prompt G3, point 3: client-side counterpart to
 * hooks.server.spec.ts — proves the client init config also keeps
 * tracing off and the risky data-collection categories disabled.
 */
import { describe, expect, it, vi } from 'vitest';

const init = vi.fn();
const handleErrorWithSentry = vi.fn((fn: unknown) => fn);

vi.mock('@sentry/sveltekit', () => ({ init, handleErrorWithSentry }));
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_SENTRY_DSN: 'https://example@o0.ingest.sentry.io/1' }
}));

describe('hooks.client.ts Sentry init (prompt.txt Prompt G3)', () => {
	it('calls Sentry.init with tracing left off and the risky data-collection categories explicitly disabled', async () => {
		await import('./hooks.client');

		expect(init).toHaveBeenCalledTimes(1);
		const options = init.mock.calls[0][0];

		expect(options.dsn).toBe('https://example@o0.ingest.sentry.io/1');
		expect(options.tracesSampleRate).toBeUndefined();
		expect(options.sendDefaultPii).toBe(false);
		expect(options.dataCollection.stackFrameVariables).toBe(false);
		expect(options.dataCollection.cookies).toBe(false);
		expect(options.dataCollection.httpHeaders).toBe(false);
		expect(options.dataCollection.httpBodies).toEqual([]);
	});
});
