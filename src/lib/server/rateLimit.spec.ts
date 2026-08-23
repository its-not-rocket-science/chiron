import { describe, expect, it } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('checkRateLimit', () => {
	it('allows requests up to the limit within the window', () => {
		const key = `test-${crypto.randomUUID()}`;
		for (let i = 0; i < 5; i++) {
			expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
		}
	});

	it('blocks the request once the limit is exceeded', () => {
		const key = `test-${crypto.randomUUID()}`;
		for (let i = 0; i < 3; i++) checkRateLimit(key, 3, 60_000);
		const result = checkRateLimit(key, 3, 60_000);
		expect(result.allowed).toBe(false);
		expect(result.retryAfterSeconds).toBeGreaterThan(0);
	});

	it('tracks different keys independently', () => {
		const keyA = `test-a-${crypto.randomUUID()}`;
		const keyB = `test-b-${crypto.randomUUID()}`;
		for (let i = 0; i < 3; i++) checkRateLimit(keyA, 3, 60_000);
		expect(checkRateLimit(keyA, 3, 60_000).allowed).toBe(false);
		expect(checkRateLimit(keyB, 3, 60_000).allowed).toBe(true);
	});

	it('allows requests again once the window has passed', () => {
		const key = `test-${crypto.randomUUID()}`;
		expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
		expect(checkRateLimit(key, 1, 10).allowed).toBe(false);
		return new Promise<void>((resolve) => {
			setTimeout(() => {
				expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
				resolve();
			}, 20);
		});
	});
});
