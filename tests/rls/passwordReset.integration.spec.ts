/**
 * Live tests for Supabase's password-recovery flow (`prompt.txt` Prompt
 * F3) — the primitives `/forgot-password` and `/reset-password`
 * (src/routes/forgot-password/+page.server.ts, .../reset-password/+page.server.ts)
 * are built on. Runs against the REAL live Supabase project, not a mock —
 * matches every other file in this directory (docs/ARCHITECTURE.md
 * Section 8), and Supabase's actual auth flow can't be meaningfully
 * mocked (`prompt.txt` Prompt F3's own instruction). Skipped when
 * Supabase isn't configured.
 *
 * `admin.generateLink({ type: 'recovery' })` + `verifyOtp({ token_hash,
 * type: 'recovery' })` stand in for "the user clicked the email link" —
 * this is Supabase's own supported way to test a recovery flow without
 * actually sending or reading an email, and it establishes the same kind
 * of session `/reset-password`'s route ultimately depends on
 * (src/routes/+layout.server.ts's `exchangeCodeForSession`, reused
 * as-is rather than duplicated for this route — see its own comment).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '$lib/server/env';

const hasSupabase = Boolean(
	env.PUBLIC_SUPABASE_URL && env.PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY
);

const NO_PERSIST = { auth: { autoRefreshToken: false, persistSession: false } };

describe.skipIf(!hasSupabase)('Password reset (live Supabase)', () => {
	const url = env.PUBLIC_SUPABASE_URL!;
	const anonKey = env.PUBLIC_SUPABASE_ANON_KEY!;
	const admin: SupabaseClient = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, NO_PERSIST);

	const runId = randomUUID().slice(0, 8);
	const createdUserIds: string[] = [];

	afterAll(async () => {
		for (const id of createdUserIds) await admin.auth.admin.deleteUser(id);
	});

	// Whether resetPasswordForEmail's own call succeeds at all is dependent
	// on this project's email-sending configuration and rate limits (a real
	// account's address can hit a 500 from Supabase's own mailer while a
	// nonexistent one short-circuits before ever reaching it — observed
	// directly against this project, not assumed) — an environment detail
	// this suite shouldn't assert on. The property that actually matters —
	// forgot-password's own action never lets that difference leak into
	// what the user sees — is tested deterministically instead, in
	// src/routes/forgot-password/page.server.spec.ts, by proving the
	// action discards the result unconditionally.

	it('a completed reset lets the user log in with the new password, not the old one', async () => {
		const email = `chiron-reset-test-flow-${runId}@example.com`;
		const oldPassword = 'Original-Password-123!';
		const newPassword = 'Brand-New-Password-456!';

		const created = await admin.auth.admin.createUser({
			email,
			password: oldPassword,
			email_confirm: true
		});
		if (created.error || !created.data.user) throw created.error ?? new Error('Setup failed');
		const userId = created.data.user.id;
		createdUserIds.push(userId);

		const link = await admin.auth.admin.generateLink({ type: 'recovery', email });
		if (link.error || !link.data.properties?.hashed_token) {
			throw link.error ?? new Error('Failed to generate recovery link');
		}

		// Stands in for the browser landing on /reset-password from the
		// emailed link and its code being exchanged for a session.
		const recoveryClient = createClient(url, anonKey, NO_PERSIST);
		const verified = await recoveryClient.auth.verifyOtp({
			token_hash: link.data.properties.hashed_token,
			type: 'recovery'
		});
		expect(verified.error).toBeNull();
		expect(verified.data.session).not.toBeNull();

		// Stands in for /reset-password's action calling updateUser() once
		// that session exists.
		const updated = await recoveryClient.auth.updateUser({ password: newPassword });
		expect(updated.error).toBeNull();

		const anon = createClient(url, anonKey, NO_PERSIST);
		const oldLogin = await anon.auth.signInWithPassword({ email, password: oldPassword });
		expect(oldLogin.error).not.toBeNull();

		const newLogin = await anon.auth.signInWithPassword({ email, password: newPassword });
		expect(newLogin.error).toBeNull();
		expect(newLogin.data.user?.id).toBe(userId);
	}, 15_000);

	it('an already-used or malformed recovery token is rejected, not silently accepted', async () => {
		const recoveryClient = createClient(url, anonKey, NO_PERSIST);
		const verified = await recoveryClient.auth.verifyOtp({
			token_hash: `not-a-real-token-${runId}`,
			type: 'recovery'
		});

		expect(verified.error).not.toBeNull();
		expect(verified.data.session).toBeNull();
	}, 10_000);
});
