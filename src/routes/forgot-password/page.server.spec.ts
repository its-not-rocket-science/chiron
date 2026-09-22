import { describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from './$types';
import { actions } from './+page.server';

/**
 * prompt.txt Prompt F3: proves the property tests/rls/passwordReset.integration.spec.ts
 * deliberately doesn't — that forgot-password's action can't leak whether
 * an email belongs to a real account — deterministically rather than
 * against live (rate-limited, environment-dependent) Supabase email
 * sending. The action discards resetPasswordForEmail's result entirely,
 * so it returns the same thing whether that call succeeds or fails.
 */
function makeEvent(email: string, supabaseAuthResult: { error: { message: string } | null }) {
	const resetPasswordForEmail = vi.fn().mockResolvedValue(supabaseAuthResult);
	const event = {
		request: {
			formData: async () => {
				const fd = new FormData();
				fd.set('email', email);
				return fd;
			}
		},
		locals: { supabase: { auth: { resetPasswordForEmail } } },
		url: new URL('http://localhost/forgot-password')
	} as unknown as RequestEvent;
	return { event, resetPasswordForEmail };
}

describe('forgot-password action — never reveals whether the email is registered', () => {
	it('returns the same success response when the underlying call succeeds', async () => {
		const { event } = makeEvent('real@example.com', { error: null });
		const result = await actions.default(event);
		expect(result).toEqual({ success: true });
	});

	it('returns the same success response when the underlying call errors', async () => {
		const { event } = makeEvent('nonexistent@example.com', {
			error: { message: 'Error sending recovery email' }
		});
		const result = await actions.default(event);
		expect(result).toEqual({ success: true });
	});

	it('calls resetPasswordForEmail with the submitted address, redirecting back to /reset-password', async () => {
		const { event, resetPasswordForEmail } = makeEvent('someone@example.com', { error: null });
		await actions.default(event);
		expect(resetPasswordForEmail).toHaveBeenCalledWith('someone@example.com', {
			redirectTo: 'http://localhost/reset-password'
		});
	});
});
